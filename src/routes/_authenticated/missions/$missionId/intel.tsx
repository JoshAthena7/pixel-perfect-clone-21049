import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  ExternalLink,
  Search,
  Sparkles,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  ChevronRight,
} from "lucide-react";
import { VaultIcon } from "@/components/v2/icons/AtlasIcons";
import {
  getLibraryIndexStatus,
  reindexMissionDocuments,
} from "@/lib/mission-activation.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intel")({
  component: IntelPage,
});

const CATEGORIES = [
  "RFP",
  "Amendments",
  "Q&A Documents",
  "Client Materials",
  "Contract Template",
  "Win Themes",
  "Contacts",
  "Past Submissions",
  "Source Documents",
  "Meeting Notes",
  "Research",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

type Doc = {
  id: string;
  mission_id: string;
  name: string;
  category: string;
  notes: string | null;
  url: string | null;
  file_path: string | null;
  is_rfp: boolean | null;
  added_by: string | null;
  created_at: string;
  file_hash: string | null;
  file_size: number | null;
  source: string | null;
};

type IrisBrief = {
  brief_text: string;
  generated_at: string;
};

type Tab = "brief" | "all" | "category";
type SourceFilter = "all" | "iris" | "team";

function IntelPage() {
  const { missionId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("brief");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const qc = useQueryClient();
  const statusFn = useServerFn(getLibraryIndexStatus);
  const reindexFn = useServerFn(reindexMissionDocuments);
  const [reindexing, setReindexing] = useState(false);

  // ── Docs ──────────────────────────────────────────────
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["mission-library", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
  });

  const { data: indexStatus } = useQuery({
    queryKey: ["mission-library-index", missionId],
    queryFn: () => statusFn({ data: { missionId } }),
  });
  const indexedIds = useMemo(
    () => new Set(indexStatus?.indexedDocumentIds ?? []),
    [indexStatus]
  );

  // ── IRIS Brief ────────────────────────────────────────
  const { data: irisBrief, isLoading: briefLoading } = useQuery({
    queryKey: ["mission-iris-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_brief_cache")
        .select("brief_text,generated_at")
        .eq("scope", "mission")
        .eq("ref_id", missionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as IrisBrief | null;
    },
  });

  async function reindexAll() {
    setReindexing(true);
    try {
      const res = await reindexFn({ data: { missionId, onlyMissing: false } });
      toast.success(`Re-indexed ${res.ok} of ${res.processed} documents`);
      qc.invalidateQueries({ queryKey: ["mission-library-index", missionId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Re-index failed");
    } finally {
      setReindexing(false);
    }
  }

  // ── Filtering ─────────────────────────────────────────
  const filteredBySource = useMemo(() => {
    if (sourceFilter === "all") return docs;
    if (sourceFilter === "iris") return docs.filter((d) => d.source === "iris");
    return docs.filter((d) => (d.source ?? "team") === "team");
  }, [docs, sourceFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: filteredBySource.length };
    for (const c of CATEGORIES) map[c] = 0;
    for (const d of filteredBySource) map[d.category] = (map[d.category] ?? 0) + 1;
    return map;
  }, [filteredBySource]);

  const visible = useMemo(() => {
    let list =
      activeCategory === "All"
        ? filteredBySource
        : filteredBySource.filter((d) => d.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.notes ?? "").toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filteredBySource, activeCategory, search]);

  // Grouped by category for "By Category" tab
  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of filteredBySource) {
      const c = d.category || "Other";
      const list = map.get(c) ?? [];
      list.push(d);
      map.set(c, list);
    }
    return Array.from(map.entries())
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [filteredBySource]);

  async function downloadDoc(doc: Doc) {
    if (doc.url) {
      window.open(doc.url, "_blank");
      return;
    }
    if (doc.file_path) {
      const { data } = await supabase.storage
        .from("mission-library")
        .createSignedUrl(doc.file_path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  // ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-center gap-3">
        <VaultIcon size={32} active />
        <div>
          <h1 className="text-2xl font-semibold">Mission Intel</h1>
          <p className="text-sm text-muted-foreground">
            What IRIS knows, and what your team has gathered.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <nav className="-mb-px flex gap-1">
          <TabButton active={tab === "brief"} onClick={() => setTab("brief")}>
            IRIS Brief
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All Intelligence
          </TabButton>
          <TabButton active={tab === "category"} onClick={() => setTab("category")}>
            By Category
          </TabButton>
        </nav>
      </div>

      {/* ─────────────── IRIS BRIEF TAB ─────────────── */}
      {tab === "brief" && (
        <section className="space-y-4">
          {briefLoading ? (
            <div className="text-sm text-muted-foreground">Loading IRIS brief…</div>
          ) : irisBrief?.brief_text ? (
            <article className="rounded-lg border border-[#C49A22]/30 bg-[#C49A22]/[0.04] p-6">
              <header className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#C49A22]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C49A22]">
                    IRIS Mission Brief
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Last updated {timeAgo(irisBrief.generated_at)}
                </span>
              </header>
              <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                {irisBrief.brief_text}
              </div>
              <div className="mt-6 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Read Full Analysis <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-[#C49A22] opacity-60" />
              <p className="text-sm text-foreground font-medium mb-1">
                IRIS is building your mission brief.
              </p>
              <p className="text-xs text-muted-foreground">Check back shortly.</p>
            </div>
          )}
        </section>
      )}

      {/* ─────────────── ALL INTELLIGENCE TAB ─────────────── */}
      {tab === "all" && (
        <section className="space-y-4">
          {/* Vault shortcut */}
          <Link
            to="/missions/$missionId/vault"
            params={{ missionId }}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 transition hover:bg-amber-500/[0.10]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Shield className="h-5 w-5 text-amber-300 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Go to Mission Vault →
                </div>
                <div className="text-xs text-muted-foreground">
                  Data Security Requirements · Contract · Scope of Work · Style Guide
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>

          {/* IRIS indexing status */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-[#C49A22]/20 bg-[#C49A22]/[0.05] px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-3.5 w-3.5 text-[#C49A22] shrink-0" />
              <span className="text-foreground">
                IRIS has indexed{" "}
                <span className="font-semibold">{indexStatus?.indexed ?? 0}</span> of{" "}
                <span className="font-semibold">{indexStatus?.total ?? 0}</span> documents
              </span>
              {indexStatus?.lastIndexedAt && (
                <span className="text-muted-foreground">
                  · Last indexed: {timeAgo(indexStatus.lastIndexedAt)}
                </span>
              )}
            </div>
            <button
              onClick={reindexAll}
              disabled={reindexing || (indexStatus?.total ?? 0) === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/30 disabled:opacity-50"
            >
              {reindexing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {reindexing ? "Re-indexing…" : "Re-index All"}
            </button>
          </div>

          {/* Source filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mr-1">
              Source
            </span>
            <SourceChip
              active={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
            >
              All
            </SourceChip>
            <SourceChip
              active={sourceFilter === "iris"}
              onClick={() => setSourceFilter("iris")}
            >
              <Sparkles className="h-3 w-3" /> IRIS-Generated
            </SourceChip>
            <SourceChip
              active={sourceFilter === "team"}
              onClick={() => setSourceFilter("team")}
            >
              Team-Added
            </SourceChip>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, notes, or category…"
              className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Category sidebar + list */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
            <aside className="rounded-lg border border-border p-2 h-fit">
              <CategoryRow
                label="All Documents"
                count={counts.All}
                active={activeCategory === "All"}
                onClick={() => setActiveCategory("All")}
              />
              <div className="my-2 border-t border-border" />
              {CATEGORIES.map((c) => (
                <CategoryRow
                  key={c}
                  label={c}
                  count={counts[c] ?? 0}
                  active={activeCategory === c}
                  onClick={() => setActiveCategory(c)}
                />
              ))}
            </aside>

            <div>
              {isLoading && (
                <div className="text-sm text-muted-foreground">Loading…</div>
              )}
              {!isLoading && visible.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  <VaultIcon size={48} static className="mx-auto mb-4 opacity-50" />
                  {filteredBySource.length === 0
                    ? "No intelligence matches the current source filter."
                    : `No documents in ${activeCategory} yet.`}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {visible.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    indexed={indexedIds.has(doc.id)}
                    onOpen={() => downloadDoc(doc)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─────────────── BY CATEGORY TAB ─────────────── */}
      {tab === "category" && (
        <section className="space-y-4">
          {/* Source filter chips also available here */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mr-1">
              Source
            </span>
            <SourceChip
              active={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
            >
              All
            </SourceChip>
            <SourceChip
              active={sourceFilter === "iris"}
              onClick={() => setSourceFilter("iris")}
            >
              <Sparkles className="h-3 w-3" /> IRIS-Generated
            </SourceChip>
            <SourceChip
              active={sourceFilter === "team"}
              onClick={() => setSourceFilter("team")}
            >
              Team-Added
            </SourceChip>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No intelligence yet.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ category, items }) => (
                <div key={category}>
                  <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                    {category}{" "}
                    <span className="ml-2 text-muted-foreground/70 font-normal">
                      {items.length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {items.map((doc) => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        indexed={indexedIds.has(doc.id)}
                        onOpen={() => downloadDoc(doc)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── SUB-COMPONENTS ───────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SourceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DocCard({
  doc,
  indexed,
  onOpen,
}: {
  doc: Doc;
  indexed: boolean;
  onOpen: () => void;
}) {
  const isIris = doc.source === "iris";
  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition hover:border-primary/50">
      <div className="mb-2 flex items-start gap-3 min-w-0">
        <FileText className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
        <div className="min-w-0">
          <button
            onClick={onOpen}
            className="text-left text-sm font-medium text-foreground hover:underline truncate block"
          >
            {doc.name}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">{doc.category}</span>
            {isIris && (
              <span className="inline-flex items-center gap-1 rounded bg-[#C49A22]/15 px-1.5 py-0.5 text-[#C49A22]">
                <Sparkles className="h-3 w-3" /> IRIS
              </span>
            )}
            {doc.is_rfp && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">RFP</span>
            )}
            {indexed ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Indexed by IRIS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" /> Pending IRIS indexing…
              </span>
            )}
            {doc.url && <ExternalLink className="h-3 w-3" />}
          </div>
        </div>
      </div>
      {doc.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        {doc.added_by ? `Added by ${doc.added_by} · ` : ""}
        {new Date(doc.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function CategoryRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm transition ${
        active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function timeAgo(iso: string): string {
  const sec = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
