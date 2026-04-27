import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type EnrichRequest = {
  address: { street: string; city: string; state: string; zip: string };
  knownData: Partial<{
    beds: string;
    baths: string;
    sqft: string;
    yearBuilt: string;
    lotSize: string;
    demographics: string;
    floodZone: string;
    nearbyAmenities: string;
    parksOutdoors: string;
    commute: string;
    schoolDistrict: string;
    walkability: string;
    climate: string;
    neighborhoodVibe: string;
    assignedSchools: string;
    agentNotes: string;
  }>;
};

export type EnrichedFields = {
  schoolDistrict: string;
  walkability: string;
  climate: string;
  neighborhoodVibe: string;
  assignedSchools: string;
  agentNotes: string;
};

export type EnrichResponse =
  | { ok: true; data: EnrichedFields }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a US residential real estate expert helping prepare a buyer's packet for a specific property.

The agent provides property details and asks you to fill specific gaps. The other auto-populated fields (specs, taxes, demographics, flood zone, nearby amenities, parks, commute) come from real APIs. Your job is to fill the remaining narrative-style fields using your training knowledge of the area.

Output JSON matching the requested schema. For each field:
- Return a SHORT one-line summary (except agentNotes, which is 3-5 sentences max)
- If you cannot confidently fill a field, return an empty string for it
- Never invent specific names, ratings, or numbers you don't actually know
- Use \`·\` (middle dot) as separator within fields, not em dashes or commas

Format expectations:
- schoolDistrict: "<District name> · <key feeder schools>" (e.g. "Douglas County RE-1 · Franktown Elem, Sagewood MS, Ponderosa HS")
- walkability: "<Walk type> · Walk Score ~<n>" or just "<Walk type>" if you don't know the exact score (e.g. "Car-dependent · Walk Score ~22")
- climate: "<weather descriptor> · <distinctive feature>" (e.g. "Sunny · ~300 days/yr · ~80in/yr snow · Mild summers")
- neighborhoodVibe: "<3-5 short descriptors separated by ·>" (e.g. "Rural acreage · Equestrian-friendly · Mountain views west · Quiet")
- assignedSchools: "<Elem> · <Middle> · <High>" (only if you know the specific schools serving this address)
- agentNotes: 3-5 sentences. Cover what makes the property notable for buyers in this market and any concerns to verify. Plain prose, no bullet points.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<EnrichResponse>(
      {
        ok: false,
        error:
          "AI enrichment not configured. Set ANTHROPIC_API_KEY in environment.",
      },
      { status: 500 },
    );
  }

  let body: EnrichRequest;
  try {
    body = (await req.json()) as EnrichRequest;
  } catch {
    return NextResponse.json<EnrichResponse>(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { address, knownData } = body;
  if (!address?.street || !address?.zip) {
    return NextResponse.json<EnrichResponse>(
      { ok: false, error: "Street and ZIP are required." },
      { status: 400 },
    );
  }

  const fullAddress = [address.street, address.city, address.state, address.zip]
    .filter(Boolean)
    .join(", ");

  const knownSpecs = [
    knownData.beds && `${knownData.beds} bed`,
    knownData.baths && `${knownData.baths} bath`,
    knownData.sqft && `${knownData.sqft} sqft`,
    knownData.yearBuilt && `built ${knownData.yearBuilt}`,
    knownData.lotSize && `lot: ${knownData.lotSize}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const supplementaryContext = [
    knownData.demographics && `Demographics: ${knownData.demographics}`,
    knownData.floodZone && `Flood zone: ${knownData.floodZone}`,
    knownData.nearbyAmenities && `Nearby amenities: ${knownData.nearbyAmenities}`,
    knownData.parksOutdoors && `Parks: ${knownData.parksOutdoors}`,
    knownData.commute && `Commute: ${knownData.commute}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fieldsToFill: string[] = [];
  if (!knownData.schoolDistrict) fieldsToFill.push("schoolDistrict");
  if (!knownData.walkability) fieldsToFill.push("walkability");
  if (!knownData.climate) fieldsToFill.push("climate");
  if (!knownData.neighborhoodVibe) fieldsToFill.push("neighborhoodVibe");
  if (!knownData.assignedSchools) fieldsToFill.push("assignedSchools");
  if (!knownData.agentNotes) fieldsToFill.push("agentNotes");

  const userMessage = `Property: ${fullAddress}
${knownSpecs ? `\nKnown specs: ${knownSpecs}` : ""}

${
  supplementaryContext
    ? `Already-known context (do NOT regenerate these):\n${supplementaryContext}\n`
    : ""
}
Fill these fields with your best confident answer:
${
  fieldsToFill.length === 0
    ? "All fields already populated. Return empty strings for everything."
    : fieldsToFill.map((f) => `- ${f}`).join("\n")
}

Return JSON matching the schema. Empty string for any field you can't confidently fill.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              schoolDistrict: { type: "string" },
              walkability: { type: "string" },
              climate: { type: "string" },
              neighborhoodVibe: { type: "string" },
              assignedSchools: { type: "string" },
              agentNotes: { type: "string" },
            },
            required: [
              "schoolDistrict",
              "walkability",
              "climate",
              "neighborhoodVibe",
              "assignedSchools",
              "agentNotes",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json<EnrichResponse>(
        { ok: false, error: "AI returned no text." },
        { status: 500 },
      );
    }

    const data = JSON.parse(textBlock.text) as EnrichedFields;
    return NextResponse.json<EnrichResponse>({ ok: true, data });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json<EnrichResponse>(
        { ok: false, error: "Invalid Anthropic API key." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json<EnrichResponse>(
        { ok: false, error: "AI rate limited. Try again in a minute." },
        { status: 429 },
      );
    }
    return NextResponse.json<EnrichResponse>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "AI enrichment failed",
      },
      { status: 500 },
    );
  }
}
