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
    lotSize?: LookupField<string>;
    demographics?: LookupField<string>;
    floodZone?: LookupField<string>;
    nearbyAmenities?: LookupField<string>;
    parksOutdoors?: LookupField<string>;
    commute?: LookupField<string>;
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

// Local file cache to avoid burning RentCast quota during dev.
// Disabled in production (Vercel filesystem is read-only) — writes would
// throw EROFS and crash the route. Reads/writes are also wrapped in
// try/catch so any cache failure stays soft.
const CACHE_ENABLED = process.env.NODE_ENV !== "production";
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "property-lookup.json");

type CacheShape = Record<string, { fetchedAt: string; response: LookupResponse }>;

function cacheKey(req: LookupRequest): string {
  return `${req.street}|${req.zip}`.toLowerCase().replace(/\s+/g, " ").trim();
}

async function readCache(): Promise<CacheShape> {
  if (!CACHE_ENABLED) return {};
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

async function writeCache(cache: CacheShape): Promise<void> {
  if (!CACHE_ENABLED) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // Cache failure is non-fatal — just lose the speedup for this run.
  }
}

// ─── Google Maps + FEMA helpers ─────────────────────────────────

type LatLng = { lat: number; lng: number };

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    const loc = json.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}

const FLOOD_DESCRIPTIONS: Record<string, string> = {
  X: "Minimal risk",
  D: "Possible but undetermined risk",
  A: "1% annual flood (high risk)",
  AE: "1% annual flood (high risk)",
  AH: "Shallow flooding (high risk)",
  AO: "Shallow sheet flow flooding (high risk)",
  AR: "Reduced risk due to levee",
  V: "Coastal high hazard",
  VE: "Coastal high hazard",
};

async function fetchFemaFloodZone(coords: LatLng): Promise<string | null> {
  // FEMA NFHL public MapServer · Layer 28 = Flood Hazard Zones (free, no key)
  const url =
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?" +
    `geometry=${coords.lng},${coords.lat}` +
    "&geometryType=esriGeometryPoint&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY" +
    "&returnGeometry=false&f=json";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{ attributes?: { FLD_ZONE?: string; ZONE_SUBTY?: string } }>;
    };
    const attrs = json.features?.[0]?.attributes;
    if (!attrs?.FLD_ZONE) {
      // Outside all mapped flood hazard polygons → effectively Zone X (minimal risk)
      return "Zone X · Minimal risk (outside mapped flood hazard area)";
    }
    const zone = attrs.FLD_ZONE.trim().toUpperCase();
    const desc = FLOOD_DESCRIPTIONS[zone] ?? "";
    return desc ? `Zone ${zone} · ${desc}` : `Zone ${zone}`;
  } catch {
    return null;
  }
}

type PlaceResult = { name: string; distanceMiles: number };

function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function fetchNearbyPlaces(
  origin: LatLng,
  includedTypes: string[],
  radiusMeters: number,
  maxResults: number,
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.location",
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: maxResults,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: { latitude: origin.lat, longitude: origin.lng },
            radius: radiusMeters,
          },
        },
      }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        location?: { latitude: number; longitude: number };
      }>;
    };
    const out: PlaceResult[] = [];
    for (const p of json.places ?? []) {
      const name = p.displayName?.text;
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (!name || lat == null || lng == null) continue;
      out.push({
        name,
        distanceMiles: haversineMiles(origin, { lat, lng }),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function formatPlaces(places: PlaceResult[], max = 3): string {
  return places
    .slice(0, max)
    .map((p) => `${p.name} (${p.distanceMiles.toFixed(1)} mi)`)
    .join(" · ");
}

// Colorado-centric commute destinations. Tuned for Nikki's market;
// edit these per agent in the future.
const COMMUTE_DESTINATIONS = [
  { label: "Downtown Denver", coords: "39.7392,-104.9903" },
  { label: "DTC", coords: "39.6022,-104.8983" },
  { label: "DIA", coords: "39.8561,-104.6737" },
];

async function fetchCommuteTimes(origin: LatLng): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const destinations = COMMUTE_DESTINATIONS.map((d) => d.coords).join("|");
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json?" +
    `origins=${origin.lat},${origin.lng}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=driving&key=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      rows?: Array<{
        elements?: Array<{
          status?: string;
          duration?: { value?: number };
        }>;
      }>;
    };
    const elements = json.rows?.[0]?.elements ?? [];
    const parts = COMMUTE_DESTINATIONS.map((dest, i) => {
      const elem = elements[i];
      if (elem?.status !== "OK" || elem.duration?.value == null) return null;
      const minutes = Math.round(elem.duration.value / 60);
      return `${dest.label}: ${minutes} min`;
    }).filter((x): x is string => Boolean(x));
    if (parts.length === 0) return null;
    return parts.join(" · ");
  } catch {
    return null;
  }
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
      parts.push(`Median income $${medIncome.toLocaleString()}`);
    }
    if (Number.isFinite(medHomeVal) && medHomeVal > 0) {
      parts.push(`Median home value $${medHomeVal.toLocaleString()}`);
    }
    if (parts.length === 0) return null;
    return parts.join(" · ");
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

  if (rec.lotSize && rec.lotSize > 0) {
    const acres = rec.lotSize / 43560;
    const formatted =
      acres >= 0.1
        ? `${acres.toFixed(2)} acres (${rec.lotSize.toLocaleString()} sq ft)`
        : `${rec.lotSize.toLocaleString()} sq ft`;
    data.lotSize = { value: formatted, source: "public-records" };
  }

  // Run Census + Geocode in parallel — neither depends on the other.
  const [demoLine, coords] = await Promise.all([
    fetchCensusZipDemographics(body.zip),
    geocodeAddress(fullAddress),
  ]);

  if (demoLine) {
    data.demographics = { value: demoLine, source: "census" };
  }

  // Coords-dependent enrichments — flood zone, places, commute.
  // All in parallel; any failure is non-fatal.
  if (coords) {
    const [floodZone, amenities, parks, commute] = await Promise.all([
      fetchFemaFloodZone(coords),
      fetchNearbyPlaces(
        coords,
        ["supermarket", "grocery_store", "shopping_mall"],
        16093, // ~10 miles
        5,
      ),
      fetchNearbyPlaces(
        coords,
        ["park", "national_park", "state_park"],
        24140, // ~15 miles, parks tend to be farther in rural areas
        5,
      ),
      fetchCommuteTimes(coords),
    ]);

    if (floodZone) {
      data.floodZone = { value: floodZone, source: "public-records" };
    }
    if (amenities.length > 0) {
      data.nearbyAmenities = {
        value: formatPlaces(amenities, 3),
        source: "public-records",
      };
    }
    if (parks.length > 0) {
      data.parksOutdoors = {
        value: formatPlaces(parks, 3),
        source: "public-records",
      };
    }
    if (commute) {
      data.commute = { value: commute, source: "public-records" };
    }
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
