"use client";

import { useMemo, useRef, useState } from "react";
import {
  calculateMortgage,
  estimatedAnnualInsurance,
  formatCurrency,
  formatCurrencyCents,
} from "@/lib/mortgage";
import type {
  LookupResponse,
  SaleHistoryEntry,
} from "@/app/api/property-lookup/route";
import { useRouter } from "next/navigation";

type SourceTag = "listing" | "public-records" | "manual" | "estimated" | "unavailable";

function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type PropertyPhoto = { url: string; caption: string };

export type PropertyData = {
  street: string;
  city: string;
  state: string;
  zip: string;

  beds: string;
  baths: string;
  sqft: string;
  yearBuilt: string;
  lotSize: string;
  coverPhoto: string;
  photos: PropertyPhoto[];

  homePrice: number;
  downPaymentPct: number;
  interestRatePct: number;
  loanTermYears: number;
  pmiRatePct: number;

  annualPropertyTax: number | null;
  taxYear: string;
  taxSource: SourceTag;

  annualInsurance: number | null;
  insuranceSource: SourceTag;

  monthlyHoa: number;
  buyerName: string;
  agentName: string;

  // Agent / brokerage contact
  agentEmail: string;
  agentPhone: string;
  brokerage: string;

  // Area Overview (one-line strings; empty hides the card)
  schoolDistrict: string;
  walkability: string;
  floodZone: string;
  nearbyAmenities: string;
  parksOutdoors: string;
  commute: string;
  neighborhoodVibe: string;
  demographics: string;
  climate: string;

  // Property profile (empty hides the row)
  zoning: string;
  waterSewer: string;
  heatingCooling: string;
  specialTax: string;
  assignedSchools: string;
  agentNotes: string;

  // Market stats
  avgNeighborhoodPriceSqft: number;
  daysOnMarket: number;

  // Sale history (auto from RentCast where possible)
  lastSalePrice: number;
  lastSaleDate: string;
  priceHistory: SaleHistoryEntry[];

  // Listing status
  listingStatus: string;

  // Buyer-side checklist state (auto-saved by /buyer view).
  checklistDone: string[];
};

const DEFAULTS: PropertyData = {
  street: "",
  city: "",
  state: "",
  zip: "",
  beds: "",
  baths: "",
  sqft: "",
  yearBuilt: "",
  lotSize: "",
  coverPhoto: "",
  photos: [],
  homePrice: 0,
  downPaymentPct: 20,
  interestRatePct: 7.0,
  loanTermYears: 30,
  pmiRatePct: 0.5,
  annualPropertyTax: null,
  taxYear: "",
  taxSource: "manual",
  annualInsurance: null,
  insuranceSource: "estimated",
  monthlyHoa: 0,
  buyerName: "",
  agentName: "The NEXUS Team",
  agentEmail: "nikki@kw.com",
  agentPhone: "(303) 358-3537",
  brokerage: "Keller Williams DTC",
  schoolDistrict: "",
  walkability: "",
  floodZone: "",
  nearbyAmenities: "",
  parksOutdoors: "",
  commute: "",
  neighborhoodVibe: "",
  demographics: "",
  climate: "",
  zoning: "",
  waterSewer: "",
  heatingCooling: "",
  specialTax: "",
  assignedSchools: "",
  agentNotes: "",
  avgNeighborhoodPriceSqft: 0,
  daysOnMarket: 0,
  lastSalePrice: 0,
  lastSaleDate: "",
  priceHistory: [],
  listingStatus: "Active",
  checklistDone: [],
};

export type SaveHandler = (data: PropertyData) => Promise<{ ok: boolean; error?: string }>;

export type PropertyEditorProps = {
  initialData?: Partial<PropertyData>;
  onSave?: SaveHandler;
  backHref?: string;
  initialView?: "form" | "packet";
};

export default function PropertyEditor({
  initialData,
  onSave,
  backHref,
  initialView = "form",
}: PropertyEditorProps = {}) {
  const router = useRouter();
  const [data, setData] = useState<PropertyData>({ ...DEFAULTS, ...initialData });
  const [view, setView] = useState<"form" | "packet">(initialView);
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved" }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [lookupState, setLookupState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; message?: string; found: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function handleSave() {
    if (!onSave) return;
    setSaveState({ status: "saving" });
    const result = await onSave(data);
    if (result.ok) {
      setSaveState({ status: "saved" });
      router.refresh();
      setTimeout(() => setSaveState({ status: "idle" }), 2000);
    } else {
      setSaveState({ status: "error", message: result.error ?? "Save failed" });
    }
  }

  const effectiveInsurance = useMemo(() => {
    if (data.insuranceSource === "estimated" || data.annualInsurance == null) {
      return estimatedAnnualInsurance(data.homePrice);
    }
    return data.annualInsurance;
  }, [data.annualInsurance, data.homePrice, data.insuranceSource]);

  const breakdown = useMemo(
    () =>
      calculateMortgage({
        homePrice: data.homePrice,
        downPaymentPct: data.downPaymentPct,
        interestRatePct: data.interestRatePct,
        loanTermYears: data.loanTermYears,
        annualPropertyTax: data.annualPropertyTax ?? 0,
        annualInsurance: effectiveInsurance,
        monthlyHoa: data.monthlyHoa,
        pmiRatePct: data.pmiRatePct,
      }),
    [data, effectiveInsurance],
  );

  function update<K extends keyof PropertyData>(key: K, val: PropertyData[K]) {
    setData((prev) => ({ ...prev, [key]: val }));
  }

  async function lookupProperty() {
    setLookupState({ status: "loading" });
    try {
      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street: data.street,
          city: data.city,
          state: data.state,
          zip: data.zip,
        }),
      });
      const json = (await res.json()) as LookupResponse;

      if (json.found && json.data) {
        const d = json.data;
        setData((prev) => ({
          ...prev,
          beds: d.beds?.value ?? prev.beds,
          baths: d.baths?.value ?? prev.baths,
          sqft: d.sqft?.value ?? prev.sqft,
          yearBuilt: d.yearBuilt?.value ?? prev.yearBuilt,
          lotSize: d.lotSize?.value ?? prev.lotSize,
          demographics: d.demographics?.value || prev.demographics,
          homePrice: d.listPrice?.value ?? prev.homePrice,
          annualPropertyTax:
            d.annualPropertyTax?.value ?? prev.annualPropertyTax,
          taxYear: d.taxYear?.value ?? prev.taxYear,
          taxSource: d.annualPropertyTax
            ? d.annualPropertyTax.source === "listing"
              ? "listing"
              : "public-records"
            : "manual",
          annualInsurance:
            d.annualInsurance?.value ?? prev.annualInsurance,
          insuranceSource: d.annualInsurance ? "listing" : "estimated",
          monthlyHoa: d.monthlyHoa?.value ?? prev.monthlyHoa,
          photos: d.photos && d.photos.length > 0 ? d.photos : prev.photos,
          lastSalePrice: d.lastSalePrice?.value ?? prev.lastSalePrice,
          lastSaleDate: d.lastSaleDate?.value ?? prev.lastSaleDate,
          priceHistory:
            d.saleHistory?.value && d.saleHistory.value.length > 0
              ? d.saleHistory.value
              : prev.priceHistory,
        }));
      }

      setLookupState({
        status: "done",
        found: json.found,
        message: json.message,
      });
    } catch (err) {
      setLookupState({
        status: "error",
        message: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }

  if (view === "packet") {
    return (
      <Packet
        data={data}
        effectiveInsurance={effectiveInsurance}
        onBack={() => setView("form")}
      />
    );
  }

  return (
    <div className="bg-cream">

      <main className="mx-auto w-full max-w-4xl p-6 sm:p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            New buyer&rsquo;s packet
          </h1>
          <p className="text-ink-muted mt-1">
            Enter the property address. We&rsquo;ll look up what we can, then
            you fill in the rest.
          </p>
        </div>

        <Section title="Address" accent="purple">
          <Grid>
            <Field label="Street address" span={2}>
              <input
                className={inputCls}
                value={data.street}
                onChange={(e) => update("street", e.target.value)}
                placeholder="11044 Conestoga Place"
              />
            </Field>
            <Field label="City">
              <input
                className={inputCls}
                value={data.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Franktown"
              />
            </Field>
            <Field label="State">
              <input
                className={inputCls}
                value={data.state}
                onChange={(e) => update("state", e.target.value)}
                placeholder="CO"
              />
            </Field>
            <Field label="ZIP">
              <input
                className={inputCls}
                value={data.zip}
                onChange={(e) => update("zip", e.target.value)}
                placeholder="80116"
              />
            </Field>
          </Grid>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50"
              disabled={
                lookupState.status === "loading" || !data.street || !data.zip
              }
              onClick={lookupProperty}
            >
              {lookupState.status === "loading"
                ? "Looking up…"
                : "Look up property"}
            </button>
            <LookupStatus state={lookupState} />
          </div>
        </Section>

        <Section title="Property details" accent="orange">
          <Grid>
            <Field label="Beds">
              <input
                className={inputCls}
                value={data.beds}
                onChange={(e) => update("beds", e.target.value)}
              />
            </Field>
            <Field label="Baths">
              <input
                className={inputCls}
                value={data.baths}
                onChange={(e) => update("baths", e.target.value)}
              />
            </Field>
            <Field label="Sq ft">
              <input
                className={inputCls}
                value={data.sqft}
                onChange={(e) => update("sqft", e.target.value)}
              />
            </Field>
            <Field label="Year built">
              <input
                className={inputCls}
                value={data.yearBuilt}
                onChange={(e) => update("yearBuilt", e.target.value)}
              />
            </Field>
            <Field label="Lot size" hint="Auto-filled from public records on lookup.">
              <input
                className={inputCls}
                value={data.lotSize}
                onChange={(e) => update("lotSize", e.target.value)}
              />
            </Field>
          </Grid>
        </Section>

        <Section title="Photos" accent="purple">
          {/* Cover photo */}
          <div className="mb-6 pb-6 border-b border-line">
            <h3 className="font-semibold text-ink mb-1">Cover photo</h3>
            <p className="text-sm text-ink-muted mb-3">
              Replaces the decorative rings on the front cover. A dark
              gradient is added so the address text stays readable.
            </p>
            {data.coverPhoto ? (
              <div className="flex items-center gap-3 bg-cream-muted/40 border border-line rounded-md p-3 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.coverPhoto}
                  alt="Cover"
                  className="w-32 h-20 object-cover rounded border border-line flex-shrink-0"
                />
                <input
                  type="text"
                  className={`${inputCls} text-xs font-mono flex-1 min-w-0`}
                  value={data.coverPhoto}
                  onChange={(e) => update("coverPhoto", e.target.value)}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  onClick={() => update("coverPhoto", "")}
                  className="px-3 py-2 text-sm text-ink-muted hover:text-red-600 hover:bg-white rounded border border-line flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  className={`${inputCls} text-sm flex-1 min-w-[200px]`}
                  value=""
                  onChange={(e) => update("coverPhoto", e.target.value)}
                  placeholder="Paste cover photo URL"
                />
                <label className="px-4 py-2 rounded-md border border-line bg-white text-sm font-medium hover:bg-cream-muted cursor-pointer transition">
                  Upload cover
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => update("coverPhoto", r.result as string);
                      r.readAsDataURL(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <h3 className="font-semibold text-ink mb-1">Property photos</h3>
          <p className="text-sm text-ink-muted mb-3">
            Add as many photos as you want. Right-click any image on Zillow /
            Realtor.com / Redfin → Copy image link → paste below. Or upload from
            your computer. The first photo appears featured-large in the packet.
          </p>

          {data.photos.length > 0 && (
            <div className="space-y-2 mb-3">
              {data.photos.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-cream-muted/40 border border-line rounded-md p-2"
                >
                  {p.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.url}
                      alt={`Property photo ${i + 1}`}
                      className="w-16 h-16 object-cover rounded border border-line flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded border border-line border-dashed flex-shrink-0 flex items-center justify-center text-ink-muted text-xs">
                      —
                    </div>
                  )}
                  <input
                    type="text"
                    className={`${inputCls} text-xs font-mono flex-1 min-w-0`}
                    value={p.url}
                    onChange={(e) => {
                      const next = [...data.photos];
                      next[i] = { ...next[i], url: e.target.value };
                      update("photos", next);
                    }}
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        "photos",
                        data.photos.filter((_, j) => j !== i),
                      )
                    }
                    className="px-3 py-2 text-sm text-ink-muted hover:text-red-600 hover:bg-white rounded border border-line flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                update("photos", [
                  ...data.photos,
                  { url: "", caption: "" },
                ])
              }
              className="px-4 py-2 rounded-md bg-purple text-white text-sm font-medium hover:bg-purple-deep transition"
            >
              + Add photo URL
            </button>
            <label className="px-4 py-2 rounded-md border border-line bg-white text-sm font-medium hover:bg-cream-muted cursor-pointer transition">
              Upload from computer
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 0) return;
                  Promise.all(
                    files.map(
                      (f) =>
                        new Promise<string>((resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () => resolve(r.result as string);
                          r.onerror = reject;
                          r.readAsDataURL(f);
                        }),
                    ),
                  ).then((urls) => {
                    update("photos", [
                      ...data.photos,
                      ...urls.map((url) => ({ url, caption: "" })),
                    ]);
                  });
                  e.target.value = "";
                }}
              />
            </label>
            {data.photos.length > 1 && (
              <button
                type="button"
                onClick={() => update("photos", [])}
                className="px-3 py-2 text-sm text-ink-muted hover:text-red-600 hover:bg-cream-muted rounded border border-line"
              >
                Clear all
              </button>
            )}
          </div>

          {data.photos.length > 0 && (
            <p className="text-xs text-ink-muted mt-3">
              {data.photos.length} photo
              {data.photos.length === 1 ? "" : "s"} · First photo is featured
              large in the packet.
            </p>
          )}
        </Section>

        <Section title="Offer & loan" accent="purple">
          <Grid>
            <Field label="List / offer price">
              <NumberInput
                value={data.homePrice}
                onChange={(v) => update("homePrice", v)}
                prefix="$"
              />
            </Field>
            <Field label="Down payment %">
              <NumberInput
                value={data.downPaymentPct}
                onChange={(v) => update("downPaymentPct", v)}
                suffix="%"
              />
              <Slider
                value={data.downPaymentPct}
                onChange={(v) => update("downPaymentPct", v)}
                min={0}
                max={50}
                step={1}
                ticks={["0%", "20%", "50%"]}
              />
              <p className="text-xs text-ink-muted mt-1 tabular-nums">
                Down payment: {formatCurrency(
                  (data.homePrice * data.downPaymentPct) / 100,
                )}
              </p>
            </Field>
            <Field label="Interest rate %">
              <NumberInput
                value={data.interestRatePct}
                onChange={(v) => update("interestRatePct", v)}
                suffix="%"
                step={0.125}
              />
              <Slider
                value={data.interestRatePct}
                onChange={(v) => update("interestRatePct", v)}
                min={3}
                max={10}
                step={0.125}
                ticks={["3%", "6.5%", "10%"]}
              />
            </Field>
            <Field label="Loan term">
              <TermPicker
                value={data.loanTermYears}
                onChange={(v) => update("loanTermYears", v)}
              />
            </Field>
          </Grid>
        </Section>

        <Section title="Property tax" accent="orange">
          <Grid>
            <Field label="Source">
              <select
                className={inputCls}
                value={data.taxSource}
                onChange={(e) =>
                  update("taxSource", e.target.value as SourceTag)
                }
              >
                <option value="listing">From listing</option>
                <option value="public-records">From public records</option>
                <option value="manual">Manually entered</option>
                <option value="unavailable">Not available</option>
              </select>
            </Field>
            <Field label="Annual tax (prior year)">
              <NumberInput
                value={data.annualPropertyTax ?? 0}
                onChange={(v) => update("annualPropertyTax", v)}
                prefix="$"
                disabled={data.taxSource === "unavailable"}
              />
            </Field>
            <Field label="Tax year">
              <input
                className={inputCls}
                value={data.taxYear}
                onChange={(e) => update("taxYear", e.target.value)}
                placeholder="2024"
              />
            </Field>
          </Grid>
          {data.taxSource === "unavailable" && (
            <p className="mt-3 text-sm text-orange-deep bg-orange-soft border border-orange/40 rounded-md px-3 py-2">
              Prior-year tax info wasn&rsquo;t available. The packet will note
              this and prompt the buyer/agent to look it up from the county
              assessor.
            </p>
          )}
        </Section>

        <Section title="Insurance & HOA" accent="purple">
          <Grid>
            <Field label="Insurance source">
              <select
                className={inputCls}
                value={data.insuranceSource}
                onChange={(e) => {
                  const src = e.target.value as SourceTag;
                  update("insuranceSource", src);
                  if (src === "estimated") update("annualInsurance", null);
                }}
              >
                <option value="listing">From listing</option>
                <option value="manual">Manually entered</option>
                <option value="estimated">Estimated (0.35% / yr)</option>
              </select>
            </Field>
            <Field
              label="Annual insurance"
              hint={
                data.insuranceSource === "estimated"
                  ? `Auto: ${formatCurrency(estimatedAnnualInsurance(data.homePrice))}`
                  : undefined
              }
            >
              <NumberInput
                value={
                  data.insuranceSource === "estimated"
                    ? estimatedAnnualInsurance(data.homePrice)
                    : (data.annualInsurance ?? 0)
                }
                onChange={(v) => update("annualInsurance", v)}
                prefix="$"
                disabled={data.insuranceSource === "estimated"}
              />
            </Field>
            <Field label="Monthly HOA">
              <NumberInput
                value={data.monthlyHoa}
                onChange={(v) => update("monthlyHoa", v)}
                prefix="$"
              />
            </Field>
            <Field
              label="PMI rate"
              hint={
                data.downPaymentPct >= 20
                  ? "Not required (down ≥ 20%)"
                  : `Adds ${formatCurrencyCents(
                      breakdown.monthlyPmi,
                    )}/mo until LTV reaches ~78%`
              }
            >
              <NumberInput
                value={data.pmiRatePct}
                onChange={(v) => update("pmiRatePct", v)}
                suffix="%"
                step={0.05}
                disabled={data.downPaymentPct >= 20}
              />
              <Slider
                value={data.pmiRatePct}
                onChange={(v) => update("pmiRatePct", v)}
                min={0.2}
                max={1.5}
                step={0.05}
                ticks={["0.2%", "0.85%", "1.5%"]}
              />
            </Field>
          </Grid>
        </Section>

        <Section title="People" accent="orange">
          <Grid>
            <Field label="Buyer name">
              <input
                className={inputCls}
                value={data.buyerName}
                onChange={(e) => update("buyerName", e.target.value)}
              />
            </Field>
            <Field label="Agent name">
              <input
                className={inputCls}
                value={data.agentName}
                onChange={(e) => update("agentName", e.target.value)}
                placeholder="The NEXUS Team"
              />
            </Field>
            <Field label="Brokerage">
              <input
                className={inputCls}
                value={data.brokerage}
                onChange={(e) => update("brokerage", e.target.value)}
                placeholder="Keller Williams"
              />
            </Field>
            <Field label="Agent email">
              <input
                className={inputCls}
                value={data.agentEmail}
                onChange={(e) => update("agentEmail", e.target.value)}
                placeholder="agent@example.com"
              />
            </Field>
            <Field label="Agent phone">
              <input
                className={inputCls}
                value={data.agentPhone}
                onChange={(e) => update("agentPhone", formatPhone(e.target.value))}
                inputMode="tel"
                placeholder="(555) 000-0000"
              />
            </Field>
            <Field label="Listing status">
              <input
                className={inputCls}
                value={data.listingStatus}
                onChange={(e) => update("listingStatus", e.target.value)}
                placeholder="Active"
              />
            </Field>
          </Grid>
        </Section>

        <Section title="Buyer summary content" accent="orange">
          <p className="text-sm text-ink-muted mb-4">
            These fields populate the buyer-facing summary (Area Overview,
            Property Profile, Sale History). Leave blank to omit a card.
          </p>

          <details className="mb-4">
            <summary className="cursor-pointer font-semibold text-ink mb-3 select-none">
              Area Overview cards
            </summary>
            <Grid>
              <Field label="School district & schools" span={2}>
                <input
                  className={inputCls}
                  value={data.schoolDistrict}
                  onChange={(e) => update("schoolDistrict", e.target.value)}
                  placeholder="e.g. Douglas County RE-1 · Franktown Elem, Sagewood MS, Ponderosa HS"
                />
              </Field>
              <Field label="Walkability">
                <input
                  className={inputCls}
                  value={data.walkability}
                  onChange={(e) => update("walkability", e.target.value)}
                  placeholder="e.g. Walk 22, Transit 5, Bike 12. Car-dependent."
                />
              </Field>
              <Field label="Flood zone">
                <input
                  className={inputCls}
                  value={data.floodZone}
                  onChange={(e) => update("floodZone", e.target.value)}
                  placeholder="e.g. Zone X. Minimal risk."
                />
              </Field>
              <Field label="Nearby amenities">
                <input
                  className={inputCls}
                  value={data.nearbyAmenities}
                  onChange={(e) => update("nearbyAmenities", e.target.value)}
                  placeholder="e.g. Castle Rock retail, 15 min"
                />
              </Field>
              <Field label="Parks & outdoors">
                <input
                  className={inputCls}
                  value={data.parksOutdoors}
                  onChange={(e) => update("parksOutdoors", e.target.value)}
                  placeholder="e.g. Castlewood Canyon SP, 10 min"
                />
              </Field>
              <Field label="Commute">
                <input
                  className={inputCls}
                  value={data.commute}
                  onChange={(e) => update("commute", e.target.value)}
                  placeholder="e.g. DTC ~30 min · DIA ~45 min"
                />
              </Field>
              <Field label="Neighborhood vibe">
                <input
                  className={inputCls}
                  value={data.neighborhoodVibe}
                  onChange={(e) => update("neighborhoodVibe", e.target.value)}
                  placeholder="e.g. Rural acreage, equestrian-friendly, mountain views"
                />
              </Field>
              <Field label="Demographics">
                <input
                  className={inputCls}
                  value={data.demographics}
                  onChange={(e) => update("demographics", e.target.value)}
                  placeholder="Auto-filled on lookup. e.g. Population 4,884 · Median income $122k"
                />
              </Field>
              <Field label="Climate">
                <input
                  className={inputCls}
                  value={data.climate}
                  onChange={(e) => update("climate", e.target.value)}
                  placeholder="~300 sunny days · 80in/yr snow · Mild summers"
                />
              </Field>
            </Grid>
          </details>

          <details className="mb-4">
            <summary className="cursor-pointer font-semibold text-ink mb-3 select-none">
              Property profile rows
            </summary>
            <Grid>
              <Field label="Zoning">
                <input
                  className={inputCls}
                  value={data.zoning}
                  onChange={(e) => update("zoning", e.target.value)}
                  placeholder="e.g. A-1 Agricultural"
                />
              </Field>
              <Field label="Water & sewer">
                <input
                  className={inputCls}
                  value={data.waterSewer}
                  onChange={(e) => update("waterSewer", e.target.value)}
                  placeholder="e.g. Well, Septic"
                />
              </Field>
              <Field label="Heating & cooling">
                <input
                  className={inputCls}
                  value={data.heatingCooling}
                  onChange={(e) => update("heatingCooling", e.target.value)}
                  placeholder="e.g. Forced air gas, Central A/C"
                />
              </Field>
              <Field label="Special tax / metro district">
                <input
                  className={inputCls}
                  value={data.specialTax}
                  onChange={(e) => update("specialTax", e.target.value)}
                  placeholder="None"
                />
              </Field>
              <Field label="Assigned schools">
                <input
                  className={inputCls}
                  value={data.assignedSchools}
                  onChange={(e) => update("assignedSchools", e.target.value)}
                  placeholder="e.g. Franktown Elem, Sagewood MS, Ponderosa HS"
                />
              </Field>
            </Grid>
          </details>

          <details className="mb-4">
            <summary className="cursor-pointer font-semibold text-ink mb-3 select-none">
              Market & sale data
            </summary>
            <Grid>
              <Field label="Avg neighborhood $/sqft">
                <NumberInput
                  value={data.avgNeighborhoodPriceSqft}
                  onChange={(v) => update("avgNeighborhoodPriceSqft", v)}
                  prefix="$"
                />
              </Field>
              <Field label="Days on market">
                <NumberInput
                  value={data.daysOnMarket}
                  onChange={(v) => update("daysOnMarket", v)}
                />
              </Field>
              <Field label="Last sale price">
                <NumberInput
                  value={data.lastSalePrice}
                  onChange={(v) => update("lastSalePrice", v)}
                  prefix="$"
                />
              </Field>
              <Field label="Last sale date" span={2}>
                <input
                  className={inputCls}
                  value={data.lastSaleDate}
                  onChange={(e) => update("lastSaleDate", e.target.value)}
                  placeholder="2018-06-15"
                />
              </Field>
            </Grid>
          </details>

          <Field label="Agent notes & highlights">
            <textarea
              className={`${inputCls} h-28`}
              value={data.agentNotes}
              onChange={(e) => update("agentNotes", e.target.value)}
              placeholder="e.g. Recent updates, condition notes, unique features, things to flag for the buyer..."
            />
          </Field>
        </Section>

        <div className="rounded-xl bg-white border-2 border-orange/40 p-6 mb-8 shadow-sm">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <span className="text-ink-muted font-medium">
              Estimated monthly payment
            </span>
            <span className="text-3xl sm:text-4xl font-bold tabular-nums text-purple-deep">
              {formatCurrencyCents(breakdown.monthlyTotal)}
            </span>
          </div>
          <div className="text-sm text-ink-muted mt-2">
            P&amp;I {formatCurrencyCents(breakdown.monthlyPrincipalAndInterest)}
            {" · "}
            Tax {formatCurrencyCents(breakdown.monthlyTax)}
            {" · "}
            Ins {formatCurrencyCents(breakdown.monthlyInsurance)}
            {breakdown.monthlyHoa > 0
              ? ` · HOA ${formatCurrencyCents(breakdown.monthlyHoa)}`
              : ""}
            {breakdown.pmiRequired
              ? ` · PMI ${formatCurrencyCents(breakdown.monthlyPmi)}`
              : ""}
          </div>
        </div>

        <div className="flex justify-end items-center gap-3 pb-12 flex-wrap">
          {saveState.status === "saved" && (
            <span className="text-sm text-success bg-success-soft border border-success/30 rounded px-3 py-1.5">
              Saved
            </span>
          )}
          {saveState.status === "error" && (
            <span className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
              {saveState.message}
            </span>
          )}
          {backHref && (
            <a
              href={backHref}
              className="px-4 py-2 rounded-md border border-line bg-white hover:bg-cream-muted transition"
            >
              ← Back
            </a>
          )}
          {!onSave && (
            <button
              className="px-4 py-2 rounded-md border border-line bg-white hover:bg-cream-muted transition"
              onClick={() => {
                setData(DEFAULTS);
                setLookupState({ status: "idle" });
              }}
            >
              Reset
            </button>
          )}
          {onSave && (
            <button
              className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50"
              onClick={handleSave}
              disabled={saveState.status === "saving"}
            >
              {saveState.status === "saving" ? "Saving…" : "Save"}
            </button>
          )}
          <button
            className="px-6 py-2 rounded-md bg-ink text-white font-medium hover:bg-purple-deep transition"
            onClick={() => setView("packet")}
          >
            Preview packet →
          </button>
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-purple focus:ring-2 focus:ring-purple-soft disabled:bg-cream-muted disabled:text-ink-muted transition";

function BrandHeader() {
  return (
    <header className="bg-white border-b-2 border-orange no-print">
      <div className="mx-auto max-w-4xl px-6 sm:px-10 py-4 flex items-center justify-between">
        <Logo />
        <div className="text-xs text-ink-muted uppercase tracking-widest">
          Buyer&rsquo;s Packet
        </div>
      </div>
    </header>
  );
}

function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <div className={`font-display ${text} tracking-tight flex items-baseline gap-1`}>
      <span className="text-ink">The</span>
      <span className="text-purple-deep font-bold">NEXUS</span>
      <span className="text-orange font-bold">Team</span>
    </div>
  );
}

function LookupStatus({
  state,
}: {
  state:
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; message?: string; found: boolean }
    | { status: "error"; message: string };
}) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return <span className="text-sm text-ink-muted">Searching listings…</span>;
  }
  if (state.status === "error") {
    return (
      <span className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
        Error: {state.message}
      </span>
    );
  }
  if (state.found) {
    return (
      <span className="text-sm text-purple-deep bg-purple-soft rounded px-2 py-1">
        Found data. Review the prefilled fields below.
      </span>
    );
  }
  return (
    <span className="text-sm text-ink-muted bg-cream-muted border border-line rounded px-2 py-1">
      {state.message ?? "No data found. Fill the fields manually."}
    </span>
  );
}

function Section({
  title,
  accent = "purple",
  children,
}: {
  title: string;
  accent?: "purple" | "orange";
  children: React.ReactNode;
}) {
  const accentLine = accent === "purple" ? "bg-purple" : "bg-orange";
  return (
    <section className="mb-6 rounded-xl border border-line bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className={`inline-block w-1 h-5 rounded-full ${accentLine}`} />
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{children}</div>
  );
}

function Field({
  label,
  hint,
  span = 1,
  children,
}: {
  label: string;
  hint?: string;
  span?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const colSpan =
    span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <label className={`block ${colSpan}`}>
      <span className="block text-sm font-medium text-ink mb-1">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs text-ink-muted mt-1">{hint}</span>
      )}
    </label>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  ticks,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  ticks?: string[];
}) {
  return (
    <div className="mt-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-purple cursor-pointer"
      />
      {ticks && (
        <div className="flex justify-between text-[10px] text-ink-muted mt-0.5 px-0.5 tabular-nums">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TermPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const opts = [15, 20, 30];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-3 py-2 rounded-md border text-sm font-medium transition ${
              active
                ? "bg-purple text-white border-purple"
                : "bg-white text-ink border-line hover:bg-cream-muted"
            }`}
          >
            {o} yr
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  step,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<string>(
    value === 0 || !Number.isFinite(value) ? "" : String(value),
  );
  const lastValueRef = useRef(value);

  if (value !== lastValueRef.current) {
    lastValueRef.current = value;
    const parsed = local === "" ? 0 : parseFloat(local);
    if (parsed !== value) {
      setLocal(value === 0 || !Number.isFinite(value) ? "" : String(value));
    }
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute inset-y-0 left-3 flex items-center text-ink-muted pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        className={`${inputCls} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""} tabular-nums`}
        value={local}
        onChange={(e) => {
          const t = e.target.value;
          if (t !== "" && !/^-?\d*\.?\d*$/.test(t)) return;
          setLocal(t);
          if (t === "" || t === "-" || t === "." || t === "-.") {
            onChange(0);
          } else {
            const n = parseFloat(t);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
        onBlur={() => {
          if (local === "" && value !== 0) onChange(0);
        }}
        step={step}
      />
      {suffix && (
        <span className="absolute inset-y-0 right-3 flex items-center text-ink-muted pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

type AreaCard = {
  icon: string;
  title: string;
  value: string;
  sub?: string;
  ok?: boolean;
};

type PropertyRow = {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  badge?: { kind: "ok" | "warn" | "info"; text: string };
};

type ChecklistItem = { text: string; note: string };
type ChecklistGroup = { title: string; items: ChecklistItem[] };

const CHECKLIST: ChecklistGroup[] = [
  {
    title: "Insurance",
    items: [
      {
        text: "Get homeowners insurance quotes",
        note: "Aim for at least 2–3 quotes. Note any exclusions for flooding or hail in CO.",
      },
      {
        text: "Confirm flood zone status & flood insurance cost (if applicable)",
        note: "Check FEMA flood maps. If in a flood zone, get a separate flood insurance quote. Lender will require it.",
      },
    ],
  },
  {
    title: "Taxes & Fees",
    items: [
      {
        text: "Confirm current property tax amount",
        note: "Check county assessor's website. Taxes may change after sale/reassessment.",
      },
      {
        text: "Confirm HOA dues & rules (if applicable)",
        note: "Ask for the current monthly/annual dues and any pending special assessments.",
      },
      {
        text: "Check for Special Tax / Metro District",
        note: "Metro districts add a separate mill levy on top of regular property taxes. Can add hundreds per year. Ask for the public improvement fee (PIF) disclosure if applicable.",
      },
      {
        text: "Understand closing cost estimates",
        note: "Typically 2–5% of purchase price. Ask lender for a Loan Estimate document.",
      },
    ],
  },
  {
    title: "Financing",
    items: [
      {
        text: "Obtain full pre-approval letter",
        note: "Pre-approval (not pre-qual) strengthens your offer significantly in competitive markets.",
      },
      {
        text: "Compare mortgage lender offers",
        note: "Rate, points, and origination fees vary. Even 0.25% rate difference = thousands over loan life.",
      },
      {
        text: "Confirm appraisal contingency strategy",
        note: "Discuss with your agent whether to include, waive, or cap any appraisal gap.",
      },
    ],
  },
  {
    title: "Know the Property",
    items: [
      {
        text: "Research utility costs",
        note: "Ask agent to request 12 months of gas, electric, and water bills from the seller for budget accuracy.",
      },
      {
        text: "Visit the neighborhood at different times of day",
        note: "Weekday morning, evening, and weekend give very different reads on noise and activity.",
      },
      {
        text: "Confirm offer strategy with your agent",
        note: "Discuss escalation clauses, earnest money amount, possession date, and any contingencies you plan to include.",
      },
    ],
  },
];

function formatPriceCompact(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatSaleDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function Packet({
  data,
  effectiveInsurance,
  onBack,
  onToggleChecklistItem,
}: {
  data: PropertyData;
  effectiveInsurance: number;
  onBack?: () => void;
  // When provided, the buyer's check-off is persisted via this handler.
  onToggleChecklistItem?: (key: string, done: boolean) => Promise<void>;
}) {
  // Local state for the buyer-facing interactive calc + checklist
  const [calcPrice, setCalcPrice] = useState(data.homePrice);
  const [calcDownPct, setCalcDownPct] = useState(data.downPaymentPct);
  const [calcRate, setCalcRate] = useState(data.interestRatePct);
  const [calcTerm, setCalcTerm] = useState(data.loanTermYears);
  const [doneItems, setDoneItems] = useState<Set<string>>(
    () => new Set(data.checklistDone ?? []),
  );

  // Whole-PITI calc tied to the buyer's interactive inputs.
  // Tax/insurance/HOA stay locked to what the agent set; price/down/rate/term
  // are buyer-controlled, so PMI drops correctly when buyer goes to 20%+.
  const calc = useMemo(
    () =>
      calculateMortgage({
        homePrice: calcPrice,
        downPaymentPct: calcDownPct,
        interestRatePct: calcRate,
        loanTermYears: calcTerm,
        annualPropertyTax: data.annualPropertyTax ?? 0,
        annualInsurance: effectiveInsurance,
        monthlyHoa: data.monthlyHoa,
        pmiRatePct: data.pmiRatePct,
      }),
    [
      calcPrice,
      calcDownPct,
      calcRate,
      calcTerm,
      data.annualPropertyTax,
      effectiveInsurance,
      data.monthlyHoa,
      data.pmiRatePct,
    ],
  );

  const sqftNum = parseInt(data.sqft, 10);
  const pricePerSqft =
    sqftNum > 0 && data.homePrice > 0
      ? Math.round(data.homePrice / sqftNum)
      : null;

  const areaCards: AreaCard[] = [];
  if (data.schoolDistrict) {
    areaCards.push({
      icon: "🏫",
      title: "School District",
      value: data.schoolDistrict,
    });
  }
  if (data.walkability) {
    areaCards.push({
      icon: "🚶",
      title: "Walkability",
      value: data.walkability,
    });
  }
  if (data.floodZone) {
    areaCards.push({
      icon: "💧",
      title: "Flood Zone",
      value: data.floodZone,
      ok: /minimal|low|none|outside|x\b/i.test(data.floodZone),
    });
  }
  if (data.nearbyAmenities) {
    areaCards.push({
      icon: "🛍️",
      title: "Nearby Amenities",
      value: data.nearbyAmenities,
    });
  }
  if (data.parksOutdoors) {
    areaCards.push({
      icon: "🌳",
      title: "Parks & Outdoors",
      value: data.parksOutdoors,
    });
  }
  if (data.commute) {
    areaCards.push({ icon: "🚗", title: "Commute", value: data.commute });
  }
  if (data.neighborhoodVibe) {
    areaCards.push({
      icon: "📊",
      title: "Neighborhood Vibe",
      value: data.neighborhoodVibe,
    });
  }
  if (data.demographics) {
    areaCards.push({
      icon: "👥",
      title: "Demographics",
      value: data.demographics,
    });
  }
  if (data.climate) {
    areaCards.push({
      icon: "☀️",
      title: "Climate",
      value: data.climate,
    });
  }

  const propertyRows: PropertyRow[] = [];
  if (data.lastSalePrice > 0) {
    propertyRows.push({
      icon: "🏷️",
      label: "Last Market Sale",
      value: `${formatPriceCompact(data.lastSalePrice)}${
        data.lastSaleDate ? ` · ${formatSaleDate(data.lastSaleDate)}` : ""
      }`,
      sub:
        data.homePrice > 0
          ? `${formatPriceCompact(
              data.homePrice - data.lastSalePrice,
            )} change since last sale (${(
              ((data.homePrice - data.lastSalePrice) / data.lastSalePrice) *
              100
            ).toFixed(0)}%)`
          : undefined,
    });
  }
  if (data.zoning) {
    propertyRows.push({ icon: "🗺️", label: "Zoning", value: data.zoning });
  }
  if (data.waterSewer) {
    propertyRows.push({
      icon: "💧",
      label: "Water & Sewer",
      value: data.waterSewer,
    });
  }
  if (data.heatingCooling) {
    propertyRows.push({
      icon: "🌡️",
      label: "Heating & Cooling",
      value: data.heatingCooling,
    });
  }
  if (data.specialTax) {
    propertyRows.push({
      icon: "📋",
      label: "Special Tax / Metro District",
      value: data.specialTax,
      badge: /none|no metro/i.test(data.specialTax)
        ? { kind: "ok", text: "None Identified" }
        : { kind: "warn", text: "Verify" },
    });
  }
  if (data.assignedSchools) {
    propertyRows.push({
      icon: "🏫",
      label: "School District (Assigned)",
      value: data.assignedSchools,
    });
  }

  const fullHistory: SaleHistoryEntry[] = [];
  if (data.homePrice > 0) {
    fullHistory.push({
      year: String(new Date().getFullYear()),
      event: data.listingStatus ? `Listed (${data.listingStatus})` : "Listed",
      price: data.homePrice,
    });
  }
  for (const h of data.priceHistory) fullHistory.push(h);
  if (
    data.lastSalePrice > 0 &&
    !data.priceHistory.some(
      (h) => Math.abs(h.price - data.lastSalePrice) < 1,
    )
  ) {
    fullHistory.push({
      year: data.lastSaleDate ? data.lastSaleDate.slice(0, 4) : "",
      event: "Sold",
      price: data.lastSalePrice,
    });
  }

  function toggleItem(key: string) {
    let willBeDone = false;
    setDoneItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        willBeDone = false;
      } else {
        next.add(key);
        willBeDone = true;
      }
      return next;
    });
    // Fire-and-forget persistence; UI already reflects the change.
    onToggleChecklistItem?.(key, willBeDone).catch(() => {
      // Roll back on failure.
      setDoneItems((prev) => {
        const next = new Set(prev);
        if (willBeDone) next.delete(key);
        else next.add(key);
        return next;
      });
    });
  }

  const insuranceNote =
    data.insuranceSource === "estimated"
      ? "Estimated using 0.35% of home price annually."
      : data.insuranceSource === "listing"
        ? "From listing."
        : "Manually entered.";
  const taxLabelMap: Record<SourceTag, string> = {
    listing: "From listing",
    "public-records": "From public records",
    manual: "Manually entered",
    estimated: "Estimated",
    unavailable: "Not available",
  };

  return (
    <div className="min-h-screen bg-cream print:bg-white text-ink">
      {/* Toolbar (no print) */}
      <div className="no-print bg-white border-b-2 border-orange">
        <div className="mx-auto max-w-[920px] px-6 sm:px-10 py-4 flex items-center justify-between">
          {onBack ? (
            <button
              className="px-4 py-2 rounded-md border border-line bg-white hover:bg-cream-muted transition"
              onClick={onBack}
            >
              ← Edit
            </button>
          ) : (
            <span className="w-16" />
          )}
          <Logo />
          <button
            className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* COVER */}
      <div className="relative overflow-hidden bg-ink text-cream px-10 sm:px-20 pt-16 pb-12 print-color-exact">
        {data.coverPhoto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.coverPhoto}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/75 to-ink/40 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent pointer-events-none" />
          </>
        ) : (
          <>
            <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full border-[60px] border-orange/15 pointer-events-none" />
            <div className="absolute -bottom-24 -left-10 w-56 h-56 rounded-full border-[40px] border-purple/15 pointer-events-none" />
          </>
        )}
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="text-[11px] tracking-[3px] uppercase text-orange mb-3">
              Buyer Summary Report
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight max-w-xl">
              {data.street || "—"}
              {data.city && (
                <>
                  <br />
                  {data.city}
                  {data.state ? `, ${data.state}` : ""}{" "}
                  {data.zip}
                </>
              )}
            </h1>
          </div>
          <div className="text-left sm:text-right text-sm text-cream/55 leading-loose">
            {data.buyerName ? (
              <>
                Prepared for
                <br />
                <strong className="block text-cream font-medium text-xl">
                  {data.buyerName}
                </strong>
              </>
            ) : (
              <>
                List Price
                <br />
              </>
            )}
            <strong className="block text-cream font-medium text-2xl mt-1">
              {formatPriceCompact(data.homePrice)}
            </strong>
            <span className="text-cream/55">
              List Price
              {data.listingStatus ? ` · ${data.listingStatus}` : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-[920px] mx-auto px-6 sm:px-10 pb-20">
        {/* WARM WELCOME */}
        {data.buyerName && (
          <section className="pt-12 pb-2">
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink mb-3">
              Welcome, {data.buyerName}!
            </h2>
            <p className="text-ink-muted leading-relaxed max-w-2xl">
              We&rsquo;ve put together everything you need to evaluate this
              property. Take your time exploring the details below. Use the
              buyer checklist at the end to track what&rsquo;s left to confirm
              before making your offer.
            </p>
          </section>
        )}

        {/* SECTION 01: AREA OVERVIEW */}
        {areaCards.length > 0 && (
          <PacketSection number="01" title="Area Overview">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {areaCards.map((card) => (
                <div
                  key={card.title}
                  className="bg-white border border-line rounded-lg p-5"
                >
                  <div className="text-xl mb-2">{card.icon}</div>
                  <div className="text-[11px] tracking-[2px] uppercase text-ink-muted mb-1.5">
                    {card.title}
                  </div>
                  <div
                    className={`text-base font-medium ${card.ok ? "text-success" : "text-ink"}`}
                  >
                    {card.value}
                  </div>
                  {card.sub && (
                    <div className="text-xs text-ink-muted mt-1">
                      {card.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </PacketSection>
        )}

        {/* SECTION 02: PROPERTY SUMMARY */}
        <PacketSection number="02" title="Property Summary">
          {data.photos.some((p) => p.url) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {data.photos
                .filter((p) => p.url)
                .slice(0, 4)
                .map((p, i, arr) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={i}
                    src={p.url}
                    alt={`Property photo ${i + 1}`}
                    className={`w-full object-cover rounded-lg border border-line ${
                      i === 0 && arr.length > 1
                        ? "sm:col-span-2 h-72"
                        : "h-40"
                    }`}
                  />
                ))}
            </div>
          ) : (
            <div className="bg-warm border border-dashed border-line rounded-lg h-56 flex items-center justify-center text-ink-muted text-xs tracking-[1px] mb-6">
              [ Property photo placeholder ]
            </div>
          )}

          {/* Specs */}
          <div className={`grid grid-cols-2 ${data.lotSize ? "sm:grid-cols-5" : "sm:grid-cols-4"} border border-line rounded-lg overflow-hidden mb-6 bg-white`}>
            <Spec label="Beds" value={data.beds || "—"} />
            <Spec label="Baths" value={data.baths || "—"} />
            <Spec label="Sq Ft" value={data.sqft ? Number(data.sqft).toLocaleString() : "—"} />
            <Spec
              label="Year Built"
              value={data.yearBuilt || "—"}
              last={!data.lotSize}
            />
            {data.lotSize && <Spec label="Lot Size" value={data.lotSize} last />}
          </div>

          {/* Detail rows */}
          {propertyRows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {propertyRows.map((row) => (
                <div
                  key={row.label}
                  className="bg-white border border-line rounded-lg p-4 flex items-start gap-3"
                >
                  <div className="text-lg flex-shrink-0 mt-0.5">{row.icon}</div>
                  <div>
                    <div className="text-[10px] tracking-[2px] uppercase text-ink-muted mb-1">
                      {row.label}
                    </div>
                    <div className="text-sm font-medium text-ink">
                      {row.value}
                    </div>
                    {row.sub && (
                      <div className="text-xs text-ink-muted mt-1">
                        {row.sub}
                      </div>
                    )}
                    {row.badge && (
                      <span
                        className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          row.badge.kind === "ok"
                            ? "bg-success-soft text-success"
                            : row.badge.kind === "warn"
                              ? "bg-warn-soft text-warn-deep"
                              : "bg-orange-soft text-orange-deep"
                        }`}
                      >
                        {row.badge.text}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agent notes */}
          {data.agentNotes && (
            <div className="bg-white border border-line rounded-lg p-5 mt-2">
              <div className="text-[11px] tracking-[2px] uppercase text-ink-muted mb-2">
                Agent Notes & Highlights
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {data.agentNotes}
              </p>
            </div>
          )}
        </PacketSection>

        {/* SECTION 03: FINANCIAL OVERVIEW */}
        <PacketSection number="03" title="Financial Overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Calc card */}
            <div className="bg-ink text-cream rounded-lg p-7 print-color-exact">
              <div className="text-[11px] tracking-[3px] uppercase text-cream/50 mb-5">
                Payment Calculator
              </div>
              <CalcField label="Purchase Price">
                <input
                  type="number"
                  value={calcPrice || ""}
                  onChange={(e) => setCalcPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white/10 border border-white/15 rounded px-3 py-2 text-cream text-sm focus:outline-none focus:border-orange"
                />
              </CalcField>
              <CalcField label="Down Payment %">
                <input
                  type="number"
                  value={calcDownPct || ""}
                  onChange={(e) =>
                    setCalcDownPct(parseFloat(e.target.value) || 0)
                  }
                  className="w-full bg-white/10 border border-white/15 rounded px-3 py-2 text-cream text-sm focus:outline-none focus:border-orange"
                />
              </CalcField>
              <CalcField label="Interest Rate %">
                <input
                  type="number"
                  step={0.05}
                  value={calcRate || ""}
                  onChange={(e) => setCalcRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white/10 border border-white/15 rounded px-3 py-2 text-cream text-sm focus:outline-none focus:border-orange"
                />
              </CalcField>
              <CalcField label="Loan Term">
                <select
                  value={calcTerm}
                  onChange={(e) => setCalcTerm(parseInt(e.target.value, 10))}
                  className="w-full bg-white/10 border border-white/15 rounded px-3 py-2 text-cream text-sm focus:outline-none focus:border-orange"
                >
                  <option value="30">30-Year Fixed</option>
                  <option value="20">20-Year Fixed</option>
                  <option value="15">15-Year Fixed</option>
                </select>
              </CalcField>

              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="text-[11px] tracking-[2px] uppercase text-cream/50 mb-1">
                  Est. Monthly P&amp;I
                </div>
                <div className="font-display text-4xl text-orange">
                  {formatPriceCompact(calc.monthlyPrincipalAndInterest)}
                </div>
                <div className="text-xs text-cream/40 mt-1">
                  Loan: {formatPriceCompact(calc.loanAmount)} · Down:{" "}
                  {formatPriceCompact(calc.downPayment)}
                </div>
              </div>

              {/* Full PITI breakdown using packet's actual data */}
              <div className="mt-5 pt-5 border-t border-white/10 text-xs text-cream/70 space-y-1">
                <div className="text-[11px] tracking-[2px] uppercase text-cream/50 mb-2">
                  Full Estimated Monthly (PITI)
                </div>
                <FinRow
                  label="Principal & interest"
                  value={formatCurrencyCents(
                    calc.monthlyPrincipalAndInterest,
                  )}
                />
                <FinRow
                  label={`Property tax${data.taxYear ? ` (${data.taxYear})` : ""}`}
                  value={formatCurrencyCents(calc.monthlyTax)}
                />
                <FinRow
                  label="Homeowner's insurance"
                  value={formatCurrencyCents(calc.monthlyInsurance)}
                />
                {calc.monthlyHoa > 0 && (
                  <FinRow
                    label="HOA"
                    value={formatCurrencyCents(calc.monthlyHoa)}
                  />
                )}
                {calc.pmiRequired && (
                  <FinRow
                    label={`PMI (${data.pmiRatePct}% / yr)`}
                    value={formatCurrencyCents(calc.monthlyPmi)}
                  />
                )}
                <div className="flex justify-between pt-2 mt-2 border-t border-white/10 text-cream font-medium">
                  <span>Total / month</span>
                  <span className="font-display text-base text-orange tabular-nums">
                    {formatCurrencyCents(calc.monthlyTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sale history + market stats */}
            <div className="bg-white border border-line rounded-lg p-7">
              <div className="text-[11px] tracking-[3px] uppercase text-ink-muted mb-5">
                Price &amp; Sale History
              </div>
              {fullHistory.length === 0 ? (
                <p className="text-sm text-ink-muted italic">
                  No sale history available.
                </p>
              ) : (
                <div>
                  {fullHistory.map((h, i) => (
                    <div
                      key={`${h.year}-${i}`}
                      className="flex justify-between items-center py-2.5 border-b border-line last:border-b-0"
                    >
                      <div className="text-sm text-ink-muted">{h.year}</div>
                      <div className="text-sm font-medium">{h.event}</div>
                      <div className="font-display text-base font-semibold text-orange">
                        {formatPriceCompact(h.price)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mt-5">
                <MarketStat
                  label="Price/SqFt"
                  value={pricePerSqft ? `$${pricePerSqft}` : "—"}
                />
                <MarketStat
                  label="Avg Neighborhood"
                  value={
                    data.avgNeighborhoodPriceSqft > 0
                      ? `$${data.avgNeighborhoodPriceSqft}`
                      : "—"
                  }
                />
                <MarketStat
                  label="Days on Market"
                  value={
                    data.daysOnMarket > 0 ? String(data.daysOnMarket) : "—"
                  }
                />
              </div>

              <div className="mt-5 pt-5 border-t border-line text-xs text-ink-muted leading-relaxed">
                <div>
                  <strong className="text-ink">Tax:</strong>{" "}
                  {data.taxSource === "unavailable"
                    ? "Prior-year tax not available; verify with county assessor."
                    : `${formatCurrency(data.annualPropertyTax ?? 0)}/yr · ${
                        taxLabelMap[data.taxSource]
                      }${data.taxYear ? ` (${data.taxYear})` : ""}.`}
                </div>
                <div className="mt-1">
                  <strong className="text-ink">Insurance:</strong>{" "}
                  {formatCurrency(effectiveInsurance)}/yr · {insuranceNote}
                </div>
              </div>
            </div>
          </div>
        </PacketSection>

        {/* SECTION 04: BUYER CHECKLIST */}
        <PacketSection number="04" title="Buyer Checklist">
          <p className="text-sm text-ink-muted mb-6 leading-relaxed">
            Check off each item to build a complete financial picture on this
            property. Click a row to toggle it.
          </p>
          <div className="space-y-7">
            {CHECKLIST.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] tracking-[3px] uppercase text-orange border-b border-orange-soft pb-2 mb-3">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const key = `${group.title}::${item.text}`;
                  const done = doneItems.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleItem(key)}
                      className="w-full text-left flex items-start gap-3 py-2.5 border-b border-line last:border-b-0 hover:bg-cream-muted/30 transition print:cursor-default print:hover:bg-transparent"
                    >
                      <span
                        className={`w-5 h-5 border-2 rounded flex-shrink-0 mt-0.5 flex items-center justify-center transition ${
                          done
                            ? "bg-success border-success text-white"
                            : "border-line"
                        }`}
                      >
                        {done && <span className="text-xs font-bold">✓</span>}
                      </span>
                      <span>
                        <span
                          className={`block text-sm ${done ? "line-through text-ink-muted" : "text-ink"}`}
                        >
                          {item.text}
                        </span>
                        <span className="block text-xs text-ink-muted mt-0.5">
                          {item.note}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PacketSection>

        {/* FOOTER */}
        <div className="mt-16 pt-6 border-t border-line flex justify-between text-xs text-ink-muted">
          <div>
            <span className="font-medium text-ink block">
              {[data.agentName, data.brokerage].filter(Boolean).join(" · ") ||
                "—"}
            </span>
            {[data.agentEmail, data.agentPhone].filter(Boolean).join(" · ")}
          </div>
          <div className="text-right">
            Generated:{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            <br />
            For informational purposes only.
          </div>
        </div>
      </div>
    </div>
  );
}

function PacketSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 pt-10 border-t border-line first:border-t-0 first:mt-10">
      <div className="text-[10px] tracking-[4px] uppercase text-orange mb-1.5">
        Section {number}
      </div>
      <h2 className="font-display text-3xl font-semibold mb-7">{title}</h2>
      {children}
    </section>
  );
}

function Spec({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`text-center py-4 px-3 ${last ? "" : "border-r border-line"}`}
    >
      <div className="text-[10px] tracking-[2px] uppercase text-ink-muted mb-1.5">
        {label}
      </div>
      <div className="font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function CalcField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <label className="block text-[11px] tracking-[1px] uppercase text-cream/50 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-orange-soft rounded-md p-3 text-center print-color-exact">
      <div className="text-[10px] tracking-[2px] uppercase text-ink-muted mb-1">
        {label}
      </div>
      <div className="font-display text-lg font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
