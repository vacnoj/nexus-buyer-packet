import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PropertyData } from "@/components/PropertyEditor";
import { BuyerPacketView } from "./_components/BuyerPacketView";

export default async function BuyerPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this to properties belonging to this buyer's email.
  const { data: property, error } = await supabase
    .from("properties")
    .select("packet_data, street, city, state, zip")
    .eq("id", id)
    .single();

  if (error || !property) notFound();

  const stored = (property.packet_data ?? {}) as Partial<PropertyData>;
  const data: PropertyData = {
    ...DEFAULT_DATA,
    ...stored,
    street: stored.street ?? property.street ?? "",
    city: stored.city ?? property.city ?? "",
    state: stored.state ?? property.state ?? "",
    zip: stored.zip ?? property.zip ?? "",
  };

  return <BuyerPacketView data={data} propertyId={id} />;
}

// Minimal defaults so the packet renders even from an empty packet_data.
const DEFAULT_DATA: PropertyData = {
  street: "",
  city: "",
  state: "",
  zip: "",
  beds: "",
  baths: "",
  sqft: "",
  yearBuilt: "",
  lotSize: "",
  listingUrl: "",
  coverPhoto: "",
  photos: [],
  homePrice: 0,
  downPaymentPct: 20,
  interestRatePct: 7,
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
  agentPhone: "",
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
