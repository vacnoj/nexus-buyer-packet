"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";
import type { PropertyData } from "@/components/PropertyEditor";

async function requireAgent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAgentEmail(user.email)) {
    throw new Error("Not authorized");
  }
  return supabase;
}

export async function createProperty(buyerId: string): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const supabase = await requireAgent();
    const { data, error } = await supabase
      .from("properties")
      .insert({ buyer_id: buyerId, packet_data: {} })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/agent/buyers/${buyerId}`);
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function saveProperty(
  propertyId: string,
  data: PropertyData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await requireAgent();
    const { error } = await supabase
      .from("properties")
      .update({
        street: data.street || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        packet_data: data,
      })
      .eq("id", propertyId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/agent/buyers`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function deleteProperty(
  propertyId: string,
  buyerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await requireAgent();
    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", propertyId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/agent/buyers/${buyerId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function deleteBuyer(
  buyerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await requireAgent();
    const { error } = await supabase.from("buyers").delete().eq("id", buyerId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/agent");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
