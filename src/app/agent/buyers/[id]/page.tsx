import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddPropertyButton } from "./_components/AddPropertyButton";
import { PropertyCard } from "./_components/PropertyCard";
import { BuyerEmails } from "./_components/BuyerEmails";

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: buyer, error: buyerError } = await supabase
    .from("buyers")
    .select(
      "id, full_name, email, additional_emails, phone, notes, created_at",
    )
    .eq("id", id)
    .single();

  if (buyerError || !buyer) notFound();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, street, city, state, zip, created_at, updated_at")
    .eq("buyer_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-10 py-10">
      <Link
        href="/agent"
        className="text-sm text-purple-deep hover:underline"
      >
        ← Back to all buyers
      </Link>

      <div className="mt-4 mb-8 bg-white border border-line rounded-xl p-6">
        <p className="text-[11px] tracking-[3px] uppercase text-orange mb-1">
          Buyer
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2">
          {buyer.full_name}
        </h1>
        <div className="text-sm text-ink-muted space-y-2">
          <BuyerEmails
            buyerId={buyer.id}
            initialEmail={buyer.email}
            initialAdditional={buyer.additional_emails ?? []}
          />
          {buyer.phone && (
            <div>
              <strong className="text-ink">Phone:</strong> {buyer.phone}
            </div>
          )}
          {buyer.notes && (
            <div className="mt-3 pt-3 border-t border-line text-ink leading-relaxed whitespace-pre-wrap">
              {buyer.notes}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[11px] tracking-[3px] uppercase text-orange mb-1">
            Properties
          </p>
          <h2 className="font-display text-2xl font-semibold">
            Packets for {buyer.full_name}
          </h2>
          <p className="text-ink-muted text-sm mt-1">
            {properties?.length ?? 0} packet
            {(properties?.length ?? 0) === 1 ? "" : "s"} created
          </p>
        </div>
        <AddPropertyButton buyerId={buyer.id} />
      </div>

      {(properties?.length ?? 0) === 0 ? (
        <div className="bg-white border border-dashed border-line rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">🏡</div>
          <h3 className="font-display text-xl mb-2">No properties yet</h3>
          <p className="text-ink-muted text-sm max-w-sm mx-auto">
            Click <strong className="text-ink">+ Add property</strong> to start
            a new packet for {buyer.full_name}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {properties?.map((p) => (
            <PropertyCard key={p.id} buyerId={buyer.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
