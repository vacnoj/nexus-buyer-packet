import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgentEmail } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "../agent/_components/SignOutButton";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (isAgentEmail(user.email)) redirect("/agent");

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-white border-b-2 border-orange">
        <div className="mx-auto max-w-5xl px-6 sm:px-10 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-sm text-ink-muted hidden sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
