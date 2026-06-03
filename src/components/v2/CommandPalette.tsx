import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Plane, PenTool, Zap, Sparkles, BookOpen, Eye, Home,
  ArrowRight, CornerDownLeft, Brain, GitFork,
  MessageSquare, RadioTower, ClipboardList, Target, Clock,
  AlertTriangle, Phone, Lightbulb,
} from "lucide-react";
import { globalSearch, type SearchHit } from "@/lib/global-search.functions";
import { SOSModal } from "@/components/v2/SOSButton";
import { toast } from "sonner";

type Tone = "default" | "danger" | "iris";

type JumpItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  onGo: () => void;
  keywords?: string;
  tone?: Tone;
};

const RECENTS_KEY = "atlas.search.recents";
type Recent = { id: string; label: string; hint?: string; group: string; to: string };

function loadRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as Recent[]; } catch { return []; }
}
function saveRecent(r: Recent) {
  try {
    const existing = loadRecents().filter((x) => x.id !== r.id);
    existing.unshift(r);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(existing.slice(0, 3)));
  } catch { /* noop */ }
}

function iconForGroup(group: SearchHit["group"]) {
  switch (group) {
    case "Questions": return <PenTool size={14} className="text-[#3b7fff]" />;
    case "Sources": return <BookOpen size={14} className="text-[color:var(--athena-gold,#d4af37)]" />;
    case "Decisions": return <GitFork size={14} className="text-[color:var(--yellow,#f59e0b)]" />;
    case "Signals": return <RadioTower size={14} className="text-[color:var(--iris,#22d3ee)]" />;
    case "IRIS Memory": return <Brain size={14} className="text-[color:var(--iris,#22d3ee)]" />;
    case "Lessons Learned": return <Lightbulb size={14} className="text-[color:var(--athena-gold,#d4af37)]" />;
    case "Co-Pilot Messages": return <MessageSquare size={14} className="text-[#3b7fff]" />;
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [sosOpen, setSosOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;
  const searchFn = useServerFn(globalSearch);

  // ⌘K / Ctrl+K toggle + custom event from top bar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("atlas:open-search" as any, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas:open-search" as any, onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Mission jump items (always available, but only shown before typing)
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

  // Debounced server search
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const { data: search, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: () => searchFn({ data: { q: debounced } }),
    staleTime: 15_000,
  });

  // Quick actions + jumps (shown when no query)
  const jumps: JumpItem[] = useMemo(() => {
    const list: JumpItem[] = [];
    if (missionId) {
      list.push(
        { id: "j-brief", group: "This mission", label: "Mission Brief", hint: "Leadership view", icon: <ClipboardList size={14} className="text-[#7c3aed]" />,
          onGo: () => navigate({ to: "/missions/$missionId/command", params: { missionId } }) },
        { id: "j-mission", group: "This mission", label: "Mission Room", hint: "Full mission reference", icon: <Sparkles size={14} className="text-[color:var(--yellow,#f59e0b)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }) },
        { id: "j-studio", group: "This mission", label: "Cockpit", hint: "Your work", icon: <PenTool size={14} className="text-[#3b7fff]" />,
          onGo: () => navigate({ to: "/missions/$missionId/questions", params: { missionId } }) },
        { id: "j-vault", group: "This mission", label: "Vault", hint: "Source documents", icon: <BookOpen size={14} className="text-[color:var(--athena-gold,#d4af37)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/library", params: { missionId } }) },
        { id: "j-oracle", group: "This mission", label: "Oracle", hint: "IRIS intelligence", icon: <Eye size={14} className="text-[color:var(--iris,#22d3ee)]" />,
          onGo: () => navigate({ to: "/missions/$missionId/briefing", params: { missionId } }) },
      );
    }
    list.push(
      { id: "g-home", group: "Global", label: "Atrium", hint: "Home", icon: <Home size={14} />, onGo: () => navigate({ to: "/home" }) },
      { id: "g-intel", group: "Global", label: "Intelligence Hub", hint: "All knowledge layers", icon: <Brain size={14} className="text-[color:var(--iris,#22d3ee)]" />,
        onGo: () => navigate({ to: "/intelligence" }) },
    );
    for (const m of missions.slice(0, 5)) {
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
    return list;
  }, [missionId, missions, navigate]);

  const quickActions: JumpItem[] = useMemo(() => {
    const list: JumpItem[] = [
      { id: "qa-update", group: "Quick actions", label: "Update Reality", hint: "Signal to your team",
        icon: <Zap size={16} className="text-[color:var(--accent,#3b7fff)]" />,
        onGo: () => window.dispatchEvent(new CustomEvent("atlas:open-update-reality")) },
      { id: "qa-score", group: "Quick actions", label: "Score Me", hint: "Score a draft response",
        icon: <Target size={16} className="text-[color:var(--accent,#3b7fff)]" />,
        onGo: () => window.dispatchEvent(new CustomEvent("atlas:open-score-me")) },
      { id: "qa-sos", group: "Quick actions", label: "SOS", hint: "Emergency — notify leadership",
        tone: "danger",
        icon: <AlertTriangle size={16} className="text-[color:var(--red,#ef4444)]" />,
        onGo: () => {
          if (missionId) setSosOpen(true);
          else toast.error("Open a mission to send an SOS.");
        } },
      { id: "qa-phone", group: "Quick actions", label: "Phone a Friend", hint: "Talk to an Athena expert",
        icon: <Phone size={16} className="text-[#8b5cf6]" />,
        onGo: () => {
          window.dispatchEvent(new CustomEvent("atlas:open-phone-a-friend"));
          toast("Phone a Friend", { description: "IRIS is finding the right expert for you…" });
        } },
    ];
    if (missionId) {
      list.push({
        id: "qa-ask", group: "Quick actions", label: "Ask IRIS", hint: "Get coaching right now",
        tone: "iris",
        icon: <span className="relative inline-flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#0891b2)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--iris,#0891b2)]" /></span>,
        onGo: () => navigate({ to: "/missions/$missionId/iris", params: { missionId } }),
      });
    } else {
      list.push({
        id: "qa-ask", group: "Quick actions", label: "Ask IRIS", hint: "Get coaching right now",
        tone: "iris",
        icon: <span className="relative inline-flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#0891b2)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--iris,#0891b2)]" /></span>,
        onGo: () => navigate({ to: "/intelligence" }),
      });
    }
    return list;
  }, [navigate, missionId]);

  // Build flat list for keyboard navigation
  type FlatRow =
    | { kind: "jump"; item: JumpItem }
    | { kind: "hit"; item: SearchHit };

  const flat: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    if (debounced.length >= 2 && search) {
      for (const grp of search.groups) for (const it of grp.items) out.push({ kind: "hit", item: it });
      return out;
    }
    // Pre-typing view: recents first, then quick actions, then jumps
    for (const r of recents.slice(0, 3)) {
      out.push({ kind: "jump", item: {
        id: `r-${r.id}`, group: "Recent", label: r.label, hint: r.hint,
        icon: <Clock size={14} className="text-muted-foreground" />,
        onGo: () => navigate({ to: r.to as any }),
      }});
    }
    for (const a of quickActions) out.push({ kind: "jump", item: a });
    for (const j of jumps) out.push({ kind: "jump", item: j });
    return out;
  }, [debounced, search, recents, quickActions, jumps, navigate]);

  const grouped = useMemo(() => {
    const m = new Map<string, FlatRow[]>();
    for (const row of flat) {
      const group = row.kind === "hit" ? row.item.group : row.item.group;
      if (!m.has(group)) m.set(group, []);
      m.get(group)!.push(row);
    }
    return Array.from(m.entries());
  }, [flat]);

  useEffect(() => { setIdx(0); }, [debounced, recents.length]);

  function navigateHit(hit: SearchHit) {
    let to: string | null = null;
    if (hit.href) {
      to = hit.href;
    } else if (hit.questionId && hit.missionId) {
      navigate({ to: "/missions/$missionId/questions/$questionId", params: { missionId: hit.missionId, questionId: hit.questionId } });
      saveRecent({ id: hit.id, label: hit.title, hint: hit.subtitle, group: hit.group, to: `/missions/${hit.missionId}/questions/${hit.questionId}` });
      return;
    } else if (hit.missionId) {
      navigate({ to: "/missions/$missionId/overview", params: { missionId: hit.missionId } });
      saveRecent({ id: hit.id, label: hit.title, hint: hit.subtitle, group: hit.group, to: `/missions/${hit.missionId}/overview` });
      return;
    }
    if (to) {
      navigate({ to: to as any });
      saveRecent({ id: hit.id, label: hit.title, hint: hit.subtitle, group: hit.group, to });
    }
  }

  function activate(row: FlatRow) {
    if (row.kind === "hit") {
      navigateHit(row.item);
    } else {
      row.item.onGo();
    }
    setOpen(false);
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[idx];
      if (row) activate(row);
    }
  }

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
        className="relative w-full max-w-[640px] overflow-hidden rounded-[14px] border shadow-2xl"
        style={{
          background: "var(--bg-surface, #0a1220)",
          borderColor: "var(--border-default, rgba(255,255,255,0.08))",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.08)",
          maxHeight: 520,
        }}
      >
        <div className="flex items-center gap-3 border-b px-6" style={{ borderColor: "var(--border-default, rgba(255,255,255,0.06))" }}>
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Atlas…"
            className="h-[60px] flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground outline-none"
            style={{ padding: "20px 0" }}
          />
          {isFetching && debounced.length >= 2 && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Searching…</span>
          )}
          <kbd className="hidden md:inline-flex items-center rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">ESC</kbd>
        </div>
        <div className="overflow-y-auto py-2" style={{ maxHeight: 400 }}>
          {grouped.length === 0 && debounced.length >= 2 && !isFetching && (
            <div className="px-6 py-10 text-center">
              <div className="text-sm text-muted-foreground">No results for “{debounced}”</div>
              <button
                type="button"
                onClick={() => {
                  if (missionId) {
                    navigate({ to: "/missions/$missionId/iris", params: { missionId }, search: { q: debounced } as any });
                  } else {
                    navigate({ to: "/intelligence" });
                  }
                  setOpen(false);
                }}
                className="mt-2 inline-flex items-center gap-1 text-[12px] text-[color:var(--iris,#22d3ee)] hover:underline"
              >
                Try asking IRIS instead <ArrowRight size={11} />
              </button>
            </div>
          )}
          {grouped.length === 0 && debounced.length < 2 && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Start typing to search Atlas.</div>
          )}
          {grouped.map(([group, list]) => {
            const totalForGroup =
              debounced.length >= 2 && search
                ? (search.groups.find((g) => g.group === group)?.total ?? list.length)
                : list.length;
            return (
              <div key={group} className="mb-1">
                <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span>{group}{debounced.length >= 2 ? ` · ${totalForGroup}` : ""}</span>
                </div>
                {list.map((row) => {
                  flatIdx++;
                  const active = flatIdx === idx;
                  const myIdx = flatIdx;
                  const isHit = row.kind === "hit";
                  const item = row.item as any;
                  const icon = isHit ? iconForGroup((row as any).item.group) : (item.icon as React.ReactNode);
                  const label = item.label ?? item.title;
                  const hint = item.hint ?? item.subtitle;
                  const meta = isHit ? (row as any).item.meta : undefined;
                  const badge = isHit ? (row as any).item.badge : undefined;
                  const tone: Tone = !isHit ? ((item.tone as Tone) ?? "default") : "default";
                  const bg = active
                    ? (tone === "danger" ? "rgba(239,68,68,0.08)" : tone === "iris" ? "rgba(8,145,178,0.08)" : "rgba(255,255,255,0.07)")
                    : (tone === "danger" ? "transparent" : "transparent");
                  const borderColor = active
                    ? (tone === "danger" ? "var(--red,#ef4444)" : tone === "iris" ? "var(--iris,#0891b2)" : "var(--accent,#3b7fff)")
                    : (tone === "danger" ? "rgba(239,68,68,0.3)" : "transparent");
                  const accentColor = tone === "danger" ? "var(--red,#ef4444)" : tone === "iris" ? "var(--iris,#0891b2)" : "var(--accent,#3b7fff)";
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setIdx(myIdx)}
                      onClick={() => activate(row)}
                      className="flex w-full items-center gap-3 px-5 text-left text-sm transition-colors"
                      style={{
                        height: 48,
                        background: bg,
                        borderLeft: `2px solid ${borderColor}`,
                      }}
                    >
                      <span className="shrink-0">{icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {badge && (
                            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {badge}
                            </span>
                          )}
                          <span className="truncate text-[14px] font-medium text-foreground">{label}</span>
                          {hint && <span className="ml-1 truncate text-[12px] text-muted-foreground">{hint}</span>}
                        </span>
                        {meta && <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/70">{meta}</div>}
                      </span>
                      {active && <CornerDownLeft size={12} className="shrink-0" style={{ color: accentColor }} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          className="flex items-center justify-between border-t px-6 py-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
          style={{ borderColor: "var(--border-default, rgba(255,255,255,0.06))", background: "rgba(255,255,255,0.02)" }}
        >
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">↑↓</kbd> navigate
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">↵</kbd> open
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">ESC</kbd> close
          </span>
          <span className="flex items-center gap-1">
            <Sparkles size={11} className="text-[color:var(--iris,#22d3ee)]" />
            Search Atlas
            <ArrowRight size={11} />
          </span>
        </div>
      </div>
    </div>
  );
}
