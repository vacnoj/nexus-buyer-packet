import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export type LookupRequest = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type LookupField<T> = {
  value: T;
  source: "listing" | "public-records" | "estimated" | "manual" | "census" | null;
};

export type LookupPhoto = {
  url: string;
  caption: string;
};

export type SaleHistoryEntry = {
  year: string;
  event: string;
  price: number;
};

export type LookupResponse = {
  found: boolean;
  message?: string;
  provider?: string;
  cached?: boolean;
  data?: {
    beds?: LookupField<string>;
    baths?: LookupField<string>;
    sqft?: LookupField<string>;
    yearBuilt?: LookupField<string>;
    listPrice?: LookupField<number>;
    annualPropertyTax?: LookupField<number>;
    taxYear?: LookupField<string>;
    annualInsurance?: LookupField<number>;
    monthlyHoa?: LookupField<number>;
    areaSummary?: LookupField<string>;
    lastSalePrice?: LookupField<number>;
    lastSaleDate?: LookupField<string>;
    saleHistory?: LookupField<SaleHistoryEntry[]>;
    photos?: LookupPhoto[];
  };
};

type RentCastTaxEntry = { total?: number; year?: number };

type RentCastHistoryEntry = {
  event?: string;
  price?: number;
  date?: string;
};

type RentCastProperty = {
  id?: string;
  formattedAddress?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  lotSize?: number;
  propertyType?: string;
  county?: string;
  subdivision?: string;
  hoa?: { fee?: number } | null;
  features?: { unitCount?: number } | null;
  propertyTaxes?: Record<string, RentCastTaxEntry>;
  taxAssessments?: Record<string, { value?: number }>;
  lastSalePrice?: number;
  lastSaleDate?: string;
  history?: Record<string, RentCastHistoryEntry>;
};

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "property-lookup.json");

type CacheShape = Record<string, { fetchedAt: string; response: LookupResponse }>;

function cacheKey(req: LookupRequest): string {
  return `${req.street}|${req.zip}`.toLowerCase().replace(/\s+/g, " ").trim();
}

async function readCache(): Promise<CacheShape> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

async function writeCache(cache: CacheShape): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function fetchCensusZipDemographics(zip: string): Promise<string | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const url = `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E,B25077_001E,B01003_001E&for=zip%20code%20tabulation%20area:${zip}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as string[][];
    if (!Array.isArray(json) || json.length < 2) return null;
    const [, row] = json;
    const [medIncomeStr, medHomeValStr, popStr] = row;
    const medIncome = Number(medIncomeStr);
    const medHomeVal = Number(medHomeValStr);
    const pop = Number(popStr);
    const parts: string[] = [];
    if (Number.isFinite(pop) && pop > 0) {
      parts.push(`Population ~${pop.toLocaleString()}`);
    }
    if (Number.isFinite(medIncome) && medIncome > 0) {
      parts.push(`median household income $${medIncome.toLocaleString()}`);
    }
    if (Number.isFinite(medHomeVal) && medHomeVal > 0) {
      parts.push(`median home value $${medHomeVal.toLocaleString()}`);
    }
    if (parts.length === 0) return null;
    return `ZIP ${zip} (Census ACS 2022): ${parts.join("; ")}.`;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as LookupRequest;

  if (!body.street || !body.zip) {
    return NextResponse.json<LookupResponse>(
      { found: false, message: "Street and ZIP are required." },
      { status: 400 },
    );
  }

  const key = cacheKey(body);
  const cache = await readCache();
  if (cache[key]) {
    return NextResponse.json<LookupResponse>({
      ...cache[key].response,
      cached: true,
      message: `${cache[key].response.message ?? ""} (from local cache)`.trim(),
    });
  }

  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    return NextResponse.json<LookupResponse>({
      found: false,
      message:
        "Property lookup not configured (missing RENTCAST_API_KEY in .env.local).",
    });
  }

  const fullAddress = [body.street, body.city, body.state, body.zip]
    .filter(Boolean)
    .join(", ");
  const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(fullAddress)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json<LookupResponse>({
      found: false,
      provider: "rentcast",
      message: `Network error reaching RentCast: ${err instanceof Error ? err.message : "unknown"}.`,
    });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json<LookupResponse>({
      found: false,
      provider: "rentcast",
      message: `RentCast returned ${upstream.status}${text ? `: ${text.slice(0, 200)}` : ""}.`,
    });
  }

  const payload = (await upstream.json()) as RentCastProperty[] | RentCastProperty;
  const records = Array.isArray(payload) ? payload : [payload];
  const rec = records[0];

  if (!rec || (rec.bedrooms == null && rec.squareFootage == null && rec.yearBuilt == null)) {
    const noResp: LookupResponse = {
      found: false,
      provider: "rentcast",
      message:
        "No property record found for this address. Fill the fields below manually.",
    };
    cache[key] = { fetchedAt: new Date().toISOString(), response: noResp };
    await writeCache(cache);
    return NextResponse.json<LookupResponse>(noResp);
  }

  const data: NonNullable<LookupResponse["data"]> = {};

  if (rec.bedrooms != null) {
    data.beds = { value: String(rec.bedrooms), source: "public-records" };
  }
  if (rec.bathrooms != null) {
    data.baths = { value: String(rec.bathrooms), source: "public-records" };
  }
  if (rec.squareFootage != null) {
    data.sqft = { value: String(rec.squareFootage), source: "public-records" };
  }
  if (rec.yearBuilt != null) {
    data.yearBuilt = {
      value: String(rec.yearBuilt),
      source: "public-records",
    };
  }

  let mostRecentTaxYear: string | null = null;
  if (rec.propertyTaxes) {
    const years = Object.keys(rec.propertyTaxes)
      .filter((y) => /^\d{4}$/.test(y))
      .sort((a, b) => Number(b) - Number(a));
    for (const yr of years) {
      const total = rec.propertyTaxes[yr]?.total;
      if (typeof total === "number" && total > 0) {
        data.annualPropertyTax = { value: total, source: "public-records" };
        data.taxYear = { value: yr, source: "public-records" };
        mostRecentTaxYear = yr;
        break;
      }
    }
  }

  if (rec.hoa?.fee != null) {
    data.monthlyHoa = { value: rec.hoa.fee, source: "public-records" };
  }

  if (typeof rec.lastSalePrice === "number" && rec.lastSalePrice > 0) {
    data.lastSalePrice = {
      value: rec.lastSalePrice,
      source: "public-records",
    };
  }
  if (rec.lastSaleDate) {
    data.lastSaleDate = { value: rec.lastSaleDate, source: "public-records" };
  }

  if (rec.history && typeof rec.history === "object") {
    const entries: SaleHistoryEntry[] = [];
    for (const [dateKey, entry] of Object.entries(rec.history)) {
      if (typeof entry?.price === "number" && entry.price > 0) {
        const yearMatch = (entry.date ?? dateKey).match(/^\d{4}/);
        entries.push({
          year: yearMatch ? yearMatch[0] : dateKey.slice(0, 4),
          event: entry.event ?? "Sale",
          price: entry.price,
        });
      }
    }
    entries.sort((a, b) => Number(b.year) - Number(a.year));
    if (entries.length > 0) {
      data.saleHistory = { value: entries, source: "public-records" };
    }
  }

  const summaryParts: string[] = [];
  if (
    rec.subdivision &&
    !/metes\s*and\s*bounds/i.test(rec.subdivision)
  ) {
    summaryParts.push(`Subdivision: ${rec.subdivision}.`);
  }
  if (rec.county) summaryParts.push(`${rec.county} County.`);
  if (rec.lotSize) {
    const acres = rec.lotSize / 43560;
    summaryParts.push(
      `Lot size: ${rec.lotSize.toLocaleString()} sq ft (${acres.toFixed(2)} acres).`,
    );
  }
  const censusLine = await fetchCensusZipDemographics(body.zip);
  if (censusLine) summaryParts.push(censusLine);

  if (summaryParts.length > 0) {
    data.areaSummary = {
      value: summaryParts.join(" "),
      source: "public-records",
    };
  }

  const messageBits = ["Property record found via public records (RentCast)."];
  if (mostRecentTaxYear) {
    messageBits.push(`Most recent tax year on file: ${mostRecentTaxYear}.`);
  }

  const response: LookupResponse = {
    found: true,
    provider: "rentcast",
    message: messageBits.join(" "),
    data,
  };

  cache[key] = { fetchedAt: new Date().toISOString(), response };
  await writeCache(cache);

  return NextResponse.json<LookupResponse>(response);
}
