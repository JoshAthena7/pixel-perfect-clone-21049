import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Plane, PenTool, Zap, Sparkles, BookOpen, Eye, Home,
  Shield, Users, Activity, ArrowRight, CornerDownLeft,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  onGo: () => void;
  keywords?: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Data: missions
  const { data: missions = [] } = useQuery({
    queryKey: ["cmdk-missions"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state")
        .order("submission_date", { ascending: true })
        .limit(50);
      return (data ?? []) as { id: string; name: string; client: string | null; state: string | null }[];
    },
  });

  // Data: questions for current mission
  const { data: questions = [] } = useQuery({
    queryKey: ["cmdk-questions", missionId],
    enabled: open && !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,mission_id")
        .eq("mission_id", missionId!)
        .order("question_number", { ascending: true })
        .limit(200);
      return (data ?? []) as { id: string; question_number: string; title: string; mission_id: string }[];
    },
  });

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];

    // Mission-scoped jumps
    if (missionId) {
      list.push(
        { id: "j-vault", group: "Jump", label: "Vault", hint: "Mission documents", icon: <BookOpen size={14} className="text-[color:var(--athena-gold,#d4af37)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/library", params: { missionId } }) },
        { id: "j-oracle", group: "Jump", label: "Oracle", hint: "Mission briefing", icon: <Eye size={14} className="text-[color:var(--iris,#22d3ee)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/briefing", params: { missionId } }) },
        { id: "j-intel", group: "Jump", label: "Intelligence", icon: <Sparkles size={14} className="text-[color:var(--iris,#22d3ee)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/intelligence", params: { missionId } }) },
        { id: "j-studio", group: "Jump", label: "Studio · My Assignments", icon: <PenTool size={14} className="text-[#3b7fff]" />,
          onGo: () => navigate({ to: "/missions/$missionId/questions", params: { missionId } }) },
        { id: "j-iris", group: "Jump", label: "Ask IRIS", icon: <Sparkles size={14} className="text-[color:var(--iris,#22d3ee)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/iris", params: { missionId } }) },
        { id: "j-team", group: "Jump", label: "Team", icon: <Users size={14} />,
          onGo: () => navigate({ to: "/missions/$missionId/team", params: { missionId } }) },
        { id: "j-timeline", group: "Jump", label: "Timeline", icon: <Activity size={14} />,
          onGo: () => navigate({ to: "/missions/$missionId/activity", params: { missionId } }) },
        { id: "j-flightplan", group: "Jump", label: "Flight Plan · Mission Overview", icon: <Plane size={14} className="text-[color:var(--yellow,#f59e0b)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }) },
      );
    }

    // Global jumps
    list.push(
      { id: "g-home", group: "Global", label: "Home · Lobby", icon: <Home size={14} />, onGo: () => navigate({ to: "/home" }) },
      { id: "g-command", group: "Global", label: "Command Center", icon: <Zap size={14} className="text-[color:var(--red,#ef4444)]" />,
        onGo: () => navigate({ to: "/command/attention" }) },
      { id: "g-olympus", group: "Global", label: "Olympus · Admin", icon: <Shield size={14} className="text-[color:var(--athena-gold,#d4af37)]" />,
        onGo: () => navigate({ to: "/olympus" }) },
    );

    // Missions
    for (const m of missions) {
      list.push({
        id: `m-${m.id}`,
        group: "Missions",
        label: m.name,
        hint: [m.client, m.state].filter(Boolean).join(" · "),
        icon: <Plane size={14} className="text-[color:var(--yellow,#f59e0b)]" />,
        keywords: `${m.client ?? ""} ${m.state ?? ""}`,
        onGo: () => navigate({ to: "/missions/$missionId/overview", params: { missionId: m.id } }),
      });
    }

    // Questions (current mission only)
    for (const qq of questions) {
      list.push({
        id: `q-${qq.id}`,
        group: "Questions",
        label: `Q${qq.question_number} · ${qq.title}`,
        icon: <PenTool size={14} className="text-[#3b7fff]" />,
        keywords: qq.question_number,
        onGo: () =>
          navigate({
            to: "/missions/$missionId/questions/$questionId",
            params: { missionId: qq.mission_id, questionId: qq.id },
          }),
      });
    }

    return list;
  }, [missionId, missions, questions, navigate]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.slice(0, 40);
    return items
      .filter((it) =>
        (it.label + " " + (it.hint ?? "") + " " + (it.keywords ?? "") + " " + it.group)
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 60);
  }, [items, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    filtered.forEach((it) => {
      if (!m.has(it.group)) m.set(it.group, []);
      m.get(it.group)!.push(it);
    });
    return Array.from(m.entries());
  }, [filtered]);

  useEffect(() => { setIdx(0); }, [q]);

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[idx];
      if (it) { it.onGo(); setOpen(false); }
    }
  }

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
        className="relative w-full max-w-2xl overflow-hidden rounded-[14px] border shadow-2xl"
        style={{
          background: "#0a1220",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.08)",
        }}
      >
        <div className="flex items-center gap-3 border-b px-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to anything — missions, questions, rooms…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden md:inline-flex items-center rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {grouped.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No matches</div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group} className="mb-1">
              <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{group}</div>
              {list.map((it) => {
                flatIdx++;
                const active = flatIdx === idx;
                const myIdx = flatIdx;
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setIdx(myIdx)}
                    onClick={() => { it.onGo(); setOpen(false); }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
                    style={{
                      background: active ? "rgba(34,211,238,0.08)" : "transparent",
                      borderLeft: active ? "2px solid var(--iris,#22d3ee)" : "2px solid transparent",
                    }}
                  >
                    <span className="shrink-0">{it.icon}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-foreground">{it.label}</span>
                      {it.hint && <span className="ml-2 text-xs text-muted-foreground">{it.hint}</span>}
                    </span>
                    {active && <CornerDownLeft size={12} className="text-[color:var(--iris,#22d3ee)]" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
        >
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">↑↓</kbd> navigate
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Sparkles size={11} className="text-[color:var(--iris,#22d3ee)]" />
            ATLAS Command
            <ArrowRight size={11} />
          </span>
        </div>
      </div>
    </div>
  );
}
