import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Plus, Search, X, Loader2, Sparkles, Pencil, Archive, Trash2, ChevronDown } from "lucide-react";
import {
  irisAnalyzeMemory,
  saveIrisMemory,
  archiveIrisMemory,
  deleteIrisMemory,
  approveGlobalMemory,
  rejectGlobalMemory,
} from "@/lib/iris-memory.functions";
import { useSelectedOlympusMission } from "../olympus";

export const Route = createFileRoute("/_authenticated/olympus/iris-memory")({
  component: IrisMemoryPage,
});

const CATEGORIES = [
  "Firm Intelligence",
  "Competitive Intel",
  "Win Strategies",
  "State Knowledge",
  "Client Intelligence",
  "Proposal Lessons",
  "IRIS Preferences",
  "Compliance",
  "Relationships",
  "Other",
] as const;

type Importance = "critical" | "preferred" | "reference";
type Scope = "global" | "mission";

type Memory = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  category: string;
  tags: string[];
  importance: Importance;
  scope: Scope;
  mission_id: string | null;
  source: string | null;
  iris_reasoning: string | null;
  usage_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function IrisMemoryPage() {
  const [tab, setTab] = useState<"memories" | "corrections" | "pending_global">("memories");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [scopeFilter, setScopeFilter] = useState<"all" | Scope>("all");
  const [importanceFilter, setImportanceFilter] = useState<"all" | Importance>("all");
  const [search, setSearch] = useState("");
  const [teachOpen, setTeachOpen] = useState(false);
  const [detail, setDetail] = useState<Memory | null>(null);
  const [editing, setEditing] = useState<Memory | null>(null);
  const qc = useQueryClient();

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["iris-memories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_memories")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as Memory[];
    },
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: memories.length };
    for (const c of CATEGORIES) m[c] = 0;
    for (const x of memories) m[x.category] = (m[x.category] ?? 0) + 1;
    return m;
  }, [memories]);

  const visible = useMemo(() => {
    let list = memories;
    if (activeCategory !== "All") list = list.filter((m) => m.category === activeCategory);
    if (scopeFilter !== "all") list = list.filter((m) => m.scope === scopeFilter);
    if (importanceFilter !== "all") list = list.filter((m) => m.importance === importanceFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.summary ?? "").toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [memories, activeCategory, scopeFilter, importanceFilter, search]);

  const archive = useServerFn(archiveIrisMemory);
  const del = useServerFn(deleteIrisMemory);

  const archiveMut = useMutation({
    mutationFn: (id: string) => archive({ data: { id, archive: true } }),
    onSuccess: () => {
      toast.success("Memory archived");
      qc.invalidateQueries({ queryKey: ["iris-memories"] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Memory deleted");
      qc.invalidateQueries({ queryKey: ["iris-memories"] });
      setDetail(null);
    },
  });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      {/* Header */}
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[600px]">
          <div className="flex items-center gap-3">
            <span
              className="iris-pulse-dot"
              style={{ width: 12, height: 12, borderRadius: 999, background: "var(--iris)", boxShadow: "0 0 0 0 var(--iris-pulse)" }}
            />
            <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--iris)" }}>
              IRIS MEMORY
            </h1>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" style={{ maxWidth: 500 }}>
            Teach IRIS what documents cannot. Every memory you add makes IRIS smarter on every future mission.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTeachOpen(true)}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--iris)" }}
          >
            <Plus className="h-4 w-4" /> Teach IRIS
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory…"
              className="w-64 rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </header>

      <div className="mb-5 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "memories"} onClick={() => setTab("memories")}>Memories</TabButton>
        <TabButton active={tab === "corrections"} onClick={() => setTab("corrections")}>Corrections</TabButton>
        <TabButton active={tab === "pending_global"} onClick={() => setTab("pending_global")}>
          Pending Global Review
        </TabButton>
      </div>

      {tab === "corrections" ? (
        <CorrectionsTab />
      ) : tab === "pending_global" ? (
        <PendingGlobalTab />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Left rail */}
        <aside className="space-y-5">
          <div className="rounded-[10px] border border-border bg-surface p-2">
            <FilterButton active={activeCategory === "All"} onClick={() => setActiveCategory("All")} label="ALL MEMORIES" count={counts.All ?? 0} bold />
            <div className="my-2 border-t border-border" />
            {CATEGORIES.map((c) => (
              <FilterButton
                key={c}
                active={activeCategory === c}
                onClick={() => setActiveCategory(c)}
                label={c}
                count={counts[c] ?? 0}
              />
            ))}
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-3 space-y-3">
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Scope</div>
              <RadioRow label="All" active={scopeFilter === "all"} onClick={() => setScopeFilter("all")} />
              <RadioRow label="Global" active={scopeFilter === "global"} onClick={() => setScopeFilter("global")} />
              <RadioRow label="Mission Specific" active={scopeFilter === "mission"} onClick={() => setScopeFilter("mission")} />
            </div>
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Importance</div>
              <RadioRow label="All" active={importanceFilter === "all"} onClick={() => setImportanceFilter("all")} />
              <RadioRow label="● Critical" active={importanceFilter === "critical"} onClick={() => setImportanceFilter("critical")} />
              <RadioRow label="◉ Preferred" active={importanceFilter === "preferred"} onClick={() => setImportanceFilter("preferred")} />
              <RadioRow label="○ Reference" active={importanceFilter === "reference"} onClick={() => setImportanceFilter("reference")} />
            </div>
          </div>
        </aside>

        {/* Main list */}
        <div>
          {isLoading ? (
            <div className="rounded-[12px] border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
              Loading memories…
            </div>
          ) : visible.length === 0 ? (
            <EmptyState onTeach={() => setTeachOpen(true)} hasAny={memories.length > 0} />
          ) : (
            <div className="space-y-3">
              {visible.map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  onOpen={() => setDetail(m)}
                  onEdit={() => setEditing(m)}
                  onArchive={() => archiveMut.mutate(m.id)}
                  onDelete={() => {
                    if (confirm(`Delete "${m.title}"? IRIS will forget this.`)) delMut.mutate(m.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {teachOpen && (
        <TeachIrisModal
          onClose={() => setTeachOpen(false)}
          onSaved={() => {
            setTeachOpen(false);
            qc.invalidateQueries({ queryKey: ["iris-memories"] });
          }}
        />
      )}

      {editing && (
        <TeachIrisModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["iris-memories"] });
          }}
        />
      )}

      {detail && (
        <DetailDrawer
          memory={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onArchive={() => {
            archiveMut.mutate(detail.id);
            setDetail(null);
          }}
          onDelete={() => {
            if (confirm(`Delete "${detail.title}"?`)) delMut.mutate(detail.id);
          }}
        />
      )}
    </div>
  );
}

/* ───────── Sub-components ───────── */

function FilterButton({ active, onClick, label, count, bold }: { active: boolean; onClick: () => void; label: string; count: number; bold?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      } ${bold ? "font-semibold" : ""}`}
    >
      <span className="truncate">{label}</span>
      <span className="text-[11px]">{count}</span>
    </button>
  );
}

function RadioRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <span
        className="inline-block h-3 w-3 rounded-full border"
        style={{ borderColor: active ? "var(--iris)" : "var(--border-default, #2a3344)", background: active ? "var(--iris)" : "transparent" }}
      />
      <span>{label}</span>
    </button>
  );
}

function ImportanceBadge({ value }: { value: Importance }) {
  if (value === "critical")
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>
        ● CRITICAL
      </span>
    );
  if (value === "preferred")
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" }}>
        ◉ PREFERRED
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      ○ REFERENCE
    </span>
  );
}

function ScopeBadge({ scope, missionId }: { scope: Scope; missionId: string | null }) {
  const { data: missionName } = useQuery({
    queryKey: ["mission-name", missionId],
    enabled: scope === "mission" && !!missionId,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("name").eq("id", missionId!).maybeSingle();
      return data?.name ?? "Mission";
    },
  });
  if (scope === "global")
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: "rgba(8,145,178,0.1)", color: "var(--iris)" }}>
        ⚡ GLOBAL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "rgba(59,127,255,0.1)", color: "#3b7fff" }}>
      {missionName ?? "Mission"}
    </span>
  );
}

function MemoryCard({
  memory, onOpen, onEdit, onArchive, onDelete,
}: {
  memory: Memory;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const preview = (memory.summary || memory.content).split("\n").slice(0, 3).join("\n");
  return (
    <div className="rounded-[12px] border border-border bg-surface p-5 transition-colors hover:bg-surface-hover">
      <div className="mb-3 flex items-center gap-2">
        <ImportanceBadge value={memory.importance} />
        <ScopeBadge scope={memory.scope} missionId={memory.mission_id} />
      </div>
      <button onClick={onOpen} className="block text-left">
        <h3 className="text-[15px] font-semibold leading-snug">{memory.title}</h3>
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{preview}</p>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{memory.category}</span>
        {memory.tags.map((t) => (
          <span key={t} className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <div>
          {memory.source && <span>Source: {memory.source} · </span>}
          Updated {timeAgo(memory.updated_at)}
          {memory.usage_count > 0 && <span> · Used {memory.usage_count}×</span>}
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="Edit" onClick={onEdit}><Pencil className="h-3 w-3" /></IconBtn>
          <IconBtn label="Archive" onClick={onArchive}><Archive className="h-3 w-3" /></IconBtn>
          <IconBtn label="Delete" onClick={onDelete} danger><Trash2 className="h-3 w-3" /></IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface ${danger ? "hover:text-red-400 hover:border-red-500/40" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ───────── Empty state ───────── */

function EmptyState({ onTeach, hasAny }: { onTeach: () => void; hasAny: boolean }) {
  if (hasAny) {
    return (
      <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
        No memories match these filters.
      </div>
    );
  }
  const examples = [
    {
      importance: "critical" as const, scope: "global" as const,
      text: "We never lead with cost savings as a primary differentiator. Athena wins on quality, relationships, and depth of local knowledge.",
    },
    {
      importance: "preferred" as const, scope: "global" as const,
      text: "Indiana evaluators in the 2022 procurement specifically rewarded responses that named county-level partnerships rather than statewide commitments.",
    },
    {
      importance: "reference" as const, scope: "mission" as const,
      text: "The NJ DMAHS director has publicly stated that behavioral health integration is her top priority for the 2026 contract cycle.",
    },
    {
      importance: "critical" as const, scope: "global" as const,
      text: "Our CHW network in Indiana has 200 deployed workers across 12 counties. Always cite Indiana-specific numbers, never national averages.",
    },
    {
      importance: "preferred" as const, scope: "global" as const,
      text: "Competitor A tends to lead with technology and platform claims. We differentiate by leading with people and community presence.",
    },
  ];
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-10">
      <div className="text-center">
        <Brain className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--iris)" }} />
        <h2 className="text-lg font-semibold">Start teaching IRIS</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          IRIS already knows your documents. Now teach it the things documents can't say —
          lessons learned, competitive moves, what evaluators reward, the way Athena wins.
        </p>
        <button
          onClick={onTeach}
          className="mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--iris)" }}
        >
          <Plus className="h-4 w-4" /> Teach IRIS your first memory
        </button>
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--iris)" }}>
          Examples of what to teach
        </div>
        <ul className="space-y-2">
          {examples.map((e, i) => (
            <li key={i} className="flex items-start gap-3 rounded-md border border-border bg-background/40 p-3">
              <div className="flex shrink-0 flex-col gap-1">
                <ImportanceBadge value={e.importance} />
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{e.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───────── Teach IRIS modal ───────── */

type Analysis = {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  importance: Importance;
  scope: Scope;
  reasoning: string;
};

function TeachIrisModal({
  onClose, onSaved, editing,
}: {
  onClose: () => void;
  onSaved: () => void;
  editing?: Memory;
}) {
  const selectedMissionId = useSelectedOlympusMission();
  const [step, setStep] = useState<"input" | "review">(editing ? "review" : "input");
  const [content, setContent] = useState(editing?.content ?? "");
  const [source, setSource] = useState(editing?.source ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [a, setA] = useState<Analysis | null>(
    editing
      ? {
          title: editing.title,
          summary: editing.summary ?? "",
          category: editing.category,
          tags: editing.tags,
          importance: editing.importance,
          scope: editing.scope,
          reasoning: editing.iris_reasoning ?? "",
        }
      : null,
  );
  const [missionId, setMissionId] = useState<string | null>(editing?.mission_id ?? selectedMissionId);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const analyze = useServerFn(irisAnalyzeMemory);
  const save = useServerFn(saveIrisMemory);

  const { data: missions = [] } = useQuery({
    queryKey: ["all-missions-for-memory"],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name,client").order("name");
      return (data ?? []) as Array<{ id: string; name: string; client: string }>;
    },
  });

  async function runAnalyze() {
    if (content.trim().length < 10) {
      toast.error("Add a bit more content for IRIS to work with.");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyze({
        data: {
          content,
          source: source || undefined,
          missionContext: selectedMissionId
            ? { id: selectedMissionId, name: missions.find((m) => m.id === selectedMissionId)?.name ?? "Selected mission" }
            : undefined,
        },
      });
      setA(res);
      setStep("review");
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runSave() {
    if (!a) return;
    setSaving(true);
    try {
      await save({
        data: {
          id: editing?.id,
          title: a.title,
          content,
          summary: a.summary,
          category: a.category,
          tags: a.tags,
          importance: a.importance,
          scope: a.scope,
          missionId: a.scope === "mission" ? missionId : null,
          source: source || null,
          irisReasoning: a.reasoning || null,
        },
      });
      toast.success("● IRIS will remember this.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || !a) return;
    setA({ ...a, tags: Array.from(new Set([...a.tags, t])).slice(0, 20) });
    setTagInput("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10">
      <div className="w-full max-w-[760px] rounded-[14px] border border-border bg-surface shadow-2xl"
        style={{ borderColor: "var(--iris-border)" }}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="iris-pulse-dot" style={{ width: 10, height: 10, borderRadius: 999, background: "var(--iris)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: "var(--iris)" }}>
              {step === "input" ? "IRIS is listening" : editing ? "Edit memory" : "IRIS processed your input"}
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === "input" ? (
            <>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                What do you want me to remember? Paste anything — notes, intel, lessons learned, competitive research,
                client knowledge, strategic guidance. I'll make sense of it.
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or type anything you want IRIS to know…"
                className="w-full resize-y rounded-[12px] px-5 py-4 text-sm leading-relaxed focus:outline-none"
                style={{
                  minHeight: 240,
                  background: "var(--bg-surface-deep, #060b14)",
                  border: "1px solid var(--iris-border)",
                  color: "var(--foreground)",
                }}
              />
              <div className="mt-4">
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                  Where does this come from? (optional)
                </label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Indiana debrief call, June 2026"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={runAnalyze}
                  disabled={analyzing}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md py-[14px] text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: "var(--iris)", height: 52 }}
                >
                  {analyzing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> IRIS is reading this…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Let IRIS process this →</>
                  )}
                </button>
                <button onClick={onClose} className="rounded-md border border-border bg-background px-4 py-2 text-sm">
                  Cancel
                </button>
              </div>
            </>
          ) : a ? (
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Title</label>
                <input
                  value={a.title}
                  onChange={(e) => setA({ ...a, title: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">What IRIS will remember</label>
                <textarea
                  value={a.summary}
                  onChange={(e) => setA({ ...a, summary: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Category</label>
                  <select
                    value={a.category}
                    onChange={(e) => setA({ ...a, category: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tags</label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                    {a.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-[11px]">
                        #{t}
                        <button onClick={() => setA({ ...a, tags: a.tags.filter((x) => x !== t) })} className="text-muted-foreground hover:text-red-400">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="Add tag…"
                      className="flex-1 min-w-[80px] bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-wide text-muted-foreground">Importance</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["critical", "● CRITICAL", "IRIS always uses this first", "#ef4444"],
                    ["preferred", "◉ PREFERRED", "IRIS uses when relevant", "#f59e0b"],
                    ["reference", "○ REFERENCE", "Background context only", "var(--text-muted)"],
                  ] as const).map(([val, label, desc, color]) => (
                    <button
                      key={val}
                      onClick={() => setA({ ...a, importance: val as Importance })}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        a.importance === val ? "border-current" : "border-border hover:border-muted-foreground"
                      }`}
                      style={{ color: a.importance === val ? color : undefined }}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-wide text-muted-foreground">Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setA({ ...a, scope: "global" })}
                    className={`rounded-md border p-3 text-left ${a.scope === "global" ? "border-[color:var(--iris)]" : "border-border"}`}
                  >
                    <div className="text-[12px] font-semibold" style={{ color: a.scope === "global" ? "var(--iris)" : undefined }}>⚡ GLOBAL</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Apply to all missions and all future work</div>
                  </button>
                  <button
                    onClick={() => setA({ ...a, scope: "mission" })}
                    className={`rounded-md border p-3 text-left ${a.scope === "mission" ? "border-[#3b7fff]" : "border-border"}`}
                  >
                    <div className="text-[12px] font-semibold" style={{ color: a.scope === "mission" ? "#3b7fff" : undefined }}>🎯 MISSION SPECIFIC</div>
                    {a.scope === "mission" ? (
                      <select
                        value={missionId ?? ""}
                        onChange={(e) => setMissionId(e.target.value || null)}
                        className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[12px]"
                      >
                        <option value="">Select mission…</option>
                        {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted-foreground">Limit to one mission</div>
                    )}
                  </button>
                </div>
              </div>

              {a.reasoning && (
                <div className="rounded-md border p-3" style={{ borderColor: "var(--iris-border)", background: "var(--iris-subtle)" }}>
                  <button
                    onClick={() => setShowReasoning((s) => !s)}
                    className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: "var(--iris)" }}
                  >
                    <span>● Why IRIS categorized this</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showReasoning ? "rotate-180" : ""}`} />
                  </button>
                  {showReasoning && <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{a.reasoning}</p>}
                </div>
              )}

              <div className="rounded-md border border-border p-3">
                <button onClick={() => setShowOriginal((s) => !s)} className="flex w-full items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>View original →</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showOriginal ? "rotate-180" : ""}`} />
                </button>
                {showOriginal && <pre className="mt-2 whitespace-pre-wrap text-[12px] text-muted-foreground">{content}</pre>}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={runSave}
                  disabled={saving || (a.scope === "mission" && !missionId)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md py-[14px] text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: "var(--iris)", height: 52 }}
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save to IRIS Memory ✓"}
                </button>
                {!editing && (
                  <button onClick={() => setStep("input")} className="rounded-md border border-border bg-background px-4 py-2 text-sm">
                    ← Edit input
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────── Detail drawer ───────── */

function DetailDrawer({
  memory, onClose, onEdit, onArchive, onDelete,
}: {
  memory: Memory;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { data: usage = [] } = useQuery({
    queryKey: ["iris-memory-usage", memory.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_memory_usage")
        .select("id,used_at,context,mission_id,question_id")
        .eq("memory_id", memory.id)
        .order("used_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-[560px] overflow-y-auto border-l border-border bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <ImportanceBadge value={memory.importance} />
            <ScopeBadge scope={memory.scope} missionId={memory.mission_id} />
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <h2 className="text-xl font-semibold leading-tight">{memory.title}</h2>

          {memory.summary && (
            <div className="rounded-md border p-3" style={{ borderColor: "var(--iris-border)", background: "var(--iris-subtle)" }}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--iris)" }}>● IRIS SUMMARY</div>
              <p className="text-[13px] leading-relaxed">{memory.summary}</p>
            </div>
          )}

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Full content</div>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-[13px] leading-relaxed">{memory.content}</pre>
          </div>

          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">Category</dt><dd>{memory.category}</dd>
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {memory.tags.length === 0 ? <span className="text-muted-foreground">—</span> :
                memory.tags.map((t) => <span key={t} className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px]">#{t}</span>)}
            </dd>
            <dt className="text-muted-foreground">Source</dt><dd>{memory.source || "—"}</dd>
            <dt className="text-muted-foreground">Created</dt><dd>{new Date(memory.created_at).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Updated</dt><dd>{timeAgo(memory.updated_at)}</dd>
          </dl>

          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">IRIS usage log</div>
            <p className="mb-2 text-[12px] text-muted-foreground">
              IRIS has referenced this memory <span className="font-semibold text-foreground">{memory.usage_count}</span> times.
            </p>
            {usage.length > 0 && (
              <ul className="space-y-1 text-[12px]">
                {usage.map((u: any) => (
                  <li key={u.id} className="rounded border border-border bg-background px-2 py-1.5">
                    {new Date(u.used_at).toLocaleString()} {u.context ? `· ${u.context}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <Pencil className="h-3.5 w-3.5" /> Edit memory
            </button>
            <button onClick={onArchive} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
            <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="-mb-px border-b-2 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors"
      style={{
        borderColor: active ? "var(--iris)" : "transparent",
        color: active ? "var(--iris)" : "var(--muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}

type Correction = {
  id: string;
  mission_id: string;
  question_id: string | null;
  iris_content_type: string;
  incorrect_text: string;
  correct_text: string;
  criticality: "critical" | "minor" | "small";
  scope: "response" | "mission" | "global";
  flagged_by: string | null;
  flagged_at: string;
  memory_id: string | null;
  resolved: boolean;
};

function CorrectionsTab() {
  const [critFilter, setCritFilter] = useState<"all" | "critical" | "minor" | "small">("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "response" | "mission" | "global">("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["iris-corrections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_corrections")
        .select("*")
        .order("flagged_at", { ascending: false })
        .limit(500);
      return (data ?? []) as Correction[];
    },
  });

  const { data: missions = {} } = useQuery({
    queryKey: ["iris-corrections-missions", rows.map((r) => r.mission_id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(rows.map((r) => r.mission_id)));
      const { data } = await supabase.from("missions").select("id,name").in("id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((m: any) => (map[m.id] = m.name));
      return map;
    },
  });

  const { data: profiles = {} } = useQuery({
    queryKey: ["iris-corrections-profiles", rows.map((r) => r.flagged_by).filter(Boolean).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(rows.map((r) => r.flagged_by).filter(Boolean) as string[]));
      if (!ids.length) return {} as Record<string, string>;
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p.display_name || p.email?.split("@")[0] || "Unknown"));
      return map;
    },
  });

  const visible = useMemo(() => {
    return rows.filter(
      (r) =>
        (critFilter === "all" || r.criticality === critFilter) &&
        (scopeFilter === "all" || r.scope === scopeFilter),
    );
  }, [rows, critFilter, scopeFilter]);

  const patterns = useMemo(() => {
    const buckets = new Map<string, Correction[]>();
    for (const r of rows) {
      const key = r.correct_text.toLowerCase().split(/\s+/).slice(0, 4).join(" ");
      if (!key) continue;
      const arr = buckets.get(key) ?? [];
      arr.push(r);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries()).filter(([, arr]) => arr.length >= 3);
  }, [rows]);

  return (
    <div>
      {patterns.length > 0 && (
        <div className="mb-5 space-y-2">
          {patterns.map(([key, arr]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm"
              style={{ background: "rgba(34,211,238,0.05)", borderColor: "rgba(34,211,238,0.3)" }}
            >
              <div>
                <span className="iris-pulse-dot mr-2" />
                IRIS has been corrected on <b>"{key}…"</b> {arr.length} times. Consider adding a Critical global memory.
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill active={critFilter === "all"} onClick={() => setCritFilter("all")} label="All criticality" />
        <FilterPill active={critFilter === "critical"} onClick={() => setCritFilter("critical")} label="● Changes what we write" color="#ef4444" />
        <FilterPill active={critFilter === "minor"} onClick={() => setCritFilter("minor")} label="◉ Misleading" color="#f59e0b" />
        <FilterPill active={critFilter === "small"} onClick={() => setCritFilter("small")} label="○ Small" color="#94a3b8" />
        <div className="mx-2 h-4 w-px bg-border" />
        <FilterPill active={scopeFilter === "all"} onClick={() => setScopeFilter("all")} label="All scope" />
        <FilterPill active={scopeFilter === "global"} onClick={() => setScopeFilter("global")} label="Global" />
        <FilterPill active={scopeFilter === "mission"} onClick={() => setScopeFilter("mission")} label="Mission" />
        <FilterPill active={scopeFilter === "response"} onClick={() => setScopeFilter("response")} label="Response only" />
      </div>

      {isLoading ? (
        <div className="rounded-[12px] border border-border bg-surface p-10 text-center text-sm text-muted-foreground">Loading corrections…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          No corrections yet. When team members flag an IRIS error, it shows up here.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <CorrectionRow
              key={r.id}
              row={r}
              missionName={missions[r.mission_id] ?? "Unknown mission"}
              userName={(r.flagged_by && profiles[r.flagged_by]) || "Unknown"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-[11px] transition-colors"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        borderColor: active ? (color ?? "rgba(255,255,255,0.3)") : "rgba(255,255,255,0.1)",
        color: active ? (color ?? "white") : "var(--muted-foreground)",
      }}
    >
      {label}
    </button>
  );
}

function CorrectionRow({
  row,
  missionName,
  userName,
}: { row: Correction; missionName: string; userName: string }) {
  const critColor = row.criticality === "critical" ? "#ef4444" : row.criticality === "minor" ? "#f59e0b" : "#94a3b8";
  const critLabel = row.criticality === "critical" ? "Changes what we write" : row.criticality === "minor" ? "Misleading" : "Small";
  return (
    <div className="rounded-[10px] border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className="rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider"
          style={{ color: critColor, borderColor: critColor }}
        >
          {critLabel}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold text-foreground">{missionName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{row.iris_content_type.replace(/_/g, " ")}</span>
        <span className="ml-auto text-muted-foreground">
          {userName} · {new Date(row.flagged_at).toLocaleDateString()}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-2 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-yellow-400">IRIS said</div>
          <div className="text-muted-foreground line-through">{row.incorrect_text}</div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Correct</div>
          <div className="text-foreground">{row.correct_text}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        Scope: {row.scope} {row.memory_id && <span className="text-emerald-400">· Active memory</span>}
      </div>
    </div>
  );
}

/* ───────── C5: Pending Global review queue ─────────
   Memories proposed for global scope land in `pending_global` and stay
   admin-only until reviewed here. Approve promotes to scope='global';
   reject archives with an optional reason. */

function PendingGlobalTab() {
  const qc = useQueryClient();
  const approve = useServerFn(approveGlobalMemory);
  const reject = useServerFn(rejectGlobalMemory);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["iris-memories", "pending_global"],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_memories")
        .select("*")
        .eq("scope", "pending_global" as any)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as Memory[];
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: () => {
      toast.success("Promoted to global memory");
      qc.invalidateQueries({ queryKey: ["iris-memories"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Approve failed"),
  });
  const rejectMut = useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      reject({ data: vars }),
    onSuccess: () => {
      toast.success("Proposal rejected and archived");
      qc.invalidateQueries({ queryKey: ["iris-memories"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reject failed"),
  });

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
        Loading pending global proposals…
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center">
        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="text-sm font-medium text-foreground">No memories awaiting global review</div>
        <p className="mx-auto mt-2 max-w-md text-[12px] text-muted-foreground">
          When a mission-scoped memory is proposed for cross-firm reuse, it will appear here for
          your approval before any other mission can see it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-[12px] text-amber-200/90">
        <strong className="font-semibold">Cross-mission review gate.</strong> Approving promotes
        this memory to <code className="rounded bg-black/40 px-1.5 py-0.5">scope = global</code>{" "}
        and makes it visible inside IRIS to every other mission. Reject if it leaks client
        identity, proprietary strategy, or anything tied to a specific competitor or RFP.
      </div>
      {pending.map((m) => (
        <PendingMemoryCard
          key={m.id}
          memory={m}
          onApprove={() => {
            if (confirm(`Promote "${m.title}" to GLOBAL memory? It will be visible to every mission.`)) {
              approveMut.mutate(m.id);
            }
          }}
          onReject={() => {
            const reason = prompt(`Why are you rejecting "${m.title}"? (optional)`);
            if (reason === null) return;
            rejectMut.mutate({ id: m.id, reason: reason || undefined });
          }}
        />
      ))}
    </div>
  );
}

function PendingMemoryCard({
  memory,
  onApprove,
  onReject,
}: {
  memory: Memory;
  onApprove: () => void;
  onReject: () => void;
}) {
  const preview = (memory.summary || memory.content).split("\n").slice(0, 4).join("\n");
  return (
    <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/[0.02] p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
          ⏳ Pending Global
        </span>
        <ImportanceBadge value={memory.importance} />
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {memory.category}
        </span>
        {memory.mission_id && (
          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
            From mission · {memory.mission_id.slice(0, 8)}
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-semibold leading-snug">{memory.title}</h3>
      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
        {preview}
      </p>
      {memory.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {memory.tags.map((t) => (
            <span key={t} className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/15 pt-3">
        <div className="text-[11px] text-muted-foreground">
          {memory.source && <span>Source: {memory.source} · </span>}
          Proposed {timeAgo(memory.created_at)}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-red-400 hover:border-red-500/40"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-400"
          >
            Approve as Global
          </button>
        </div>
      </div>
    </div>
  );
}
