import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getMissionActivity, type ActivityItem, type ActivityStream } from "@/lib/mission-activity.functions";

const GOLD = "#c9a84c";

function relTime(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

type FilterKey = "all" | "check_in" | "sticky_note" | "score_me" | "mission_pulse" | "sos" | "brief_exported" | "nudge";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "check_in", label: "Check-Ins" },
  { key: "sticky_note", label: "Notes" },
  { key: "score_me", label: "Scores" },
  { key: "sos", label: "SOS" },
  { key: "brief_exported", label: "Briefs" },
];

const ICON: Record<ActivityStream, { glyph: string; color: string }> = {
  check_in:       { glyph: "●",  color: "#3b82f6" },
  sticky_note:    { glyph: "📌", color: "#f59e0b" },
  score_me:       { glyph: "🎯", color: GOLD },
  mission_pulse:  { glyph: "◉",  color: "#a855f7" },
  sos:            { glyph: "⚠",  color: "#ef4444" },
  brief_exported: { glyph: "↓",  color: "#22c55e" },
  thread:         { glyph: "💬", color: "#60a5fa" },
  phone_a_friend: { glyph: "☎",  color: "#fbbf24" },
  conflict:       { glyph: "⚡", color: "#f97316" },
  nudge:          { glyph: "👋", color: "#c9a84c" },
  writer_reviewed:{ glyph: "👁", color: "#94a3b8" },
  writer_flagged: { glyph: "🚩", color: "#f59e0b" },
};

export function MissionRadar({ missionId, bare = false }: { missionId: string; bare?: boolean }) {
  const navigate = useNavigate();
  const fetchActivity = useServerFn(getMissionActivity);
  const [filter, setFilter] = useState<FilterKey>("all");

  const q = useQuery({
    queryKey: ["mission-radar", missionId],
    queryFn: () => fetchActivity({ data: { missionId, range: "7d" as const } }),
    refetchInterval: 30_000,
  });

  const items: ActivityItem[] = q.data?.items ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.stream === filter);
  }, [items, filter]);

  const filterPills = (
    <div className="flex flex-wrap gap-1 justify-end">
      {FILTERS.map((f) => {
        const active = filter === f.key;
        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition ${
              active
                ? "bg-amber-500/20 border-amber-400/40 text-amber-100"
                : "bg-white/[0.03] border-white/10 text-white/55 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );

  const list = (
    <>
      {q.isLoading ? (
        <div className="text-xs text-white/40 py-6 text-center">Scanning the airspace…</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-white/40 py-10 text-center px-4 leading-relaxed">
          <div className="text-2xl mb-2 opacity-50">📡</div>
          Radar is clear. Activity appears here the moment it happens.
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {filtered.map((it) => {
            const icon = ICON[it.stream] ?? { glyph: "•", color: "#94a3b8" };
            return (
              <li
                key={it.id}
                className="group flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.03] cursor-pointer animate-in fade-in"
                style={{ minHeight: 44 }}
                onClick={() => {
                  if (!it.question_id) return;
                  navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: it.question_id });
                }}
              >
                <span className="shrink-0 w-4 text-center text-[12px]" style={{ color: icon.color }}>
                  {icon.glyph}
                </span>
                <div className="flex-1 min-w-0 text-[12px] text-white/85 leading-snug truncate">
                  {it.question_number ? (
                    <span style={{ color: GOLD }} className="font-mono mr-1">Q{it.question_number}</span>
                  ) : null}
                  {it.summary}
                </div>
                <span
                  className="shrink-0 text-[10px] text-white/40 group-hover:hidden"
                  style={{ fontFamily: "'Courier New', monospace" }}
                >
                  {relTime(it.created_at)}
                </span>
                <span className="shrink-0 text-[10px] text-amber-300 hidden group-hover:inline">→ View</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-1.5 border-b border-white/[0.04] bg-[#050d18] sticky top-0 z-[1]">{filterPills}</div>
        <div className="flex-1 overflow-y-auto">{list}</div>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.015] p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-[13px] font-semibold text-white">Mission Radar</h2>
          <p className="text-[11px] text-white/45 mt-0.5">Everything happening on this mission, newest first</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-white/45">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
        </span>
      </header>
      <div className="mb-3">{filterPills}</div>
      <div className="overflow-y-auto pr-1" style={{ height: 300 }}>{list}</div>
    </section>
  );
}
