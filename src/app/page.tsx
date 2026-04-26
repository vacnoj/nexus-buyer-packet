import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";

// Auth-aware landing — sends user to the right dashboard or login.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  redirect(isAgentEmail(user.email) ? "/agent" : "/buyer");
}
