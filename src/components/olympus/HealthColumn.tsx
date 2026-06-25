import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ExternalLink, DatabaseZap, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getBriefingCoverage,
  getPipelineHealth,
  getIrisUsage,
  getTopIntelligence,
} from "@/lib/olympus-health.functions";
import { runOracleStage } from "@/lib/oracle-pipeline.functions";

function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function dotColor(n: number): string {
  if (n >= 2) return "#34d399";
  if (n === 1) return "#fbbf24";
  return "#ef4444";
}

const LAYER_LABEL: Record<string, string> = {
  decode: "Decode / Regulatory",
  win_angle: "Win Angle / Competitive",
  evidence: "Evidence",
  risk: "Risk Flags",
};

export function HealthColumn({
  missionId,
  onSwitchToReview,
  onSwitchToSources,
}: {
  missionId: string | null;
  onSwitchToReview: () => void;
  onSwitchToSources: () => void;
}) {
  const coverageQ = useQuery({
    queryKey: ["olympus-health", "coverage", missionId],
    queryFn: () => getBriefingCoverage({ data: { missionId } }),
    refetchInterval: 60_000,
    enabled: !!missionId,
  });
  const healthQ = useQuery({
    queryKey: ["olympus-health", "pipeline"],
    queryFn: () => getPipelineHealth(),
    refetchInterval: 60_000,
  });
  const usageQ = useQuery({
    queryKey: ["olympus-health", "usage", missionId],
    queryFn: () => getIrisUsage({ data: { missionId } }),
    refetchInterval: 60_000,
    enabled: !!missionId,
  });
  const topQ = useQuery({
    queryKey: ["olympus-health", "top", missionId],
    queryFn: () => getTopIntelligence({ data: { missionId } }),
    refetchInterval: 60_000,
  });
  const recentlyApprovedQ = useQuery({
    queryKey: ["olympus-health", "recently-approved", missionId],
    queryFn: async () => {
      if (!missionId) return [] as any[];
      const { data } = await (supabase as any)
        .from("oracle_signals")
        .select("id,title,category,approved_at,updated_at,created_at")
        .or(`mission_id.eq.${missionId},tier.eq.platform`)
        .in("status", ["approved", "pushed"])
        .order("updated_at", { ascending: false })
        .limit(3);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
    enabled: !!missionId,
  });

  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  useEffect(() => {
    setLastUpdated(Date.now());
  }, [coverageQ.dataUpdatedAt, healthQ.dataUpdatedAt, usageQ.dataUpdatedAt, topQ.dataUpdatedAt]);

  const runStage = useServerFn(runOracleStage);
  const pipeline = useMutation({
    mutationFn: async () => {
      for (const stage of ["scraper", "classifier", "promoter"] as const) {
        await runStage({ data: { stage } });
      }
    },
    onSuccess: () => {
      toast.success("Pipeline run complete");
      healthQ.refetch();
      coverageQ.refetch();
      usageQ.refetch();
      topQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Pipeline failed"),
  });

  const hasAnyOracle =
    (topQ.data?.signals?.length ?? 0) > 0 ||
    (healthQ.data?.queue?.pending ?? 0) > 0 ||
    (healthQ.data?.classifiedCount ?? 0) > 0;

  if (!missionId) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-white/40 p-6 text-center">
        Select a mission.
      </div>
    );
  }

  if (!hasAnyOracle && !topQ.isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
        <DatabaseZap className="h-8 w-8 text-white/30" />
        <div className="text-[14px] text-white/80">ORACLE has no intelligence yet.</div>
        <div className="text-[12px] text-white/50 max-w-[260px]">
          Run the pipeline to ingest from monitored sources, or add intelligence manually using Add Intel in the Intelligence page.
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => pipeline.mutate()}
            disabled={pipeline.isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] text-white/90 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#d4af37" }}
          >
            {pipeline.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" style={{ color: "#d4af37" }} />}
            Run Pipeline
          </button>
          <a
            href={`/missions/${missionId}/intelligence`}
            className="px-2.5 py-1 rounded border border-white/10 text-[11px] text-white/80 hover:bg-white/5"
          >
            Go to Intelligence
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center justify-end px-2"
        style={{
          height: 18,
          fontSize: 9,
          color: "rgba(255,255,255,0.4)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        Updated {relative(new Date(lastUpdated).toISOString())}
      </div>
      <Panel
        heightPct={100}
        title="Pipeline Health"
        right={
          <button
            onClick={() => pipeline.mutate()}
            disabled={pipeline.isPending}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] text-white/90 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#d4af37" }}
          >
            {pipeline.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Scan now
          </button>
        }
      >
        <PipelineStats data={healthQ.data} onSourcesClick={onSwitchToSources} />
      </Panel>
      {/* Retained for compile compatibility — not rendered. */}
      {false && (
        <>
          <CoverageList data={coverageQ.data} loading={coverageQ.isLoading} missionId={missionId} />
          <CoverageSummary q={coverageQ.data} />
          <UsageBars data={usageQ.data} />
          <TopIntel data={topQ.data} onSwitchToReview={onSwitchToReview} />
          <RecentlyApprovedList items={recentlyApprovedQ.data ?? []} />
        </>
      )}
    </div>
  );
}


function Panel({
  heightPct,
  title,
  right,
  children,
}: {
  heightPct: number;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ flex: `0 0 ${heightPct}%`, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-3"
        style={{
          height: 32,
          background: "#050d18",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span className="text-[12px] text-white font-medium">{title}</span>
        {right}
      </div>
      <div className="flex-1 overflow-y-auto relative">{children}</div>
    </div>
  );
}

function CoverageSummary({ q }: { q: { totals: { covered: number; total: number } } | undefined }) {
  if (!q || q.totals.total === 0) return <span className="text-[11px] text-white/40">—</span>;
  const ratio = q.totals.covered / q.totals.total;
  const color = ratio > 0.8 ? "#34d399" : ratio >= 0.4 ? "#fbbf24" : "#ef4444";
  return (
    <span className="text-[11px]" style={{ color }}>
      {q.totals.covered} of {q.totals.total} questions covered
    </span>
  );
}

function CoverageList({
  data,
  loading,
  missionId,
}: {
  data: Awaited<ReturnType<typeof getBriefingCoverage>> | undefined;
  loading: boolean;
  missionId: string;
}) {
  const navigate = useNavigate();
  if (loading) return <Skeleton />;
  if (!data || data.questions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-white/40 text-center p-4">
        No questions loaded. Add questions via mission setup.
      </div>
    );
  }
  return (
    <div className="relative">
      {data.questions.map((q) => (
        <button
          key={q.id}
          onClick={() =>
            navigate({
              to: "/missions/$missionId/flight-deck",
              params: { missionId },
            })
          }
          className="w-full flex items-center hover:bg-white/[0.03] text-left"
          style={{
            height: 28,
            padding: "4px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <span
            className="font-mono"
            style={{ color: "#d4af37", fontSize: 10, width: 48, flexShrink: 0 }}
          >
            {q.number ?? "—"}
          </span>
          <span
            className="text-white truncate flex-1"
            style={{ fontSize: 10 }}
          >
            {q.text.length > 45 ? q.text.slice(0, 45) + "…" : q.text}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0 ml-2">
            {(["decode", "win_angle", "evidence", "risk"] as const).map((k) => (
              <span
                key={k}
                title={`${LAYER_LABEL[k]} · ${q.counts[k]} ORACLE nodes linked`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: dotColor(q.counts[k]),
                  display: "inline-block",
                }}
              />
            ))}
          </span>
        </button>
      ))}
      <div
        className="sticky bottom-0 pointer-events-none"
        style={{
          height: 16,
          background: "linear-gradient(to top, #070f1c, transparent)",
        }}
      />
    </div>
  );
}

function PipelineStats({
  data,
  onSourcesClick,
}: {
  data: Awaited<ReturnType<typeof getPipelineHealth>> | undefined;
  onSourcesClick: () => void;
}) {
  if (!data) return <Skeleton />;
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div
      className="flex items-center px-3 text-[11px]"
      style={{ height: 20 }}
    >
      <span className="text-white/60" style={{ width: 90 }}>{label}</span>
      <span className="text-white/85">{value}</span>
    </div>
  );
  const errCls = data.queue.errors > 0 ? "text-red-400" : "text-white/50";
  return (
    <div className="py-1">
      <Row label="Last scrape:" value={`${relative(data.lastScrape)} · ${data.sourcesCount} sources · ${data.queuedCount} queued`} />
      <Row label="Last classify:" value={`${relative(data.lastClassify)} · ${data.classifiedCount} classified · ${data.dismissedCount} dismissed`} />
      <Row label="Last promote:" value={`${relative(data.lastPromote)} · ${data.promotedCount} promoted · ${data.alertsCount} alerts`} />
      <Row
        label="Queue depth:"
        value={
          <>
            {data.queue.pending} pending · {data.queue.classifying} classifying ·{" "}
            <span className={errCls}>{data.queue.errors} errors</span>
          </>
        }
      />
      {data.failingSources > 0 && (
        <button
          onClick={onSourcesClick}
          className="mx-3 mt-1 w-[calc(100%-24px)] text-left px-2 py-1 rounded text-[11px] text-red-300"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          ⚠ {data.failingSources} source(s) failing — check Sources tab
        </button>
      )}
    </div>
  );
}

function UsageBars({ data }: { data: Awaited<ReturnType<typeof getIrisUsage>> | undefined }) {
  if (!data) return <Skeleton />;
  if (data.totalLinks === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-white/40 text-center p-4">
        No IRIS briefs generated yet. Open a question in the Flight Deck to generate the first brief.
      </div>
    );
  }
  const labels: Array<{ key: keyof typeof data.perLayer; label: string }> = [
    { key: "decode", label: "Decode" },
    { key: "win_angle", label: "Win Angle" },
    { key: "evidence", label: "Evidence" },
    { key: "risk", label: "Risk Flags" },
  ];
  const total = Math.max(1, data.totalQuestions);
  const avg = data.briefedQuestions > 0 ? (data.totalLinks / data.briefedQuestions).toFixed(1) : "0.0";
  return (
    <div className="p-3 space-y-2">
      {labels.map((l) => {
        const n = data.perLayer[l.key];
        const pct = Math.round((n / total) * 100);
        return (
          <div key={l.key} className="flex items-center gap-2 text-[11px]">
            <span className="text-white/70" style={{ width: 72 }}>{l.label}</span>
            <div
              className="flex-1 rounded-full overflow-hidden"
              style={{ height: 6, background: "rgba(255,255,255,0.06)" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "#d4af37",
                  borderRadius: 3,
                }}
              />
            </div>
            <span className="text-white/70" style={{ width: 60, textAlign: "right" }}>
              {n} {n === 1 ? "question" : "questions"}
            </span>
          </div>
        );
      })}
      <div className="pt-2 space-y-0.5 text-[11px] text-white/50">
        <div>Total ORACLE nodes used: {data.distinctSignals}</div>
        <div>Avg nodes per brief: {avg}</div>
      </div>
    </div>
  );
}

type TopSignal = Awaited<ReturnType<typeof getTopIntelligence>>["signals"][number];

function TopIntel({
  data,
  onSwitchToReview,
}: {
  data: { signals: TopSignal[] } | undefined;
  onSwitchToReview: () => void;
}) {
  const [open, setOpen] = useState<TopSignal | null>(null);
  if (!data) return <Skeleton />;
  if (data.signals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-4">
        <div className="text-[12px] text-white/50">
          No approved intelligence yet. Review and approve items in the queue.
        </div>
        <button
          onClick={onSwitchToReview}
          className="px-2 py-1 rounded border border-white/10 text-[11px] text-white/80 hover:bg-white/5"
        >
          Go to queue
        </button>
      </div>
    );
  }
  return (
    <>
      {data.signals.map((s) => {
        const bar =
          s.relevance_score >= 80 ? "#34d399" : s.relevance_score >= 60 ? "#d4af37" : "#fbbf24";
        return (
          <button
            key={s.id}
            onClick={() => setOpen(s)}
            className="w-full flex items-stretch text-left hover:bg-white/[0.03]"
            style={{
              height: 40,
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ width: 3, background: bar, flexShrink: 0 }} />
            <div className="flex-1 flex items-center gap-2 px-2 min-w-0">
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 28,
                  height: 16,
                  fontSize: 8,
                  border: `1px solid ${bar}`,
                  color: bar,
                  flexShrink: 0,
                }}
              >
                {s.relevance_score}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-white truncate" style={{ fontSize: 10 }}>
                  {s.title.length > 52 ? s.title.slice(0, 52) + "…" : s.title}
                </div>
                <div className="flex items-center gap-2 text-white/40" style={{ fontSize: 9 }}>
                  <span>Used in {s.usage_count} questions</span>
                  {s.source_name && <span className="truncate">· {s.source_name}</span>}
                  {s.source_url && <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />}
                </div>
              </div>
            </div>
          </button>
        );
      })}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] bg-[#070f1c] border-white/10 text-white">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white text-[14px]">{open.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-[12px] text-white/80">
                <div className="flex items-center gap-3 text-white/50">
                  <span>Relevance {open.relevance_score}</span>
                  <span>· {open.status}</span>
                  {open.source_name && <span>· {open.source_name}</span>}
                </div>
                {open.summary && <p className="leading-relaxed">{open.summary}</p>}
                <div className="text-white/50">Used in {open.usage_count} questions</div>
                {open.source_url && (
                  <a
                    href={open.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-white/80 hover:text-white"
                  >
                    Open source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Skeleton() {
  return (
    <div className="p-3 space-y-2">
      <div className="h-3 bg-white/5 rounded animate-pulse" />
      <div className="h-3 bg-white/5 rounded animate-pulse w-2/3" />
      <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
    </div>
  );
}

function RecentlyApprovedList({ items }: { items: any[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
      {items.map((it) => {
        const title = String(it.title ?? "Untitled");
        const trimmed = title.length > 55 ? title.slice(0, 55) + "…" : title;
        const dt = it.approved_at ?? it.updated_at ?? it.created_at;
        const dtLabel = dt ? relative(dt) : "";
        return (
          <li key={it.id} className="flex items-center gap-2 px-3 py-2" style={{ minHeight: 32 }}>
            <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "#34d399" }} />
            <span className="text-white truncate flex-1" style={{ fontSize: 11 }}>{trimmed}</span>
            {it.category && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)" }}>
                {String(it.category).replace(/_/g, " ")}
              </span>
            )}
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{dtLabel}</span>
          </li>
        );
      })}
    </ul>
  );
}
