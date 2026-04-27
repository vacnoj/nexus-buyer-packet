"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProperty } from "../_actions";

export function PropertyCard({
  buyerId,
  property,
}: {
  buyerId: string;
  property: {
    id: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    updated_at: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await deleteProperty(property.id, buyerId);
      if (!result.ok) {
        alert(`Couldn't delete: ${result.error}`);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  function cancelDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  }

  return (
    <div className="relative group bg-white border border-line rounded-xl hover:border-purple/40 transition">
      <Link
        href={`/agent/buyers/${buyerId}/properties/${property.id}`}
        className="block p-5 pr-14"
      >
        <p className="font-display text-lg font-semibold">
          {property.street || "Untitled property"}
        </p>
        <p className="text-sm text-ink-muted">
          {[property.city, property.state].filter(Boolean).join(", ") || "—"}
          {property.zip ? ` ${property.zip}` : ""}
        </p>
        <p className="text-xs text-ink-muted mt-3">
          Updated{" "}
          {new Date(property.updated_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </Link>

      <div className="absolute top-3 right-3 flex items-center gap-1">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={cancelDelete}
              disabled={pending}
              className="px-2.5 py-1 rounded-md border border-line bg-white text-xs hover:bg-cream-muted transition"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete property"
            className="opacity-70 group-hover:opacity-100 focus:opacity-100 transition px-2 py-1 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 text-xs font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
