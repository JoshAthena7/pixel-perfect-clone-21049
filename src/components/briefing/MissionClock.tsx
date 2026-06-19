import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  missionId: string;
  startDate: string | null | undefined; // ISO
  submissionDate: string | null | undefined; // ISO
};

function startOfUtcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function MissionClock({ missionId, startDate, submissionDate }: Props) {
  const [counts, setCounts] = useState<{ total: number; finalized: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh "today" once per hour so the clock rolls over without a refresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: total }, { count: finalized }] = await Promise.all([
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("question_progress")
          .select("question_id, mission_questions!inner(mission_id)", { count: "exact", head: true })
          .eq("mission_questions.mission_id", missionId)
          .eq("status", "finalized"),
      ]);
      if (cancelled) return;
      setCounts({ total: total ?? 0, finalized: finalized ?? 0 });
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  const data = useMemo(() => {
    if (!submissionDate) return null;
    const startMs = startDate ? startOfUtcDay(new Date(startDate)) : null;
    const subMs = startOfUtcDay(new Date(submissionDate));
    const todayMs = startOfUtcDay(new Date(now));
    const daysRemaining = Math.max(0, Math.round((subMs - todayMs) / 86400000));
    const totalDays = startMs ? Math.max(1, Math.round((subMs - startMs) / 86400000)) : null;
    const daysElapsed = startMs ? Math.max(0, Math.round((todayMs - startMs) / 86400000)) : null;
    const pct = totalDays != null && daysElapsed != null
      ? Math.min(1, Math.max(0, daysElapsed / totalDays))
      : 0;
    return { daysRemaining, totalDays, daysElapsed, pct, startMs, subMs };
  }, [startDate, submissionDate, now]);

  if (!data) return null;
  const { daysRemaining, daysElapsed, pct } = data;

  const ringColor =
    daysRemaining >= 30 ? "rgba(45,212,191,0.8)" :
    daysRemaining >= 14 ? "rgba(196,154,43,0.8)" :
    daysRemaining >= 7 ? "rgba(251,146,60,0.8)" :
    "rgba(248,113,113,0.8)";

  const size = 100;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  const digits = String(daysRemaining).length;
  const numFontSize = digits >= 3 ? 22 : 28;

  const finalized = counts?.finalized ?? 0;
  const total = counts?.total ?? 0;
  const remainingQ = Math.max(0, total - finalized);
  const rate = daysElapsed && daysElapsed > 0 ? finalized / daysElapsed : 0;

  let paceLabel = "";
  let paceColor = "rgba(255,255,255,0.55)";
  let needPerDay = 0;
  if (counts) {
    if (finalized === 0) {
      paceLabel = "Start finalizing to track pace";
    } else if (daysRemaining <= 0) {
      paceLabel = remainingQ === 0 ? "On pace ✓" : "⚠ Behind pace";
      paceColor = remainingQ === 0 ? "rgba(74,222,128,0.95)" : "rgba(248,113,113,0.95)";
    } else {
      needPerDay = Math.ceil(remainingQ / daysRemaining);
      const ratio = rate > 0 ? needPerDay / rate : Infinity;
      if (remainingQ === 0 || ratio <= 1) {
        paceLabel = "On pace ✓";
        paceColor = "rgba(74,222,128,0.95)";
      } else if (ratio < 2) {
        paceLabel = `Need ${needPerDay}/day to finish`;
        paceColor = "rgba(251,191,36,0.95)";
      } else {
        paceLabel = "⚠ Behind pace";
        paceColor = "rgba(248,113,113,0.95)";
      }
    }
  }

  const tooltip = [
    data.startMs ? `Mission started ${new Date(data.startMs).toLocaleDateString()}` : "Start date unknown",
    daysElapsed != null ? `${daysElapsed} days elapsed` : null,
    `${finalized} finalized`,
    `${remainingQ} remaining`,
    `${daysRemaining} days to deadline`,
    needPerDay > 0 ? `Need ${needPerDay} questions/day` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      title={tooltip}
      style={{ width: 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ color: "#fff", fontWeight: 700, fontSize: numFontSize, lineHeight: 1 }}>
            {daysRemaining}
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
            days
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", lineHeight: 1.3 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          {finalized} finalized
        </div>
        <div style={{ fontSize: 10, color: paceColor, marginTop: 2 }}>
          {paceLabel}
        </div>
      </div>
    </div>
  );
}
