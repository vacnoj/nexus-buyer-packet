"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";

export type CreateBuyerResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createBuyer(input: {
  fullName: string;
  email: string;
  phone?: string;
  notes?: string;
}): Promise<CreateBuyerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAgentEmail(user.email)) {
    return { ok: false, error: "Not authorized" };
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (!fullName || !email) {
    return { ok: false, error: "Name and email are required" };
  }

  const { data, error } = await supabase
    .from("buyers")
    .insert({ full_name: fullName, email, phone, notes })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A buyer with that email already exists" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/agent");
  return { ok: true, id: data.id };
}
