"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBuyer } from "../_actions";

function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function NewBuyerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFullName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBuyer({
        fullName,
        email,
        phone: phone || undefined,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition"
      >
        + New buyer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl border border-line w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-purple to-orange h-1 -mx-6 -mt-6 mb-5 rounded-t-xl" />
            <h2 className="font-display text-2xl mb-1">New buyer</h2>
            <p className="text-sm text-ink-muted mb-5">
              Add a client to your roster. They&rsquo;ll be able to log in with
              this email to view properties you create for them.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Full name" required>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputCls}
                  placeholder="The Smith Family"
                />
              </Field>

              <Field label="Email" required>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="client@example.com"
                />
              </Field>

              <Field label="Phone">
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  className={inputCls}
                  placeholder="(555) 000-0000"
                />
              </Field>

              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputCls} h-20`}
                  placeholder="Looking in Franktown / Castle Rock, $1–2M, equestrian property..."
                />
              </Field>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 rounded-md border border-line bg-white hover:bg-cream-muted transition"
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Add buyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-purple focus:ring-2 focus:ring-purple-soft";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1">
        {label}
        {required && <span className="text-orange ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
