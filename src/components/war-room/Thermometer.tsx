import { useEffect, useState } from "react";

type Tier = {
  label: string;
  color: string; // CSS color
  glow: string;
  pulse?: boolean;
};

function tierFor(score: number): Tier {
  if (score >= 76) return { label: "Critical", color: "var(--red)", glow: "color-mix(in oklab, var(--red) 45%, transparent)", pulse: true };
  if (score >= 56) return { label: "Elevated", color: "var(--orange)", glow: "color-mix(in oklab, var(--orange) 40%, transparent)" };
  if (score >= 31) return { label: "Warming", color: "var(--yellow)", glow: "color-mix(in oklab, var(--yellow) 35%, transparent)" };
  return { label: "Stable", color: "#3b82f6", glow: "color-mix(in oklab, #3b82f6 35%, transparent)" };
}

export function Thermometer({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tier = tierFor(clamped);
  // Smooth-animate from previous fill height
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  return (
    <div className="flex items-center gap-5">
      {/* Thermometer graphic */}
      <div className="relative" style={{ width: 56, height: 180 }} aria-hidden>
        {/* Tube */}
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 overflow-hidden rounded-full border border-border bg-surface-hover"
          style={{ width: 18, height: 150 }}
        >
          {/* Fill */}
          <div
            className={tier.pulse ? "absolute bottom-0 left-0 right-0 animate-pulse" : "absolute bottom-0 left-0 right-0"}
            style={{
              height: `${fill}%`,
              background: `linear-gradient(to top, ${tier.color}, color-mix(in oklab, ${tier.color} 70%, white))`,
              transition: "height 700ms cubic-bezier(0.22, 1, 0.36, 1), background 400ms ease",
              boxShadow: `0 0 14px ${tier.glow}`,
            }}
          />
          {/* Tick marks */}
          {[25, 50, 75].map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 h-px bg-border/60"
              style={{ bottom: `${t}%` }}
            />
          ))}
        </div>
        {/* Bulb */}
        <div
          className={tier.pulse ? "absolute left-1/2 -translate-x-1/2 rounded-full border border-border animate-pulse" : "absolute left-1/2 -translate-x-1/2 rounded-full border border-border"}
          style={{
            bottom: 0,
            width: 36,
            height: 36,
            background: `radial-gradient(circle at 35% 35%, color-mix(in oklab, ${tier.color} 60%, white), ${tier.color})`,
            boxShadow: `0 0 18px ${tier.glow}`,
            transition: "background 400ms ease, box-shadow 400ms ease",
          }}
        />
      </div>

      {/* Label + score */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Engagement Temperature</div>
        <div
          className="text-3xl font-black leading-tight"
          style={{ color: tier.color, textShadow: tier.pulse ? `0 0 14px ${tier.glow}` : undefined }}
        >
          {tier.label}
        </div>
        <div className="mt-1 text-sm text-muted-foreground tabular-nums">
          Score: <span className="font-semibold text-foreground">{clamped}</span> / 100
        </div>
      </div>
    </div>
  );
}

/**
 * Score formula:
 *  +20 per open Red SOS  (max 40)
 *  +10 per open Orange SOS (max 20)
 *  +15 per High severity + High likelihood risk (max 30)
 *  +10 if most recent client pulse is "Concerned"
 *  +5  if most recent client pulse is "Neutral"
 *  +10 if last 2 consecutive huddles are Yellow or Red
 *  +20 if last huddle health is Red
 *  cap 100
 */
export function calcTemperature(input: {
  sos: { severity: string; status: string }[];
  risks: { severity: string; likelihood: string; status: string }[];
  latestPulseSentiment: string | null;
  recentHuddles: { health: string }[]; // ordered newest-first
}): number {
  let score = 0;

  const openSos = input.sos.filter((s) => s.status !== "Resolved");
  const redCount = openSos.filter((s) => s.severity === "Critical" || s.severity === "Red").length;
  const orangeCount = openSos.filter((s) => s.severity === "High" || s.severity === "Orange").length;
  score += Math.min(redCount * 20, 40);
  score += Math.min(orangeCount * 10, 20);

  const hotRisks = input.risks.filter(
    (r) => r.status !== "Closed" && r.severity === "High" && r.likelihood === "High",
  ).length;
  score += Math.min(hotRisks * 15, 30);

  const s = (input.latestPulseSentiment ?? "").toLowerCase();
  if (s === "concerned") score += 10;
  else if (s === "neutral") score += 5;

  const last2 = input.recentHuddles.slice(0, 2);
  if (last2.length === 2 && last2.every((h) => h.health === "Yellow" || h.health === "Red")) {
    score += 10;
  }
  if (input.recentHuddles[0]?.health === "Red") score += 20;

  return Math.min(100, score);
}
