import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  irisGenerateBriefingSection,
  BRIEFING_SECTION_KEYS,
  BRIEFING_SECTION_TITLES,
} from "@/lib/iris.functions";
import { Printer, BookOpen, Sparkles, ChevronDown, ChevronRight, RefreshCw, Loader2, History, FileText, Globe, X, Radio } from "lucide-react";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MissionIntelligenceFeed } from "@/components/v2/MissionIntelligenceFeed";

type SourceRef =
  | { type: "vault_document"; name: string; document_id: string }
  | { type: "market_intelligence"; source: string; date?: string; url?: string }
  | { type: string; [k: string]: any };

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingBookPage,
});

type SectionRow = {
  id: string;
  section_key: string;
  content: string | null;
  status: string;
  generated_at: string | null;
  sources: SourceRef[] | null;
  version_number: number | null;
};

function BriefingBookPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const generateFn = useServerFn(irisGenerateBriefingSection);
  const [tab, setTab] = useState<"feed" | "analysis">("feed");

  const { data: mission } = useQuery({
    queryKey: ["bb-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,submission_date")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["bb-sections", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_sections")
        .select("id,section_key,content,status,generated_at,sources,version_number")
        .eq("mission_id", missionId);
      return (data ?? []) as unknown as SectionRow[];
    },
  });

  const sectionMap = new Map(sections.map((s) => [s.section_key, s]));

  const generate = useMutation({
    mutationFn: async (sectionKey: string) =>
      generateFn({ data: { missionId, sectionKey } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bb-sections", missionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAll = useMutation({
    mutationFn: async () => {
      for (const key of BRIEFING_SECTION_KEYS) {
        try { await generateFn({ data: { missionId, sectionKey: key } }); } catch { /* rate-limit etc */ }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bb-sections", missionId] }),
  });

  const lastUpdated = sections
    .map((s) => s.generated_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  return (
    <div className="bg-background min-h-screen">
      <style>{`@media print {
        .no-print { display: none !important; }
        .briefing-book { background: white !important; color: black !important; }
        .briefing-book * { color: black !important; border-color: #ccc !important; background: white !important; }
        .briefing-book section { page-break-inside: avoid; }
      }`}</style>

      {/* Toolbar with tabs */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("feed")}
            className={`relative inline-flex items-center gap-2 px-3 py-1.5 text-sm transition ${
              tab === "feed" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className="h-4 w-4" /> Intelligence Feed
            {tab === "feed" && <span className="absolute inset-x-2 -bottom-[13px] h-0.5 bg-primary" />}
          </button>
          <button
            onClick={() => setTab("analysis")}
            className={`relative inline-flex items-center gap-2 px-3 py-1.5 text-sm transition ${
              tab === "analysis" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-4 w-4" /> IRIS Analysis
            {tab === "analysis" && <span className="absolute inset-x-2 -bottom-[13px] h-0.5 bg-primary" />}
          </button>
        </div>
        {tab === "analysis" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateAll.mutate()}
              disabled={generateAll.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/15 disabled:opacity-50"
            >
              {generateAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Regenerate All
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover"
            >
              <Printer className="h-4 w-4" /> Print / Export PDF
            </button>
          </div>
        )}
      </div>

      {tab === "feed" ? (
        <div className="mx-auto max-w-[920px] px-8 py-8">
          <header className="mb-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Oracle · Intelligence</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{mission?.name ?? "—"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mission Intelligence Feed — scored for relevance to your win themes, topics, and competitors.
            </p>
          </header>
          <MissionIntelligenceFeed missionId={missionId} />
        </div>
      ) : (
        <article className="briefing-book mx-auto max-w-[920px] px-10 py-12 space-y-6 text-foreground">
          {/* Cover */}
          <header className="border-b border-border pb-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Oracle · Intelligence</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{mission?.name ?? "—"}</h1>
            <p className="mt-2 text-base text-muted-foreground">
              IRIS Analysis — Static Briefing Sections
              {mission?.state ? ` · ${mission.state}` : ""}
            </p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {lastUpdated ? `Last updated ${relativeTime(lastUpdated)}` : "Not yet generated"}
            </p>
          </header>

          {BRIEFING_SECTION_KEYS.map((key, idx) => (
            <Section
              key={key}
              index={idx + 1}
              missionId={missionId}
              sectionKey={key}
              title={BRIEFING_SECTION_TITLES[key]}
              row={sectionMap.get(key)}
              isPending={generate.isPending && generate.variables === key}
              onRegenerate={() => generate.mutate(key)}
            />
          ))}

          <footer className="border-t border-border pt-6 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            IRIS Intelligence · {mission?.name}
          </footer>
        </article>
      )}
    </div>
  );
}

function Section({
  index,
  missionId,
  sectionKey,
  title,
  row,
  isPending,
  onRegenerate,
}: {
  index: number;
  missionId: string;
  sectionKey: string;
  title: string;
  row?: SectionRow;
  isPending: boolean;
  onRegenerate: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const has = !!row?.content;
  const sources = (row?.sources ?? []) as SourceRef[];

  return (
    <section className="rounded-[10px] border border-border bg-surface/50">
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-[10px] tabular-nums text-muted-foreground">{String(index).padStart(2, "0")}</span>
          <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>
          {row?.version_number && row.version_number > 1 && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">v{row.version_number}</span>
          )}
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {row?.generated_at && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <Sparkles className="inline h-3 w-3 mr-1 text-primary" />
              IRIS · {relativeTime(row.generated_at)}
            </span>
          )}
          {row?.id && (row.version_number ?? 1) > 1 && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="no-print inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-hover"
            >
              <History className="h-3 w-3" /> History
            </button>
          )}
          <button
            onClick={onRegenerate}
            disabled={isPending}
            className="no-print inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-hover disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {has ? "Regenerate" : "Generate Now"}
          </button>
        </div>
      </header>
      {open && (
        <div className="px-5 py-4">
          {isPending ? (
            <p className="text-sm text-muted-foreground italic">IRIS is analyzing…</p>
          ) : has ? (
            <>
              <Markdownish text={row!.content!} />
              {sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mr-1">Sources</span>
                  {sources.map((s, i) => <SourceBadge key={i} source={s} missionId={missionId} />)}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              IRIS will generate {title} intelligence once documents are uploaded to The Vault. Click <span className="text-primary">Generate Now</span> above, or add documents in Olympus.
            </p>
          )}
        </div>
      )}
      {historyOpen && row?.id && (
        <HistoryDialog
          sectionId={row.id}
          title={title}
          currentVersion={row.version_number ?? 1}
          currentContent={row.content ?? ""}
          currentGeneratedAt={row.generated_at ?? null}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </section>
  );
}

function SourceBadge({ source, missionId }: { source: SourceRef; missionId: string }) {
  if (source.type === "vault_document" && source.document_id) {
    return (
      <Link
        to="/missions/$missionId/library"
        params={{ missionId }}
        className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] hover:bg-primary/15"
      >
        <FileText className="h-3 w-3" /> {source.name ?? "Vault doc"}
      </Link>
    );
  }
  if (source.type === "market_intelligence") {
    const label = [source.source, source.date].filter(Boolean).join(" · ");
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover text-muted-foreground px-2 py-0.5 text-[10px]">
        <Globe className="h-3 w-3" /> {label || "Market intel"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover text-muted-foreground px-2 py-0.5 text-[10px]">
      {(source as any).name ?? (source as any).source ?? "Source"}
    </span>
  );
}

function HistoryDialog({
  sectionId,
  title,
  currentVersion,
  currentContent,
  currentGeneratedAt,
  onClose,
}: {
  sectionId: string;
  title: string;
  currentVersion: number;
  currentContent: string;
  currentGeneratedAt: string | null;
  onClose: () => void;
}) {
  const { data: history = [] } = useQuery({
    queryKey: ["bb-section-history", sectionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_section_history")
        .select("id,content,version_number,generated_at,sources")
        .eq("section_id", sectionId)
        .order("version_number", { ascending: false });
      return data ?? [];
    },
  });

  const versions = [
    { id: "current", version_number: currentVersion, content: currentContent, generated_at: currentGeneratedAt, isCurrent: true },
    ...history.map((h) => ({ ...h, isCurrent: false })),
  ];
  const [selectedId, setSelectedId] = useState<string>("current");
  const selected = versions.find((v) => String(v.id) === selectedId) ?? versions[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> {title} · Version History
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 flex-1 overflow-hidden">
          <ul className="w-48 shrink-0 border-r border-border pr-3 space-y-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={String(v.id)}>
                <button
                  onClick={() => setSelectedId(String(v.id))}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-xs ${
                    String(v.id) === selectedId ? "bg-primary/15 text-primary" : "hover:bg-surface-hover"
                  }`}
                >
                  <div className="font-medium">Version {v.version_number} {v.isCurrent && "(current)"}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {v.generated_at ? relativeTime(v.generated_at) : "—"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1 overflow-y-auto pr-1">
            {selected?.content ? <Markdownish text={selected.content} /> : <p className="text-sm text-muted-foreground italic">No content.</p>}
          </div>
        </div>
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}

function Markdownish({ text }: { text: string }) {
  // Lightweight rendering: split into paragraphs + bullets.
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      nodes.push(
        <ul key={nodes.length} className="ml-5 list-disc space-y-1 text-sm leading-relaxed">
          {bullets.map((b, i) => <li key={i}>{stripPrefix(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (/^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
      bullets.push(l);
    } else {
      flush();
      nodes.push(<p key={nodes.length} className="text-sm leading-relaxed">{l}</p>);
    }
  }
  flush();
  return <div className="space-y-3">{nodes}</div>;
}
function stripPrefix(l: string) {
  return l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "");
}
