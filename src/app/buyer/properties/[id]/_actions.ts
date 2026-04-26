"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Persist a single checklist toggle for the buyer. Uses the user-scoped
// client to verify the caller actually owns this property (via RLS), then
// uses the admin client to perform the update (since buyers don't have
// UPDATE permission on properties).
export async function toggleChecklistItem(
  propertyId: string,
  key: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // RLS scopes this — if the caller doesn't own the property, .single()
  // returns no row and we abort.
  const { data: property, error: readError } = await supabase
    .from("properties")
    .select("id, packet_data")
    .eq("id", propertyId)
    .single();

  if (readError || !property) {
    return { ok: false, error: "Property not found or not yours" };
  }

  const current =
    (property.packet_data as Record<string, unknown> | null) ?? {};
  const existing = Array.isArray(current.checklistDone)
    ? (current.checklistDone as string[])
    : [];
  const next = new Set(existing);
  if (done) next.add(key);
  else next.delete(key);

  const admin = createAdminClient();
  const { error: writeError } = await admin
    .from("properties")
    .update({
      packet_data: { ...current, checklistDone: Array.from(next) },
    })
    .eq("id", propertyId);

  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/buyer/properties/${propertyId}`);
  return { ok: true };
}
