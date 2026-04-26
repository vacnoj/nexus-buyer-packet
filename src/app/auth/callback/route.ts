import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";

// Magic-link redirect target. Supabase appends ?code=... and we exchange
// that for a session, then route to the right dashboard based on email.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorDesc = url.searchParams.get("error_description");

  if (errorDesc) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDesc)}`, url),
    );
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/login?error=session-missing", url),
    );
  }

  const target = isAgentEmail(user.email) ? "/agent" : "/buyer";
  return NextResponse.redirect(new URL(target, url));
}
