import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PropertyData } from "@/components/PropertyEditor";
import { EditorClient } from "./_components/EditorClient";

export default async function PropertyEditorPage({
  params,
}: {
  params: Promise<{ id: string; propId: string }>;
}) {
  const { id: buyerId, propId } = await params;
  const supabase = await createClient();

  const [propertyResult, buyerResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, street, city, state, zip, packet_data, buyer_id")
      .eq("id", propId)
      .single(),
    supabase.from("buyers").select("full_name").eq("id", buyerId).single(),
  ]);

  const { data: property, error } = propertyResult;
  if (error || !property || property.buyer_id !== buyerId) {
    notFound();
  }

  // Reconstruct the editor's initial state from the saved jsonb blob,
  // falling back to the address columns if the blob is missing them.
  // Buyer name pre-populates from the buyers table on first edit; saved
  // value (if any) wins on subsequent edits.
  const stored = (property.packet_data ?? {}) as Partial<PropertyData>;
  const initialData: Partial<PropertyData> = {
    ...stored,
    street: stored.street ?? property.street ?? "",
    city: stored.city ?? property.city ?? "",
    state: stored.state ?? property.state ?? "",
    zip: stored.zip ?? property.zip ?? "",
    buyerName: stored.buyerName || buyerResult.data?.full_name || "",
  };

  return (
    <EditorClient
      buyerId={buyerId}
      propertyId={propId}
      initialData={initialData}
    />
  );
}
