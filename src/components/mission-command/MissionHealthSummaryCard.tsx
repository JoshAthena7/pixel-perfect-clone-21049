/**
 * Mission Health summary widget — surfaces health rollup counts on the
 * Briefing page so managers don't have to click into the Health tab.
 * Read-only. Visible to all mission members.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye } from "lucide-react";
import { getMissionHealthSummary } from "@/lib/health-controls.functions";

const GOLD = "#D4AF37";
const TEXT = "#ffffff";
const META = "rgba(255,255,255,0.55)";

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(12px)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  padding: 24,
};

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "",
  color: GOLD,
  fontWeight: 700,
};

type Summary = { total: number; healthy: number; watch: number; at_risk: number; unstarted: number; unscored: number };

export function MissionHealthSummaryCard({ missionId }: { missionId: string }) {
  const fetchSummary = useServerFn(getMissionHealthSummary);
  const { data } = useQuery<Summary>({
    queryKey: ["mission-health-summary", missionId],
    queryFn: () => fetchSummary({ data: { missionId } }),
    staleTime: 5 * 60 * 1000,
  });

  const s = data ?? { total: 0, healthy: 0, watch: 0, at_risk: 0, unstarted: 0, unscored: 0 };
  const dotColor =
    s.at_risk > 0 ? "#ef4444" : s.watch > 0 ? "#f59e0b" : "#4ade80";
  const dotPulse = s.at_risk > 0;
  const pct = s.total > 0 ? Math.round((s.healthy / s.total) * 100) : 0;

  const cells: Array<{ key: string; label: string; value: number; color: string; pulse?: boolean }> = [
    { key: "healthy", label: "Healthy", value: s.healthy, color: "#4ade80" },
    { key: "watch", label: "Watch", value: s.watch, color: "#f59e0b" },
    { key: "at_risk", label: "At Risk", value: s.at_risk, color: "#ef4444", pulse: s.at_risk > 0 },
    { key: "unstarted", label: "Unstarted", value: s.unstarted, color: "#94a3b8" },
    { key: "unscored", label: "Unscored", value: s.unscored, color: "#64748b" },
  ].filter((c) => c.value > 0);

  return (
    <section style={glass}>
      <style>{`
        @keyframes mhs-pulse-ring {
          0% { transform: scale(0.9); opacity: 0.7; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(0.9); opacity: 0; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div style={{ position: "relative", width: 12, height: 12 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 9999,
                background: dotColor,
                boxShadow: `0 0 10px ${dotColor}88`,
              }}
            />
            {dotPulse && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 9999,
                  background: dotColor,
                  animation: "mhs-pulse-ring 1.6s ease-out infinite",
                }}
              />
            )}
          </div>
          <div style={cardLabel}>Mission Health</div>
        </div>
        <Link
          to="/missions/$missionId/health"
          params={{ missionId }}
          className="inline-flex items-center gap-1 hover:underline"
          style={{ fontSize: 11, color: GOLD, fontWeight: 600, letterSpacing: "0.06em" }}
        >
          View Health Tab <ArrowRight size={11} />
        </Link>
      </div>

      <div className={`mt-4 grid gap-3 ${cells.length >= 3 ? "grid-cols-3" : cells.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {cells.length === 0 ? (
          <div style={{ fontSize: 12, color: META }}>No questions tracked yet.</div>
        ) : (
          cells.map((c) => <Stat key={c.key} label={c.label} value={c.value} color={c.color} pulse={c.pulse} />)
        )}
      </div>

      <div className="mt-5">
        <div
          className="w-full overflow-hidden"
          style={{ height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.08)" }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #4ade80, #22c55e)",
              transition: "width 320ms ease",
            }}
          />
        </div>
        <div className="mt-2" style={{ fontSize: 12, color: META }}>
          {s.at_risk === 0 && s.healthy === 0 && s.unstarted > 0 ? (
            <>
              <span style={{ color: TEXT, fontWeight: 600 }}>{s.unstarted}</span> questions unstarted — assignments pending.
            </>
          ) : (
            <>
              <span style={{ color: TEXT, fontWeight: 600 }}>{s.healthy}</span> of{" "}
              <span style={{ color: TEXT, fontWeight: 600 }}>{s.total}</span> questions on track
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        {s.at_risk > 0 ? (
          <UrgentRow
            tone="red"
            icon={<AlertTriangle size={14} />}
            text={`${s.at_risk} question${s.at_risk === 1 ? "" : "s"} flagged — follow up`}
            missionId={missionId}
          />
        ) : s.watch > 0 ? (
          <UrgentRow
            tone="amber"
            icon={<Eye size={14} />}
            text={`${s.watch} question${s.watch === 1 ? "" : "s"} to monitor`}
            missionId={missionId}
          />
        ) : s.healthy > 0 ? (
          <div
            className="inline-flex items-center gap-2"
            style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}
          >
            <CheckCircle2 size={14} /> All started questions on track
          </div>
        ) : s.total > 0 ? (
          <div style={{ fontSize: 12, color: META }}>
            Assignments pending — work has not started yet.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: META }}>No questions tracked yet.</div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: `${color}14`,
        border: `1px solid ${color}40`,
      }}
    >
      <div
        className="flex items-baseline gap-2"
        style={{ color, fontSize: 28, fontWeight: 700, lineHeight: 1, fontFeatureSettings: '"tnum"' }}
      >
        {value}
        {pulse && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: color,
              animation: "mhs-pulse-ring 1.4s ease-out infinite",
            }}
          />
        )}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "",
          color,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function UrgentRow({
  tone,
  icon,
  text,
  missionId,
}: {
  tone: "red" | "amber";
  icon: React.ReactNode;
  text: string;
  missionId: string;
}) {
  const color = tone === "red" ? "#ef4444" : "#f59e0b";
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
      style={{ background: `${color}14`, border: `1px solid ${color}40` }}
    >
      <span className="inline-flex items-center gap-2" style={{ color, fontSize: 12, fontWeight: 600 }}>
        {icon} {text}
      </span>
      <Link
        to="/missions/$missionId/health"
        params={{ missionId }}
        className="hover:underline inline-flex items-center gap-1"
        style={{ color, fontSize: 11, fontWeight: 700 }}
      >
        View in Health tab <ArrowRight size={11} />
      </Link>
    </div>
  );
}
