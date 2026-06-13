import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const GOLD = "#C49A2B";

const EVENT_TYPES = [
  { id: "all", label: "All" },
  { id: "signal", label: "Signals" },
  { id: "risk", label: "Risks" },
  { id: "research_finding", label: "Research" },
  { id: "competitive_update", label: "Competitive" },
  { id: "stakeholder_update", label: "Stakeholder" },
  { id: "lesson", label: "Lessons" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  signal: "#3b82f6",
  insight: "#8b5cf6",
  lesson: "#10b981",
  alert: "#f59e0b",
  risk: "#ef4444",
  extraction: "#64748b",
  amendment_change: "#f97316",
  competitive_update: "#ec4899",
  stakeholder_update: "#06b6d4",
  research_finding: "#a3e635",
};

export function IntelFeed({ missionId }: { missionId: string }) {
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["intel-events", missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("intel_events")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = (data ?? []) as any[];
  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.event_type === filter)),
    [events, filter],
  );

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400 * 1000;
    const recent = events.filter((e) => new Date(e.created_at).getTime() > week).length;
    const iris = events.filter((e) => e.generated_by === "iris").length;
    const human = events.filter((e) => e.generated_by === "human").length;
    return { total: events.length, recent, iris, human };
  }, [events]);

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg px-4 py-3 flex flex-wrap gap-6"
        style={{ background: "rgba(5,13,24,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Stat label="Total Events" value={stats.total} />
        <Stat label="This Week" value={stats.recent} />
        <Stat label="IRIS Generated" value={stats.iris} />
        <Stat label="Human Added" value={stats.human} />
      </div>

      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((t) => {
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className="rounded-full transition-colors"
              style={{
                padding: "4px 12px",
                fontSize: 11,
                color: active ? GOLD : "rgba(255,255,255,0.5)",
                background: active ? "rgba(196,154,43,0.12)" : "transparent",
                border: `0.5px solid ${active ? "rgba(196,154,43,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  const color = TYPE_COLORS[event.event_type] || "#64748b";
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(5,13,24,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start gap-3">
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "2px 8px",
            borderRadius: 4,
            background: `${color}22`,
            color,
            border: `1px solid ${color}55`,
            whiteSpace: "nowrap",
          }}
        >
          {event.event_type.replace(/_/g, " ")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white font-medium">{event.title}</div>
          <div className="text-xs text-white/60 mt-1 line-clamp-3">{event.content}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {event.confidence && (
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {String(event.confidence).toUpperCase()}
              </span>
            )}
            {event.generated_by === "iris" && (
              <span style={{ fontSize: 9, color: GOLD }}>● IRIS</span>
            )}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              {new Date(event.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg py-12 text-center"
      style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}
    >
      <div className="text-sm text-white/60">No intelligence events yet.</div>
      <div className="text-xs text-white/35 mt-1">
        Run Full IRIS Analysis to generate events from RFP, threads, and sources.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: GOLD, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
