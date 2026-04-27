"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBuyerEmails } from "@/app/agent/_actions";

export function BuyerEmails({
  buyerId,
  initialEmail,
  initialAdditional,
}: {
  buyerId: string;
  initialEmail: string;
  initialAdditional: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [primary, setPrimary] = useState(initialEmail);
  const [additional, setAdditional] = useState<string[]>(
    initialAdditional ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPrimary(initialEmail);
    setAdditional(initialAdditional ?? []);
    setError(null);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBuyerEmails(
        buyerId,
        primary,
        additional.filter((e) => e.trim()),
      );
      if (!result.ok) {
        setError(result.error ?? "Save failed");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    const all = [initialEmail, ...(initialAdditional ?? [])].filter(Boolean);
    return (
      <div className="flex items-start gap-2 flex-wrap">
        <strong className="text-ink">
          {all.length === 1 ? "Email:" : "Emails:"}
        </strong>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {all.map((e, i) => (
            <span key={e} className="text-ink-muted">
              {e}
              {i === 0 && all.length > 1 && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-orange">
                  primary
                </span>
              )}
              {i < all.length - 1 && <span>,</span>}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-2 text-xs text-purple-deep hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-ink-muted mb-1">
          Primary email
        </span>
        <input
          type="email"
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          className={inputCls}
        />
      </label>

      {additional.length > 0 && (
        <div>
          <span className="block text-xs uppercase tracking-wider text-ink-muted mb-1">
            Additional emails
          </span>
          {additional.map((e, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="email"
                value={e}
                onChange={(ev) => {
                  const v = ev.target.value;
                  setAdditional((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  });
                }}
                className={inputCls}
                placeholder="another@example.com"
              />
              <button
                type="button"
                onClick={() =>
                  setAdditional((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="px-3 text-sm text-ink-muted hover:text-red-700"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdditional((prev) => [...prev, ""])}
        className="text-xs text-purple-deep hover:underline"
      >
        + Add another email
      </button>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !primary.trim()}
          className="px-4 py-1.5 rounded-md bg-purple text-white text-sm font-medium hover:bg-purple-deep transition disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="px-4 py-1.5 rounded-md border border-line bg-white text-sm hover:bg-cream-muted transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-purple focus:ring-2 focus:ring-purple-soft";
