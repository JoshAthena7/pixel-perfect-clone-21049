import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Sparkles,
  Bolt,
  Info,
  Check,
  Pencil,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMissionCommandBar, markNotificationRead, type CommandBarData } from "@/lib/mission-command-bar.functions";
import { useMissionAccess, useIsAdmin } from "@/hooks/useAccess";

const COLOR = {
  green: "#639922",
  amber: "#EF9F27",
  red: "#E24B4A",
  divider: "rgba(255,255,255,0.10)",
  bg: "#0E1116",
  muted: "rgba(255,255,255,0.55)",
  text: "rgba(255,255,255,0.92)",
  purple: "#8B5CF6",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function countdownColor(days: number | null) {
  if (days == null) return COLOR.muted;
  if (days < 15) return COLOR.red;
  if (days <= 30) return COLOR.amber;
  return COLOR.muted;
}

export function MissionCommandBar({ missionId }: { missionId: string }) {
  const queryClient = useQueryClient();
  const fetchBar = useServerFn(getMissionCommandBar);
  const markRead = useServerFn(markNotificationRead);
  const { isAdmin } = useIsAdmin();
  const { data: access } = useMissionAccess(missionId);
  const role = (access?.role ?? "").toLowerCase();
  const canSeeConfidence = isAdmin || role === "engagement_lead" || role === "project_manager" || role === "lead";

  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);

  const { data } = useQuery({
    queryKey: ["mission-command-bar", missionId],
    queryFn: () => fetchBar({ data: { missionId } }),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  // Realtime: new notifications for this mission
  useEffect(() => {
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`mcb-notifications-${missionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "atlas_notifications" },
        (payload: any) => {
          if (payload.new?.metadata?.mission_id === missionId) {
            queryClient.invalidateQueries({ queryKey: ["mission-command-bar", missionId] });
            setPulse(true);
            if (pulseTimer) clearTimeout(pulseTimer);
            pulseTimer = setTimeout(() => setPulse(false), 600);
          }
        },
      )
      .subscribe();
    return () => {
      if (pulseTimer) clearTimeout(pulseTimer);
      supabase.removeChannel(channel);
    };
  }, [missionId, queryClient]);

  const bar: CommandBarData | undefined = data;

  return (
    <>
      <style>{`
        @keyframes mcb-pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
          100% { transform: scale(1); opacity: 1; }
        }
        .mcb-pulse-once { animation: mcb-pulse 500ms ease-out 1; }
        .mcb-divider { box-shadow: inset -0.5px 0 0 ${COLOR.divider}; }
        .mcb-segment { display: flex; align-items: center; gap: 6px; padding: 0 12px; height: 100%; min-width: 0; }
        .mcb-label { color: ${COLOR.muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .mcb-value { color: ${COLOR.text}; font-size: 12.5px; font-weight: 500; }
        @media (max-width: 767px) {
          .mcb-hide-mobile { display: none !important; }
        }
      `}</style>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: COLOR.bg,
          borderBottom: `1px solid ${COLOR.divider}`,
          backdropFilter: "blur(8px)",
        }}
      >
        {/* COLLAPSED BAR */}
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "stretch",
            color: COLOR.text,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {/* Pulse + Health */}
          <div className="mcb-segment mcb-divider">
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: bar ? COLOR[bar.health.color] : COLOR.muted,
                boxShadow: bar ? `0 0 10px ${COLOR[bar.health.color]}66` : "none",
              }}
            />
            <span className="mcb-label mcb-hide-mobile">Health</span>
            <span
              className="mcb-value"
              style={{ color: bar ? COLOR[bar.health.color] : COLOR.muted }}
            >
              {bar?.health.label ?? "—"}
            </span>
          </div>

          {/* Confidence (role-gated) */}
          {canSeeConfidence && (
            <div className="mcb-segment mcb-divider mcb-hide-mobile">
              <span className="mcb-label">Confidence</span>
              <span className="mcb-value">
                {bar?.confidence.score != null ? `${Math.round(bar.confidence.score)}%` : "—"}
              </span>
              {bar?.confidence.score != null && bar.confidence.trend !== 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 11,
                    color: bar.confidence.trend > 0 ? COLOR.green : COLOR.red,
                  }}
                >
                  {bar.confidence.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(Math.round(bar.confidence.trend))}%
                </span>
              )}
            </div>
          )}

          {/* Focus */}
          <div className="mcb-segment mcb-divider mcb-hide-mobile" style={{ flex: 1, minWidth: 0 }}>
            <span className="mcb-label">Focus</span>
            <span
              className="mcb-value"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: bar?.focus ? COLOR.text : COLOR.muted,
              }}
            >
              {bar?.focus?.text ?? (bar ? "All clear" : "Loading...")}
            </span>
          </div>

          {/* Risk pill */}
          {bar?.risk && (
            <div className="mcb-segment mcb-divider mcb-hide-mobile">
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(239,159,39,0.12)",
                  border: `1px solid ${COLOR.amber}55`,
                  color: COLOR.amber,
                  fontSize: 11.5,
                  fontWeight: 500,
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <AlertTriangle size={12} />
                {bar.risk.title}
              </span>
            </div>
          )}

          {/* IRIS pill */}
          {bar && bar.iris.unread > 0 && (
            <div className="mcb-segment mcb-divider mcb-hide-mobile">
              <span
                className={pulse ? "mcb-pulse-once" : ""}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(139,92,246,0.14)",
                  border: `1px solid ${COLOR.purple}55`,
                  color: COLOR.purple,
                  fontSize: 11.5,
                  fontWeight: 500,
                }}
              >
                <Sparkles size={12} />
                {bar.iris.unread} new signal{bar.iris.unread === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {/* Countdown */}
          <div className="mcb-segment mcb-divider">
            <span
              className="mcb-value"
              style={{ color: countdownColor(bar?.countdown.daysRemaining ?? null) }}
            >
              {bar?.countdown.submissionAt == null
                ? "Submission TBD"
                : `${bar.countdown.daysRemaining}d to submission`}
            </span>
          </div>

          {/* Chevron */}
          <button
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? "Collapse mission command bar" : "Expand mission command bar"}
            style={{
              width: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: COLOR.muted,
            }}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* EXPANDED PANEL */}
        {expanded && bar && (
          <ExpandedPanel
            bar={bar}
            missionId={missionId}
            canSeeConfidence={canSeeConfidence}
            onCollapse={() => setExpanded(false)}
            onRead={async (id) => {
              await markRead({ data: { notificationId: id } });
              queryClient.invalidateQueries({ queryKey: ["mission-command-bar", missionId] });
            }}
          />
        )}
      </div>
    </>
  );
}

function ExpandedPanel({
  bar,
  missionId,
  canSeeConfidence,
  onCollapse,
  onRead,
}: {
  bar: CommandBarData;
  missionId: string;
  canSeeConfidence: boolean;
  onCollapse: () => void;
  onRead: (id: string) => void;
}) {
  const cards = useMemo(() => {
    const arr: Array<{ label: string; primary: string; secondary?: string; color?: string }> = [];
    arr.push({
      label: "Mission Health",
      primary: bar.health.label,
      secondary: `${bar.health.blockers} blocker${bar.health.blockers === 1 ? "" : "s"} · ${bar.health.atRisk} at risk`,
      color: COLOR[bar.health.color],
    });
    if (canSeeConfidence) {
      arr.push({
        label: "Confidence to Win",
        primary: bar.confidence.score != null ? `${Math.round(bar.confidence.score)}%` : "—",
        secondary:
          bar.confidence.previous != null
            ? `${bar.confidence.trend >= 0 ? "Up" : "Down"} from ${Math.round(bar.confidence.previous)}% last week`
            : "Calibrating",
      });
    }
    arr.push({
      label: "Submission",
      primary:
        bar.countdown.submissionAt == null
          ? "TBD"
          : new Date(bar.countdown.submissionAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
      secondary: bar.countdown.daysRemaining != null ? `${bar.countdown.daysRemaining} days remaining` : undefined,
      color: countdownColor(bar.countdown.daysRemaining),
    });
    arr.push({
      label: "Questions Complete",
      primary: `${bar.questions.complete} / ${bar.questions.total || 0}`,
      secondary:
        bar.questions.total > 0
          ? `${Math.round((bar.questions.complete / bar.questions.total) * 100)}%`
          : "No assignments yet",
    });
    arr.push({
      label: "Biggest Risk",
      primary: bar.risk?.title ?? "No approved risks",
      secondary: bar.risk?.action ? `Action: ${bar.risk.action}` : undefined,
      color: bar.risk ? COLOR.amber : undefined,
    });
    arr.push({
      label: "Next Milestone",
      primary: bar.milestone?.title ?? "—",
      secondary: bar.milestone
        ? `${new Date(bar.milestone.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${bar.milestone.ownerName ? ` · ${bar.milestone.ownerName}` : ""}`
        : "No upcoming milestones",
    });
    return arr;
  }, [bar, canSeeConfidence]);

  return (
    <div
      style={{
        background: "#0B0D12",
        borderTop: `1px solid ${COLOR.divider}`,
        padding: "20px 20px 16px",
        animation: "mcb-fade-in 180ms ease-out",
      }}
    >
      <style>{`@keyframes mcb-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Section 1: Metric grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              padding: "12px 14px",
              border: `1px solid ${COLOR.divider}`,
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="mcb-label">{c.label}</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginTop: 4,
                color: c.color ?? COLOR.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.primary}
            </div>
            {c.secondary && (
              <div style={{ fontSize: 11.5, color: COLOR.muted, marginTop: 4 }}>{c.secondary}</div>
            )}
          </div>
        ))}
      </div>

      {/* Section 2: Momentum arc */}
      <div style={{ marginTop: 24 }}>
        <div className="mcb-label" style={{ marginBottom: 10 }}>Mission Momentum</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
          {bar.phases.map((p, i) => {
            const next = bar.phases[i + 1];
            const connectorDone = p.status === "done" && next?.status === "done";
            const bg =
              p.status === "done"
                ? COLOR.green
                : p.status === "active"
                  ? "#3B82F6"
                  : "rgba(255,255,255,0.08)";
            const border = p.status === "pending" ? `1px solid ${COLOR.divider}` : "none";
            const fg = p.status === "pending" ? COLOR.muted : "white";
            return (
              <div key={p.order} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <div style={{ flex: 1, height: 1, background: i === 0 ? "transparent" : COLOR.divider }} />
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: bg,
                      border,
                      color: fg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {p.status === "done" ? <Check size={11} /> : p.status === "active" ? <Pencil size={10} /> : p.order}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: i === bar.phases.length - 1 ? "transparent" : connectorDone ? COLOR.green : COLOR.divider,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: p.status === "pending" ? COLOR.muted : COLOR.text,
                    marginTop: 6,
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {p.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: IRIS feed */}
      <div style={{ marginTop: 24 }}>
        <div className="mcb-label" style={{ marginBottom: 10 }}>IRIS Live Feed</div>
        {bar.iris.items.length === 0 ? (
          <div style={{ fontSize: 12, color: COLOR.muted }}>No new intelligence.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bar.iris.items.slice(0, 3).map((n) => {
              const Icon = n.type?.includes("risk") ? AlertTriangle : n.type?.includes("intel") ? Bolt : Info;
              return (
                <Link
                  key={n.id}
                  to="/missions/$missionId/intelligence"
                  params={{ missionId }}
                  onClick={() => onRead(n.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1px solid ${COLOR.divider}`,
                    background: "rgba(255,255,255,0.02)",
                    textDecoration: "none",
                    color: COLOR.text,
                    fontSize: 12.5,
                  }}
                >
                  <Icon size={14} color={COLOR.purple} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.message}
                  </span>
                  <span style={{ fontSize: 11, color: COLOR.muted, flexShrink: 0 }}>{relTime(n.created_at)}</span>
                </Link>
              );
            })}
          </div>
        )}
        <Link
          to="/missions/$missionId/intelligence"
          params={{ missionId }}
          style={{
            display: "inline-block",
            marginTop: 10,
            fontSize: 11.5,
            color: COLOR.purple,
            textDecoration: "none",
          }}
        >
          View all in Intel Feed →
        </Link>
      </div>

      {/* Section 4: Collapse */}
      <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
        <button
          onClick={onCollapse}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: `1px solid ${COLOR.divider}`,
            color: COLOR.muted,
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          <ChevronUp size={13} /> Collapse
        </button>
      </div>
    </div>
  );
}
