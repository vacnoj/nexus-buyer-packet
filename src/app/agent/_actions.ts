"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";

export type CreateBuyerResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function normalizeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export async function createBuyer(input: {
  fullName: string;
  email: string;
  additionalEmails?: string[];
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
  const additionalEmails = normalizeEmails(
    input.additionalEmails ?? [],
  ).filter((e) => e !== email);

  if (!fullName || !email) {
    return { ok: false, error: "Name and email are required" };
  }

  const { data, error } = await supabase
    .from("buyers")
    .insert({
      full_name: fullName,
      email,
      additional_emails: additionalEmails,
      phone,
      notes,
    })
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

export async function updateBuyerEmails(
  buyerId: string,
  primaryEmail: string,
  additionalEmails: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAgentEmail(user.email)) {
    return { ok: false, error: "Not authorized" };
  }

  const email = primaryEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "Primary email required" };

  const additional = normalizeEmails(additionalEmails).filter(
    (e) => e !== email,
  );

  const { error } = await supabase
    .from("buyers")
    .update({ email, additional_emails: additional })
    .eq("id", buyerId);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That primary email is already used by another buyer",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/agent/buyers/${buyerId}`);
  revalidatePath("/agent");
  return { ok: true };
}
