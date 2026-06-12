export function HealthBadge({ health, size = "lg" }: { health: "green" | "amber" | "red"; size?: "lg" | "sm" }) {
  const map = {
    green: { label: "● HEALTHY", bg: "rgba(26,122,74,0.15)", border: "rgba(26,122,74,0.4)", color: "#7DCF7D" },
    amber: { label: "⚡ AMBER", bg: "rgba(239,159,39,0.15)", border: "rgba(239,159,39,0.4)", color: "#EF9F27" },
    red: { label: "🔴 AT RISK", bg: "rgba(224,74,74,0.15)", border: "rgba(224,74,74,0.4)", color: "#f08080" },
  } as const;
  const s = map[health];
  return (
    <span
      className="inline-flex items-center rounded-full font-medium"
      style={{
        background: s.bg,
        border: `0.5px solid ${s.border}`,
        color: s.color,
        fontSize: size === "lg" ? 12 : 10,
        padding: size === "lg" ? "5px 12px" : "2px 8px",
        letterSpacing: "0.05em",
      }}
    >
      {s.label}
    </span>
  );
}

export function BriefingHeader({
  missionName,
  clientName,
  health,
}: {
  missionName: string;
  clientName: string | null;
  health: "green" | "amber" | "red";
}) {
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 style={{ color: "white", fontSize: 18, fontWeight: 500 }} className="truncate">
            {missionName}
          </h1>
          {clientName && (
            <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              {clientName}
            </div>
          )}
        </div>
        <HealthBadge health={health} />
      </div>
      <div
        className="mt-2"
        style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontStyle: "italic" }}
      >
        This room is maintained by Olympus. Read only.
      </div>
    </header>
  );
}
