import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AGENT_EMAIL } from "@/lib/auth";

// DEV-ONLY backdoor: skips the magic-link email round-trip by minting an
// OTP via the admin API and verifying it server-side with the user-scoped
// client (which sets the session cookies). Returns 404 in production.
//
// Why not just follow the action_link?
// admin.generateLink's action_link works with PKCE flow, but PKCE requires
// a code_verifier set client-side via signInWithOtp first. We don't have
// that, so we use the email_otp instead.
//
// Delete this route + the corresponding button on /login before deploying.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: AGENT_EMAIL,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const otp = data.properties?.email_otp;
  if (!otp) {
    return NextResponse.json(
      { error: "No OTP token returned" },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: AGENT_EMAIL,
    token: otp,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json(
      { error: `verifyOtp failed: ${verifyError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL("/agent", request.url));
}
