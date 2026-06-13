import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, X, AlertTriangle, ShieldAlert } from "lucide-react";
import { getMissionOutcome } from "@/lib/iris-mission-close.functions";

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string; border: string; Icon: typeof Trophy }> = {
  win: { label: "WIN", color: "#7DCF7D", bg: "rgba(26,122,74,0.15)", border: "rgba(26,122,74,0.4)", Icon: Trophy },
  loss: { label: "LOSS", color: "#f08080", bg: "rgba(224,74,74,0.15)", border: "rgba(224,74,74,0.4)", Icon: X },
  no_award: { label: "NO AWARD", color: "#EF9F27", bg: "rgba(239,159,39,0.15)", border: "rgba(239,159,39,0.4)", Icon: AlertTriangle },
  cancelled: { label: "CANCELLED", color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", Icon: X },
  protest_pending: { label: "PROTEST PENDING", color: "#EF9F27", bg: "rgba(239,159,39,0.15)", border: "rgba(239,159,39,0.4)", Icon: ShieldAlert },
  protest_sustained: { label: "PROTEST SUSTAINED", color: "#7DCF7D", bg: "rgba(26,122,74,0.15)", border: "rgba(26,122,74,0.4)", Icon: ShieldAlert },
  protest_denied: { label: "PROTEST DENIED", color: "#f08080", bg: "rgba(224,74,74,0.15)", border: "rgba(224,74,74,0.4)", Icon: ShieldAlert },
};

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function MissionOutcomeCard({ missionId }: { missionId: string }) {
  const fn = useServerFn(getMissionOutcome);
  const { data } = useQuery({
    queryKey: ["mission-outcome", missionId],
    queryFn: () => fn({ data: { mission_id: missionId } }),
    staleTime: 30_000,
  });

  if (!data?.outcome) return null;
  const o = data.outcome as {
    outcome: string;
    award_value: number | null;
    award_date: string | null;
    final_score_received: number | null;
    awarded_to: string | null;
    recorded_at: string | null;
  };
  const meta = OUTCOME_LABELS[o.outcome] ?? OUTCOME_LABELS.no_award;
  const Icon = meta.Icon;
  const closedDate = o.recorded_at ? new Date(o.recorded_at).toLocaleDateString() : "—";

  return (
    <div
      className="mb-5 rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full font-semibold"
            style={{
              background: meta.bg,
              border: `0.5px solid ${meta.border}`,
              color: meta.color,
              fontSize: 12,
              padding: "5px 12px",
              letterSpacing: "0.05em",
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
          <div style={{ color: "white", fontSize: 14, fontWeight: 500 }}>Mission Outcome</div>
        </div>
        <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          Closed {closedDate}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <Stat label="Award Value" value={formatMoney(o.award_value)} />
        <Stat label="Award Date" value={o.award_date ? new Date(o.award_date).toLocaleDateString() : "—"} />
        <Stat label="Our Score" value={o.final_score_received != null ? String(o.final_score_received) : "—"} />
        <Stat label="Awarded To" value={o.awarded_to || "—"} />
      </div>

      <div
        className="mt-4 rounded-md p-3"
        style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div style={{ color: "#c9a84c", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}>
              IRIS INTELLIGENCE UPDATED
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
              {data.lesson_count} lesson{data.lesson_count === 1 ? "" : "s"} generated ·{" "}
              {data.competitor_count} competitor record{data.competitor_count === 1 ? "" : "s"} updated
            </div>
          </div>
          <Link
            to="/missions/$missionId/insights"
            params={{ missionId }}
            className="rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              border: "1px solid rgba(201,168,76,0.4)",
              color: "#c9a84c",
              background: "rgba(201,168,76,0.1)",
            }}
          >
            View Lessons Generated →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em" }}>
        {label.toUpperCase()}
      </div>
      <div className="mt-0.5" style={{ color: "white", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
