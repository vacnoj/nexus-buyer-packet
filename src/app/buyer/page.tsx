import { createClient } from "@/lib/supabase/server";

export default async function BuyerDashboard() {
  const supabase = await createClient();

  // RLS scopes the buyer query to their own row.
  const [{ data: properties, error }, { data: buyer }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, street, city, state, zip, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("buyers").select("full_name").maybeSingle(),
  ]);

  const firstName = buyer?.full_name?.split(/[\s,]/)[0];
  const propertyCount = properties?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-10 py-10">
      <p className="text-[11px] tracking-[3px] uppercase text-orange mb-1">
        Your packets
      </p>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2">
        {firstName ? `Welcome, ${firstName}!` : "Welcome!"}
      </h1>
      <p className="text-ink-muted mb-8 leading-relaxed max-w-2xl">
        {propertyCount === 0
          ? "Your agent will share property packets here as soon as they're ready. You'll get an email when something new shows up."
          : `Here ${propertyCount === 1 ? "is the property packet" : `are the ${propertyCount} property packets`} your agent has put together for you. Click any one to dive in.`}
      </p>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
          Couldn&rsquo;t load properties: {error.message}
        </p>
      )}

      {!error && propertyCount === 0 ? (
        <div className="bg-white border border-dashed border-line rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">🏡</div>
          <h2 className="font-display text-xl mb-2">No packets yet</h2>
          <p className="text-ink-muted text-sm max-w-sm mx-auto">
            Your agent hasn&rsquo;t prepared any property packets for you yet.
            They&rsquo;ll appear here as soon as they do.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {properties?.map((p) => (
            <a
              key={p.id}
              href={`/buyer/properties/${p.id}`}
              className="block bg-white border border-line rounded-xl p-5 hover:border-purple/40 transition"
            >
              <p className="font-display text-lg font-semibold">
                {p.street || "Untitled property"}
              </p>
              <p className="text-sm text-ink-muted">
                {[p.city, p.state].filter(Boolean).join(", ")}
                {p.zip ? ` ${p.zip}` : ""}
              </p>
              <p className="text-xs text-ink-muted mt-3">
                Added{" "}
                {new Date(p.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
