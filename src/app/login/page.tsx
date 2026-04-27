"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { isAgentEmail } from "@/lib/auth";

// Two-step OTP-code login. Avoids PKCE-cookie pitfalls when users click
// magic-link emails from a different browser/device than they requested
// from (especially common on mobile Mail apps with in-app web views).
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const normalized = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEmail(normalized);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const cleanCode = code.replace(/\s+/g, "");
    const { error, data } = await supabase.auth.verifyOtp({
      email,
      token: cleanCode,
      type: "email",
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const target = isAgentEmail(data?.user?.email) ? "/agent" : "/buyer";
    router.replace(target);
    router.refresh();
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="bg-gradient-to-r from-purple to-orange h-1 rounded-t-xl" />
        <div className="bg-white rounded-b-xl border border-line border-t-0 p-8 shadow-sm">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>

          {step === "email" ? (
            <>
              <h1 className="font-display text-2xl text-center mb-2">Sign in</h1>
              <p className="text-sm text-ink-muted text-center mb-6">
                Enter your email and we&rsquo;ll send you a 6-digit code.
              </p>
              <form onSubmit={sendCode} className="space-y-4">
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
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </label>
                {error && <ErrorBox>{error}</ErrorBox>}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className={primaryBtnCls}
                >
                  {loading ? "Sending…" : "Send code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl text-center mb-2">
                Check your email
              </h1>
              <p className="text-sm text-ink-muted text-center mb-6 leading-relaxed">
                We sent a 6-digit code to{" "}
                <strong className="text-ink">{email}</strong>. Enter it
                below to sign in.
              </p>
              <form onSubmit={verifyCode} className="space-y-4">
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1">
                    Verification code
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className={`${inputCls} text-center font-display text-2xl tracking-[0.5em] tabular-nums`}
                    placeholder="000000"
                  />
                </label>
                {error && <ErrorBox>{error}</ErrorBox>}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className={primaryBtnCls}
                >
                  {loading ? "Verifying…" : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={backToEmail}
                  className="w-full text-sm text-ink-muted hover:text-ink transition"
                >
                  ← Use a different email
                </button>
              </form>
            </>
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
                  Skip code → sign in as agent
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

const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-purple focus:ring-2 focus:ring-purple-soft";

const primaryBtnCls =
  "w-full px-4 py-2.5 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50";

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
      {children}
    </p>
  );
}
