import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — only use in server actions / route
// handlers that have already authorized the caller manually.
export function createAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
