"use client";

import { Packet, type PropertyData } from "@/components/PropertyEditor";
import { estimatedAnnualInsurance } from "@/lib/mortgage";
import { toggleChecklistItem } from "../_actions";

// Read-only packet view for the buyer with auto-saving checklist.
export function BuyerPacketView({
  data,
  propertyId,
}: {
  data: PropertyData;
  propertyId: string;
}) {
  const effectiveInsurance =
    data.insuranceSource === "estimated" || data.annualInsurance == null
      ? estimatedAnnualInsurance(data.homePrice)
      : data.annualInsurance;

  return (
    <Packet
      data={data}
      effectiveInsurance={effectiveInsurance}
      onToggleChecklistItem={async (key, done) => {
        const result = await toggleChecklistItem(propertyId, key, done);
        if (!result.ok) throw new Error(result.error ?? "Save failed");
      }}
    />
  );
}
