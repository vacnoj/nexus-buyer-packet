"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="bg-gradient-to-r from-purple to-orange h-1 rounded-t-xl" />
        <div className="bg-white rounded-b-xl border border-line border-t-0 p-8 shadow-sm">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="font-display text-2xl text-center mb-2">
            Sign in
          </h1>
          <p className="text-sm text-ink-muted text-center mb-6">
            We&rsquo;ll email you a magic link — no password needed.
          </p>

          {sent ? (
            <div className="rounded-md bg-success-soft border border-success/30 px-4 py-4 text-sm text-success leading-relaxed">
              <strong className="block mb-1">Check your email.</strong>
              We sent a sign-in link to <strong>{email}</strong>. Click it to
              continue. The link expires in 1 hour.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-ink mb-1">
                  Email
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-purple focus:ring-2 focus:ring-purple-soft"
                  placeholder="you@example.com"
                />
              </label>
              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full px-4 py-2.5 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>
          )}

          {process.env.NODE_ENV !== "production" && (
            <div className="mt-6 pt-6 border-t border-dashed border-warn-deep/30">
              <div className="rounded-md bg-warn-soft border border-warn-deep/30 p-3">
                <p className="text-[10px] tracking-[2px] uppercase text-warn-deep font-bold mb-1">
                  Dev mode
                </p>
                <a
                  href="/api/dev-login"
                  className="block w-full text-center px-3 py-2 rounded-md bg-warn-deep text-white text-sm font-medium hover:opacity-90 transition"
                >
                  Skip magic link → sign in as agent
                </a>
                <p className="text-[11px] text-warn-deep mt-2 leading-snug">
                  Bypasses email entirely via Supabase admin API. Removed
                  before deploy.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
