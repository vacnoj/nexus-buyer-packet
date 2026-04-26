"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the user's session cookies. Use this
// in Client Components for things like sign-in/out flows.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
