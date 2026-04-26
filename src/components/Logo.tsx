// Brand wordmark: "The NEXUS Team" with NEXUS in purple, Team in orange.
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text =
    size === "lg"
      ? "text-2xl"
      : size === "sm"
        ? "text-base"
        : "text-lg";
  return (
    <div
      className={`font-display ${text} tracking-tight flex items-baseline gap-1`}
    >
      <span className="text-ink">The</span>
      <span className="text-purple-deep font-bold">NEXUS</span>
      <span className="text-orange font-bold">Team</span>
    </div>
  );
}
