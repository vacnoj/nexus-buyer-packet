import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewBuyerDialog } from "./_components/NewBuyerDialog";

export default async function AgentDashboard() {
  const supabase = await createClient();
  const { data: buyers, error } = await supabase
    .from("buyers")
    .select("id, full_name, email, phone, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-10 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-[11px] tracking-[3px] uppercase text-orange mb-1">
            Dashboard
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Active buyers
          </h1>
          <p className="text-ink-muted mt-1">
            {buyers?.length ?? 0} buyer
            {(buyers?.length ?? 0) === 1 ? "" : "s"} on your roster
          </p>
        </div>
        <NewBuyerDialog />
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
          Couldn&rsquo;t load buyers: {error.message}
        </p>
      )}

      {!error && (buyers?.length ?? 0) === 0 ? (
        <div className="bg-white border border-dashed border-line rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">👋</div>
          <h2 className="font-display text-xl mb-2">
            No buyers yet
          </h2>
          <p className="text-ink-muted text-sm max-w-sm mx-auto">
            Click <strong className="text-ink">+ New buyer</strong> to add your
            first client. You&rsquo;ll then be able to add properties and
            generate buyer&rsquo;s packets for them.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-cream-muted/50">
              <tr className="text-left text-[11px] tracking-[2px] uppercase text-ink-muted">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {buyers?.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-line hover:bg-cream-muted/30 transition"
                >
                  <td className="px-5 py-3 font-medium">{b.full_name}</td>
                  <td className="px-5 py-3 text-ink-muted">{b.email}</td>
                  <td className="px-5 py-3 text-ink-muted">
                    {b.phone ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-muted text-sm">
                    {new Date(b.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/agent/buyers/${b.id}`}
                      className="text-purple-deep hover:underline text-sm font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
