"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProperty } from "../_actions";

export function AddPropertyButton({ buyerId }: { buyerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await createProperty(buyerId);
      if (result.ok) {
        router.push(`/agent/buyers/${buyerId}/properties/${result.id}`);
      } else {
        alert(`Couldn't create property: ${result.error}`);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="px-5 py-2 rounded-md bg-purple text-white font-medium hover:bg-purple-deep transition disabled:opacity-50"
    >
      {pending ? "Creating…" : "+ Add property"}
    </button>
  );
}
