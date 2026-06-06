import { Activity, AlertTriangle, CheckCircle2, Target } from "lucide-react";

type Health = "Red" | "Yellow" | "Green";

type HealthProps = {
  overall: Health;
  alignment: number | null;   // 0-100, or null when no question has a win-theme alignment score yet (F-6)
  completeness: number;       // 0-100
  riskCount: number;
};

const TONE: Record<Health, { bg: string; border: string; color: string; label: string }> = {
  Green:  { bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.35)",  color: "#86efac", label: "Healthy" },
  Yellow: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", color: "#fcd34d", label: "Caution" },
  Red:    { bg: "rgba(244,114,114,0.10)", border: "rgba(244,114,114,0.35)", color: "#fca5a5", label: "At Risk" },
};

function scoreColor(pct: number): string {
  if (pct >= 80) return "#86efac";
  if (pct >= 50) return "#fcd34d";
  return "#fca5a5";
}

export function MissionHealthCard({ overall, alignment, completeness, riskCount }: HealthProps) {
  const tone = TONE[overall];
  // F-6: alignment is null until the win-theme alignment writer exists. When null,
  // blend only completeness + risk so we never show a misleading "0% alignment" score.
  const riskScore = Math.max(0, 100 - riskCount * 15);
  const composite = alignment === null
    ? Math.round(completeness * 0.8 + riskScore * 0.2)
    : Math.round(alignment * 0.5 + completeness * 0.4 + riskScore * 0.1);

  return (
    <section
      className="rounded-xl border p-6"
      style={{
        background: `linear-gradient(135deg, ${tone.bg}, rgba(255,255,255,0.02))`,
        borderColor: tone.border,
      }}
      aria-label="IRIS Mission Health Score"
    >
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <Activity size={12} strokeWidth={1.75} />
            IRIS Mission Health
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-[44px] font-bold leading-none tracking-tight" style={{ color: tone.color }}>
              {composite}
              <span className="text-[18px] text-muted-foreground font-normal">/100</span>
            </div>
            <span
              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
            >
              {tone.label}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-[280px] grid grid-cols-3 gap-3">
          <SubScore label="Alignment" value={alignment} suffix="%" icon={<Target size={12} strokeWidth={1.75} />} />
          <SubScore label="Completeness" value={completeness} suffix="%" icon={<CheckCircle2 size={12} strokeWidth={1.75} />} />
          <SubScore
            label="Risk"
            value={riskCount}
            suffix={riskCount === 1 ? "open" : "open"}
            invertTone
            icon={<AlertTriangle size={12} strokeWidth={1.75} />}
          />
        </div>
      </div>
    </section>
  );
}

function SubScore({
  label, value, suffix, icon, invertTone,
}: { label: string; value: number; suffix: string; icon: React.ReactNode; invertTone?: boolean }) {
  let color: string;
  if (invertTone) {
    color = value === 0 ? "#86efac" : value <= 2 ? "#fcd34d" : "#fca5a5";
  } else {
    color = scoreColor(value);
  }
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[22px] font-bold leading-none" style={{ color }}>{value}</span>
        <span className="text-[11px] text-muted-foreground">{suffix}</span>
      </div>
      {!invertTone && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

// ─── Win Themes Card ────────────────────────────────────────────────────────

type WinThemesProps = {
  themes: string[];
  // optional pre-computed alignment per theme (0-100); if absent we display "—"
  alignmentByTheme?: Record<string, number | null>;
};

export function WinThemesCard({ themes, alignmentByTheme }: WinThemesProps) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
      aria-label="Win Themes"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[14px] font-semibold tracking-wide uppercase text-foreground">Win Themes</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">IRIS-calculated alignment of current draft content to each theme.</p>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-muted-foreground">
          No win themes defined yet. Set them in Mission Setup.
        </div>
      ) : (
        <ul className="space-y-2">
          {themes.map((theme, i) => {
            const score = alignmentByTheme?.[theme] ?? null;
            const color = score === null ? "rgba(255,255,255,0.30)" : scoreColor(score);
            return (
              <li
                key={`${theme}-${i}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: color, boxShadow: score !== null ? `0 0 8px ${color}` : undefined }}
                />
                <span className="flex-1 text-[13px] text-foreground leading-snug">{theme}</span>
                <span
                  className="font-mono text-[12px] font-semibold tabular-nums shrink-0"
                  style={{ color: score === null ? "var(--muted-foreground)" : color }}
                >
                  {score === null ? "—" : `${score}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
