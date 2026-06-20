import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOlympusSignals } from "@/lib/olympus.functions";
import { supabase } from "@/integrations/supabase/client";
import { recordSignalFeedback } from "@/lib/oracle-feedback";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Status = "all" | "needs_review" | "approved" | "pushed" | "dismissed" | "errors";
type Signal = {
  id: string;
  title: string;
  summary: string | null;
  source_name: string | null;
  category: string | null;
  subcategory: string | null;
  urgency: string | null;
  relevance_score: number;
  oracle_score: number | null;
  status: string;
  taxonomy_node_ids: string[];
  topic_tags: string[];
  published_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  ingestion_source: string;
};

const TABS: { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs Review" },
  { value: "approved", label: "Approved" },
  { value: "pushed", label: "Pushed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "errors", label: "Errors" },
];

function relative(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "border-emerald-400/60 text-emerald-300";
  if (score >= 60) return "border-amber-400/60 text-amber-300";
  if (score >= 40) return "border-orange-400/60 text-orange-300";
  return "border-red-400/60 text-red-300";
}

export function IntelReviewQueue({
  missionId,
  taxonomyNodeId,
}: {
  missionId: string | null;
  taxonomyNodeId: string | null;
}) {
  const [status, setStatus] = useState<Status>("needs_review");
  const [openId, setOpenId] = useState<string | null>(null);

  const fn = useServerFn(listOlympusSignals);
  const qc = useQueryClient();
  const queryKey = useMemo(
    () => ["olympus", "signals", { missionId, status, taxonomyNodeId }],
    [missionId, status, taxonomyNodeId],
  );

  const q = useQuery({
    queryKey,
    queryFn: () => fn({ data: { missionId, status, taxonomyNodeId, limit: 50 } }),
    staleTime: 15_000,
  });

  const signals = (q.data?.signals ?? []) as Signal[];
  const counts = q.data?.counts ?? { needs_review: 0, approved: 0, pushed: 0, dismissed: 0, error: 0 };

  const updateStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "approved" | "pushed" | "dismissed" }) => {
      const { error } = await supabase
        .from("oracle_signals")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      // Record human feedback — drives the nightly relevance learning loop.
      // Non-blocking; recordSignalFeedback never throws.
      void recordSignalFeedback(id, missionId, newStatus);
    },
    onMutate: async ({ id, newStatus }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, (old: unknown) => {
        const o = old as { signals: Signal[]; counts: Record<string, number> } | undefined;
        if (!o) return old;
        return {
          ...o,
          signals: o.signals.map((s) => (s.id === id ? { ...s, status: newStatus } : s)),
        };
      });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["olympus", "taxonomy"] });
    },
  });

  const openSignal = signals.find((s) => s.id === openId) ?? null;

  return (
    <div className="space-y-2">
      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              status === t.value
                ? "border-white/40 text-white bg-white/5"
                : "border-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Counts bar */}
      <div className="text-[10px] text-white/40">
        {counts.needs_review} needs review · {counts.approved} approved · {counts.pushed} pushed ·{" "}
        {counts.dismissed} dismissed · {counts.error ?? 0} errors
      </div>

      {/* Card list */}
      <div className="divide-y divide-white/5">
        {q.isLoading ? (
          <div className="text-[11px] text-white/40 py-4">Loading…</div>
        ) : signals.length === 0 ? (
          <EmptyForStatus status={status} />
        ) : (
          signals.map((s) => (
            <Card
              key={s.id}
              s={s}
              onOpen={() => setOpenId(s.id)}
              onAction={(newStatus) => updateStatus.mutate({ id: s.id, newStatus })}
            />
          ))
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] bg-[#070f1c] border-white/10 text-white overflow-y-auto">
          {openSignal && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white text-[13px]">{openSignal.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 text-[11px] mt-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge className={scoreColor(openSignal.relevance_score)}>
                    score {openSignal.relevance_score}
                  </Badge>
                  <Badge className="border-white/20 text-white/70">{openSignal.status}</Badge>
                  {openSignal.urgency && (
                    <Badge className="border-white/20 text-white/70">{openSignal.urgency}</Badge>
                  )}
                </div>
                <div className="text-white/80">{openSignal.summary || "—"}</div>
                <div>
                  <div className="text-[9px] uppercase text-white/40 mb-1">Source</div>
                  <div className="text-white/70">{openSignal.source_name ?? "—"}</div>
                  {(openSignal.metadata as { source_url?: string })?.source_url && (
                    <a
                      href={(openSignal.metadata as { source_url?: string }).source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:underline mt-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Open source
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <div className="text-white/40">Category</div>
                    <div className="text-white/70">{openSignal.category ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Subcategory</div>
                    <div className="text-white/70">{openSignal.subcategory ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Ingestion</div>
                    <div className="text-white/70">{openSignal.ingestion_source}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Published</div>
                    <div className="text-white/70">{relative(openSignal.published_at)} ago</div>
                  </div>
                </div>
                {openSignal.topic_tags?.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase text-white/40 mb-1">Topics</div>
                    <div className="flex gap-1 flex-wrap">
                      {openSignal.topic_tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  <ActionBtn
                    color="emerald"
                    label="Approve"
                    onClick={() => { updateStatus.mutate({ id: openSignal.id, newStatus: "approved" }); }}
                  />
                  <ActionBtn
                    color="amber"
                    label="Push"
                    onClick={() => { updateStatus.mutate({ id: openSignal.id, newStatus: "pushed" }); }}
                  />
                  <ActionBtn
                    color="red"
                    label="Dismiss"
                    onClick={() => { updateStatus.mutate({ id: openSignal.id, newStatus: "dismissed" }); }}
                  />
                </div>
                <div className="text-[10px] text-white/30 italic pt-2">
                  Inline edit mode (taxonomy override, relevance slider) — Phase B+1.
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Card({
  s,
  onOpen,
  onAction,
}: {
  s: Signal;
  onOpen: () => void;
  onAction: (status: "approved" | "pushed" | "dismissed") => void;
}) {
  return (
    <div className="py-3 px-1 hover:bg-white/[0.02] cursor-pointer" onClick={onOpen}>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 text-[10px] text-white/40">
            <span className={`px-1.5 py-0.5 rounded border ${scoreColor(s.relevance_score)}`}>
              {s.relevance_score}
            </span>
            {s.urgency && s.urgency !== "normal" && (
              <span className="text-amber-300/80">{s.urgency}</span>
            )}
            {s.category && <span className="text-white/40">{s.category}</span>}
            {s.source_name && <span className="text-white/40 truncate">· {s.source_name}</span>}
            <span className="text-white/30 ml-auto">{relative(s.published_at ?? s.created_at)}</span>
          </div>
          <div className="text-[12px] text-white/90 font-medium truncate">{s.title}</div>
          {s.summary && (
            <div className="text-[11px] text-white/50 truncate mt-0.5">{s.summary}</div>
          )}
          {s.topic_tags?.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {s.topic_tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/40">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <ActionBtn color="emerald" label="Approve" small onClick={() => onAction("approved")} />
          <ActionBtn color="amber" label="Push" small onClick={() => onAction("pushed")} />
          <ActionBtn color="red" label="Dismiss" small onClick={() => onAction("dismissed")} />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  color,
  label,
  small,
  onClick,
}: {
  color: "emerald" | "amber" | "red";
  label: string;
  small?: boolean;
  onClick: () => void;
}) {
  const cls = {
    emerald: "border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/10",
    amber: "border-amber-400/60 text-amber-300 hover:bg-amber-400/10",
    red: "border-red-400/60 text-red-300 hover:bg-red-400/10",
  }[color];
  return (
    <button
      onClick={onClick}
      className={`text-[9px] uppercase tracking-wider border rounded px-2 ${
        small ? "py-0.5" : "py-1"
      } ${cls}`}
    >
      {label}
    </button>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${className}`}>{children}</span>
  );
}

function EmptyForStatus({ status }: { status: Status }) {
  const messages: Record<Status, string> = {
    all: "No signals.",
    needs_review: "No items waiting for review. The pipeline will surface new intel here automatically.",
    approved: "No approved intel yet.",
    pushed: "Nothing pushed to IRIS.",
    dismissed: "Nothing dismissed.",
    errors: "No pipeline errors. The scraper and classifier are running cleanly.",
  };
  return <div className="text-[11px] text-white/40 py-8 text-center">{messages[status]}</div>;
}
