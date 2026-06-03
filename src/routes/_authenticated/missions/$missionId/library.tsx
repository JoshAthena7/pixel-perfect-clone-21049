import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ExternalLink, Search, Sparkles, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { VaultIcon } from "@/components/v2/icons/AtlasIcons";
import { getLibraryIndexStatus, reindexMissionDocuments } from "@/lib/mission-activation.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/missions/$missionId/library")({
  component: LibraryPage,
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
};

function LibraryPage() {
  const { missionId } = Route.useParams();
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const statusFn = useServerFn(getLibraryIndexStatus);
  const reindexFn = useServerFn(reindexMissionDocuments);
  const [reindexing, setReindexing] = useState(false);

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
    [indexStatus],
  );

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


  const counts = useMemo(() => {
    const map: Record<string, number> = { All: docs.length };
    for (const c of CATEGORIES) map[c] = 0;
    for (const d of docs) map[d.category] = (map[d.category] ?? 0) + 1;
    return map;
  }, [docs]);

  const visible = useMemo(() => {
    let list = activeCategory === "All" ? docs : docs.filter((d) => d.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        (d.notes ?? "").toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [docs, activeCategory, search]);

  async function downloadDoc(doc: Doc) {
    if (doc.url) {
      window.open(doc.url, "_blank");
      return;
    }
    if (doc.file_path) {
      const { data } = await supabase.storage.from("mission-library").createSignedUrl(doc.file_path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-2 flex items-center gap-3">
        <VaultIcon size={32} active />
        <div>
          <h1 className="text-2xl font-semibold">The Vault · Documents</h1>
          <p className="text-sm text-muted-foreground">All RFPs, intelligence, and reference docs for this mission.</p>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Documents are managed in Olympus. Contact your Engagement Lead to upload new materials.
      </p>

      {/* IRIS indexing status bar */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-[#C49A22]/20 bg-[#C49A22]/[0.05] px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-[#C49A22] shrink-0" />
          <span className="text-foreground">
            IRIS has indexed <span className="font-semibold">{indexStatus?.indexed ?? 0}</span> of{" "}
            <span className="font-semibold">{indexStatus?.total ?? 0}</span> documents
          </span>
          {indexStatus?.lastIndexedAt && (
            <span className="text-muted-foreground">· Last indexed: {timeAgo(indexStatus.lastIndexedAt)}</span>
          )}
        </div>
        <button
          onClick={reindexAll}
          disabled={reindexing || (indexStatus?.total ?? 0) === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/30 disabled:opacity-50"
        >
          {reindexing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {reindexing ? "Re-indexing…" : "Re-index All"}
        </button>
      </div>


      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search The Vault by name, notes, or category…"
          className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-border p-2">
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
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              <VaultIcon size={48} static className="mx-auto mb-4 opacity-50" />
              {docs.length === 0
                ? "No documents have been added to The Vault yet. Administrators upload mission documents in Olympus."
                : `No documents in ${activeCategory} yet.`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((doc) => (
              <div
                key={doc.id}
                className="group rounded-lg border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <div className="mb-2 flex items-start gap-3 min-w-0">
                  <FileText className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <button
                      onClick={() => downloadDoc(doc)}
                      className="text-left text-sm font-medium text-foreground hover:underline truncate block"
                    >
                      {doc.name}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{doc.category}</span>
                      {doc.is_rfp && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">RFP</span>
                      )}
                      {indexedIds.has(doc.id) ? (
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
            ))}
          </div>
        </div>
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

