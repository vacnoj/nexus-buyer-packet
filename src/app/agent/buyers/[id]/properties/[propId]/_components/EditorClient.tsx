"use client";

import PropertyEditor, {
  type PropertyData,
} from "@/components/PropertyEditor";
import { saveProperty } from "../../../_actions";

export function EditorClient({
  buyerId,
  propertyId,
  initialData,
}: {
  buyerId: string;
  propertyId: string;
  initialData: Partial<PropertyData>;
}) {
  return (
    <PropertyEditor
      initialData={initialData}
      backHref={`/agent/buyers/${buyerId}`}
      onSave={async (data) => saveProperty(propertyId, data)}
    />
  );
}
