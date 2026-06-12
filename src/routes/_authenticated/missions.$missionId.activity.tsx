import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  PhoneCall,
  Target,
  Activity as ActivityIcon,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMissionActivity,
  getActivitySynthesis,
  resolveSos,
  type ActivityItem,
  type ActivityStream,
  type ActivityRange,
} from "@/lib/mission-activity.functions";
import { resolveConflict } from "@/lib/iris-conflicts.functions";

export const Route = createFileRoute("/_authenticated/missions/$missionId/activity")({
  component: ActivityPage,
});

const RANGES: { key: ActivityRange; label: string }[] = [
  { key: "24h", label: "Last 24h" },
  { key: "48h", label: "48h" },
  { key: "7d", label: "7 days" },
  { key: "all", label: "All" },
];

const STREAMS: {
  key: ActivityStream;
  label: string;
  color: string;
  Icon: typeof MessageSquare;
}[] = [
  { key: "thread", label: "Thread", color: "rgba(255,255,255,0.6)", Icon: MessageSquare },
  { key: "phone_a_friend", label: "Phone a Friend", color: "#7BA7D4", Icon: PhoneCall },
  { key: "score_me", label: "Score Me", color: "#C49A2B", Icon: Target },
  { key: "mission_pulse", label: "Mission Pulse", color: "rgba(200,195,255,0.85)", Icon: ActivityIcon },
  { key: "sos", label: "SOS", color: "#f08080", Icon: AlertTriangle },
  { key: "conflict", label: "Conflicts", color: "#EF9F27", Icon: AlertTriangle },
];


function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityPage() {
  const { missionId } = Route.useParams();
  const { isAdmin } = Route.useRouteContext() as { isAdmin?: boolean };
  const navigate = useNavigate();

  const [range, setRange] = useState<ActivityRange>("48h");
  const [enabled, setEnabled] = useState<Set<ActivityStream>>(
    () => new Set(STREAMS.map((s) => s.key)),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activityFn = useServerFn(getMissionActivity);
  const synthFn = useServerFn(getActivitySynthesis);
  const resolveFn = useServerFn(resolveSos);
  const resolveConflictFn = useServerFn(resolveConflict);
  const [hiddenConflicts, setHiddenConflicts] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["mission-activity", missionId, range],
    queryFn: () => activityFn({ data: { missionId, range } }),
    refetchInterval: 30_000,
  });

  const { data: synth, isLoading: synthLoading } = useQuery({
    queryKey: ["mission-activity-synth", missionId, range],
    queryFn: () => synthFn({ data: { missionId, range } }),
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo<ActivityItem[]>(() => {
    return (data?.items ?? [])
      .filter((i) => enabled.has(i.stream))
      .filter((i) => !(i.stream === "conflict" && i.conflict_id && hiddenConflicts.has(i.conflict_id)));
  }, [data, enabled, hiddenConflicts]);


  function toggleStream(s: ActivityStream) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      if (next.size === 0) return new Set(STREAMS.map((x) => x.key));
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleResolve(updateId: string) {
    try {
      await resolveFn({ data: { updateId, missionId } });
      toast.success("SOS marked as resolved");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not resolve");
    }
  }

  async function handleResolveConflict(item: ActivityItem) {
    if (!item.conflict_id) return;
    const cid = item.conflict_id;
    // Optimistic remove
    setHiddenConflicts((s) => new Set(s).add(cid));
    try {
      const result = await resolveConflictFn({
        data: { missionId, conflictId: cid },
      });
      if (!result?.success) throw new Error(result?.error ?? "Resolve failed");
      toast.success("Conflict marked resolved");
      refetch();
    } catch (e: any) {
      setHiddenConflicts((s) => {
        const n = new Set(s);
        n.delete(cid);
        return n;
      });
      toast.error("Could not mark resolved. Try again.");
      console.error("[mission-activity] resolveConflict failed", e);
    }
  }


  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6" style={{ color: "white" }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Mission Activity</div>
          <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
            Complete mission intelligence stream
          </div>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                fontSize: 10,
                padding: "4px 10px",
                borderRadius: 999,
                border:
                  range === r.key
                    ? "0.5px solid rgba(196,154,43,0.4)"
                    : "0.5px solid rgba(255,255,255,0.1)",
                background:
                  range === r.key ? "rgba(196,154,43,0.12)" : "rgba(255,255,255,0.02)",
                color: range === r.key ? "#C49A2B" : "rgba(255,255,255,0.55)",
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* IRIS synthesis */}
      <div
        className="mt-4"
        style={{
          border: "0.5px solid rgba(127,119,221,0.25)",
          background: "rgba(127,119,221,0.05)",
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{ color: "#C8C3FF", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}
        >
          <span>◉ IRIS</span>
        </div>
        <div
          className="mt-1.5"
          style={{ color: "white", fontSize: 12, lineHeight: 1.7, fontStyle: "italic" }}
        >
          {synthLoading ? (
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Synthesizing…</span>
          ) : (
            (synth?.synthesis ?? "No activity to synthesize.")
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 mt-5">
        {/* LEFT — TIMELINE */}
        <div>
          {/* filter pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <FilterPill
              active={enabled.size === STREAMS.length}
              label="All"
              color="rgba(255,255,255,0.6)"
              onClick={() => setEnabled(new Set(STREAMS.map((s) => s.key)))}
            />
            {STREAMS.map((s) => (
              <FilterPill
                key={s.key}
                active={enabled.has(s.key)}
                label={s.label}
                color={s.color}
                onClick={() => toggleStream(s.key)}
              />
            ))}
          </div>

          {isLoading && !data ? (
            <div className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="text-center py-12"
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            >
              No activity in this window. Adjust the date range or check that the team has access.
            </div>
          ) : (
            <ol className="relative">
              {filtered.map((item, idx) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  isLast={idx === filtered.length - 1}
                  isExpanded={expanded.has(item.id)}
                  onToggle={() => toggleExpand(item.id)}
                  isAdmin={!!isAdmin}
                  onResolve={() => handleResolve(item.id.replace(/^sos:/, ""))}
                />
              ))}
            </ol>
          )}
        </div>

        {/* RIGHT — ATTENTION RAIL */}
        <aside className="space-y-5">
          <RailSection
            label="NEEDS ATTENTION"
            empty={!data?.rail.staleQuestions.length}
            emptyText="All active questions have recent activity."
          >
            {data?.rail.staleQuestions.map((q) => (
              <RailRow
                key={q.id}
                dotColor="#f08080"
                onClick={() =>
                  navigate({
                    to: "/missions/$missionId/flight-deck",
                    params: { missionId },
                  })
                }
              >
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
                  Q{q.question_number ?? "—"}{" "}
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>
                    · {(q.question_text ?? "").slice(0, 50)}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "#f08080", marginTop: 2 }}>
                  No activity 48h+
                </div>
              </RailRow>
            ))}
          </RailSection>

          {data?.rail.unresolvedSos.length ? (
            <RailSection label="UNRESOLVED SOS">
              {data.rail.unresolvedSos.map((s) => (
                <div
                  key={s.id}
                  className="px-2 py-2 rounded-md"
                  style={{
                    background: "rgba(224,74,74,0.05)",
                    border: "0.5px solid rgba(224,74,74,0.2)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        background: "rgba(224,74,74,0.2)",
                        color: "#f08080",
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                    >
                      {(s.severity ?? "WATCH").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                      {s.sender_name} · {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                    {s.body.slice(0, 80)}
                    {s.body.length > 80 ? "…" : ""}
                  </div>
                </div>
              ))}
            </RailSection>
          ) : null}

          {data?.rail.awaitingExpert.length ? (
            <RailSection label="AWAITING EXPERT">
              {data.rail.awaitingExpert.map((e) => (
                <RailRow key={e.id} dotColor="#7BA7D4">
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
                    {e.sender_name} waiting on expertise
                    {e.question_number ? ` for Q${e.question_number}` : ""}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {timeAgo(e.created_at)}
                  </div>
                </RailRow>
              ))}
            </RailSection>
          ) : null}

          <RailSection
            label="SCORE TRENDS"
            empty={!data?.rail.negativeScoreTrends.length}
            emptyText="Score trends are stable or improving."
          >
            {data?.rail.negativeScoreTrends.map((t) => (
              <RailRow
                key={t.question_id}
                dotColor="#EF9F27"
                onClick={() =>
                  navigate({
                    to: "/missions/$missionId/flight-deck",
                    params: { missionId },
                  })
                }
              >
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
                  Q{t.question_number ?? "—"} — score dropped {Math.abs(t.delta).toFixed(1)} points
                </div>
              </RailRow>
            ))}
          </RailSection>
        </aside>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        padding: "4px 10px",
        borderRadius: 999,
        border: active ? `0.5px solid ${color}` : "0.5px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(255,255,255,0.04)" : "transparent",
        color: active ? color : "rgba(255,255,255,0.4)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function TimelineRow({
  item,
  isLast,
  isExpanded,
  onToggle,
  isAdmin,
  onResolve,
}: {
  item: ActivityItem;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onResolve: () => void;
}) {
  const meta = STREAMS.find((s) => s.key === item.stream)!;
  const isSos = item.stream === "sos";
  const emerging = item.emerging_risk;

  return (
    <li className="relative flex gap-3 pb-4">
      {/* dot + line */}
      <div className="flex flex-col items-center" style={{ paddingTop: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: meta.color,
            flexShrink: 0,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 1,
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              marginTop: 4,
            }}
          />
        )}
      </div>

      {/* content */}
      <div
        className="flex-1 rounded-md px-3 py-2"
        style={{
          background: isSos
            ? "rgba(224,74,74,0.05)"
            : isExpanded
              ? "rgba(255,255,255,0.03)"
              : "transparent",
          border: "0.5px solid rgba(255,255,255,0.06)",
          borderLeft: emerging
            ? "2px solid #f08080"
            : isSos
              ? "2px solid rgba(224,74,74,0.4)"
              : `0.5px solid rgba(255,255,255,0.06)`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 8,
                color: meta.color,
                background: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${meta.color}`,
                padding: "1px 6px",
                borderRadius: 3,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {meta.label}
            </span>
            {item.question_number && (
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  fontStyle: "italic",
                }}
              >
                Q{item.question_number}
                {item.question_text ? ` — ${item.question_text.slice(0, 50)}` : ""}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 9,
            }}
          >
            <span>{timeAgo(item.created_at)}</span>
            <ChevronRight
              className="h-3 w-3"
              style={{
                transition: "transform 150ms",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
              }}
            />
          </button>
        </div>

        <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
          {item.summary}
        </div>

        {isExpanded && (
          <div
            className="mt-2 pt-2"
            style={{
              borderTop: "0.5px dashed rgba(255,255,255,0.08)",
              fontSize: 11,
              color: "rgba(255,255,255,0.7)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {item.detail || "(no additional detail)"}
            {isSos && item.update_type === "sos" && !item.resolved && isAdmin && (
              <div className="mt-3">
                <button
                  onClick={onResolve}
                  style={{
                    fontSize: 10,
                    padding: "4px 10px",
                    background: "rgba(26,122,74,0.15)",
                    border: "0.5px solid rgba(26,122,74,0.4)",
                    color: "#7FD4A8",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Mark resolved
                </button>
              </div>
            )}
            {isSos && item.resolved && (
              <div className="mt-2" style={{ color: "#7FD4A8", fontSize: 10 }}>
                ✓ Resolved
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function RailSection({
  label,
  children,
  empty,
  emptyText,
}: {
  label: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: "0.1em",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div className="space-y-1.5">
        {empty ? (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function RailRow({
  dotColor,
  children,
  onClick,
}: {
  dotColor: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex gap-2 items-start px-2 py-1.5 rounded-md hover:bg-white/[0.03]"
      style={{
        background: "transparent",
        border: "0.5px solid rgba(255,255,255,0.05)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dotColor,
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <div className="flex-1">{children}</div>
    </button>
  );
}
