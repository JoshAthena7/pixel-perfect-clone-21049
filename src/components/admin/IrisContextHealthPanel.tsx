// IRIS Context Health — permanent live dashboard for an active mission.
// Mounted on Olympus. Auto-refreshes every 60s.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Zap, ChevronDown, ChevronUp, Check, AlertTriangle, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getMissionContextHealth,
  forceRefreshMissionContext,
  type ContextHealth,
  type HealthRow,
  type RowStatus,
} from "@/lib/iris-context-health.functions";
import { auditContextCoverage } from "@/lib/iris-context-coverage.functions";

const IRIS_INDIGO = "#6366F1";

type Mission = { id: string; name: string; client: string | null };

export function IrisContextHealthPanel({ missions }: { missions: Mission[] }) {
  const [missionId, setMissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!missionId && missions.length > 0) {
      setMissionId(missions[0].id);
    }
  }, [missions, missionId]);

  if (missions.length === 0) {
    return (
      <section
        className="rounded-[12px] p-5"
        style={{ background: `${IRIS_INDIGO}10`, border: `1px solid ${IRIS_INDIGO}33` }}
      >
        <h2 className="text-[12px] font-bold uppercase tracking-[0.24em]" style={{ color: IRIS_INDIGO }}>
          <Zap className="inline h-3.5 w-3.5 mr-1.5" /> IRIS CONTEXT HEALTH
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          No active missions — context health appears once a mission is activated.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-[12px] p-5"
      style={{ background: `${IRIS_INDIGO}10`, border: `1px solid ${IRIS_INDIGO}33` }}
    >
      <HealthPanelHeader missions={missions} missionId={missionId} onMissionChange={setMissionId} />
      {missionId && <HealthPanelBody missionId={missionId} />}
    </section>
  );
}

function HealthPanelHeader({
  missions,
  missionId,
  onMissionChange,
}: {
  missions: Mission[];
  missionId: string | null;
  onMissionChange: (id: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[12px] font-bold uppercase tracking-[0.24em]" style={{ color: IRIS_INDIGO }}>
          <Zap className="inline h-3.5 w-3.5 mr-1.5" /> IRIS CONTEXT HEALTH
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Real-time status of every intelligence source feeding buildMissionContext()
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={missionId ?? ""}
          onChange={(e) => onMissionChange(e.target.value)}
          className="rounded-[6px] px-2 py-1 text-[11px] text-foreground"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          {missions.map((m) => (
            <option key={m.id} value={m.id} style={{ background: "#060b14" }}>
              {m.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-400">● Live</span>
      </div>
    </header>
  );
}

function HealthPanelBody({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const getHealth = useServerFn(getMissionContextHealth);
  const forceRefresh = useServerFn(forceRefreshMissionContext);
  const auditCoverage = useServerFn(auditContextCoverage);
  const [lastBuiltAt, setLastBuiltAt] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["iris-context-health", missionId],
    queryFn: () => getHealth({ data: { missionId } }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: coverage } = useQuery({
    queryKey: ["iris-context-coverage"],
    queryFn: () => auditCoverage({ data: undefined as any }),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data?.builtAt) setLastBuiltAt(data.builtAt);
  }, [data?.builtAt]);

  const refresh = useMutation({
    mutationFn: () => forceRefresh({ data: { missionId } }),
    onSuccess: async (r) => {
      if (r.ok) {
        toast.success("Context rebuilt");
      } else {
        toast.error(`Context build had errors: ${(r as any).error ?? "unknown"}`);
      }
      await qc.invalidateQueries({ queryKey: ["iris-context-health", missionId] });
      await refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  if (isLoading && !data) {
    return <p className="text-sm text-muted-foreground">Loading context health…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }

  const overallTone = toneFor(data.overallStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <div className="text-muted-foreground">
          Last full context build: <span className="text-foreground/80">{timeAgo(lastBuiltAt)}</span>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || isFetching}
          className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
          style={{ background: `${IRIS_INDIGO}22`, border: `1px solid ${IRIS_INDIGO}55`, color: IRIS_INDIGO }}
        >
          <RefreshCw className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} />
          Force Refresh
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Overall context score</div>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${data.overallScore}%`, background: overallTone.bar }}
          />
        </div>
        <div className="text-[16px] font-bold tabular-nums" style={{ color: overallTone.text }}>
          {data.overallScore}%
        </div>
      </div>

      {coverage && (
        <div
          className="rounded-[8px] px-3 py-2 text-[11px]"
          style={{
            background:
              coverage.coveragePercent >= 100
                ? "rgba(16,185,129,0.06)"
                : "rgba(245,158,11,0.06)",
            border:
              coverage.coveragePercent >= 100
                ? "1px solid rgba(16,185,129,0.25)"
                : "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>{coverage.coveragePercent >= 100 ? "✓" : "⚠"}</span>
              <span className="font-semibold text-foreground/90">
                Context Coverage: {coverage.coveragePercent}%
              </span>
              <span className="text-muted-foreground">
                · {coverage.coveredByContext}/
                {coverage.totalMissionTables - coverage.excludedByDesign} mission-scoped tables wired
                {coverage.excludedByDesign > 0
                  ? ` (${coverage.excludedByDesign} excluded by design)`
                  : ""}
              </span>
            </div>
            {coverage.missing.length > 0 && (
              <button
                onClick={() => setShowMissing((s) => !s)}
                className="text-[11px] font-medium underline-offset-2 hover:underline"
                style={{ color: IRIS_INDIGO }}
              >
                {showMissing ? "Hide" : "View"} missing sources ({coverage.missing.length})
              </button>
            )}
          </div>
          {showMissing && coverage.missing.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {coverage.missing.map((t) => (
                <span
                  key={t}
                  className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    color: "#fbbf24",
                    border: "1px solid rgba(245,158,11,0.25)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {data.groups.map((g) => (
          <GroupBlock key={g.id} title={g.title} rows={g.rows} missionId={missionId} />
        ))}
      </div>

      <div
        className="rounded-[8px] px-3 py-2.5 text-[12px] flex items-start gap-2"
        style={{ background: overallTone.bg, border: `1px solid ${overallTone.border}` }}
      >
        <span className="text-base leading-none mt-0.5">{overallTone.dot}</span>
        <div>
          <div className="font-semibold" style={{ color: overallTone.text }}>
            {overallTone.headline}{" "}
            <span className="font-normal text-foreground/80">
              {data.totals.red + data.totals.amber === 0
                ? "— all sources fresh and wired"
                : `— ${data.totals.red + data.totals.amber} source${data.totals.red + data.totals.amber === 1 ? "" : "s"} stale or incomplete`}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {summarizeIssues(data)}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupBlock({
  title,
  rows,
  missionId,
}: {
  title: string;
  rows: HealthRow[];
  missionId: string;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <Row key={r.id} row={r} missionId={missionId} />
        ))}
      </ul>
    </div>
  );
}

function Row({ row, missionId }: { row: HealthRow; missionId: string }) {
  const [open, setOpen] = useState(false);
  const tone = toneFor(row.status);
  const isExpandable = row.status === "amber" || row.status === "red" || !!row.hint;

  return (
    <li>
      <button
        type="button"
        onClick={() => isExpandable && setOpen((s) => !s)}
        className={`w-full flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left ${
          isExpandable ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="text-[14px] leading-none w-4" style={{ color: tone.text }}>
          {tone.icon}
        </span>
        <span className="text-[12px] font-medium text-foreground/90 min-w-[170px]">
          {row.label}
        </span>
        <span className="flex-1 text-[11px] text-muted-foreground">{row.detail}</span>
        {isExpandable &&
          (open ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ))}
      </button>
      {open && isExpandable && (
        <div
          className="ml-7 mt-1 mb-1.5 rounded-[6px] px-2.5 py-2 text-[11px] space-y-1.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {row.hint && <div className="text-muted-foreground">{row.hint}</div>}
          <FixHint row={row} missionId={missionId} />
        </div>
      )}
    </li>
  );
}

function FixHint({ row, missionId }: { row: HealthRow; missionId: string }) {
  // Best-effort destinations per row id.
  const link = fixLinkFor(row.id, missionId);
  if (!link) return null;
  return (
    <Link
      to={link.to as any}
      params={link.params as any}
      className="inline-flex items-center gap-1 text-[11px] font-semibold"
      style={{ color: IRIS_INDIGO }}
    >
      {link.label} →
    </Link>
  );
}

function fixLinkFor(rowId: string, missionId: string): { to: string; params?: any; label: string } | null {
  switch (rowId) {
    case "setup-record":
    case "win-themes":
    case "key-requirements":
      return {
        to: "/admin/missions/$missionId/setup",
        params: { missionId },
        label: "Open Setup Record",
      };
    case "documents":
    case "vault-index":
      return {
        to: "/missions/$missionId/settings",
        params: { missionId },
        label: "Open Vault",
      };
    case "oracle":
    case "risks":
    case "signals":
    case "conflicts":
    case "client-intel":
      return {
        to: "/missions/$missionId/briefing",
        params: { missionId },
        label: "Open Briefing",
      };
    case "clarifications":
      return {
        to: "/missions/$missionId",
        params: { missionId },
        label: "Open Mission Command",
      };
    default:
      return null;
  }
}

function summarizeIssues(data: ContextHealth): string {
  const issues: string[] = [];
  for (const g of data.groups) {
    for (const r of g.rows) {
      if (r.status === "red") issues.push(`${r.label} — ${r.hint ?? r.detail}`);
      else if (r.status === "amber") issues.push(`${r.label} — ${r.hint ?? r.detail}`);
    }
  }
  if (issues.length === 0) return "Every intelligence source is fresh and wired into IRIS.";
  return issues.slice(0, 3).join(" · ");
}

function toneFor(status: RowStatus): {
  text: string;
  bar: string;
  bg: string;
  border: string;
  icon: any;
  dot: string;
  headline: string;
} {
  switch (status) {
    case "green":
      return {
        text: "#34d399",
        bar: "#10b981",
        bg: "rgba(16,185,129,0.08)",
        border: "rgba(16,185,129,0.35)",
        icon: <Check className="h-3.5 w-3.5" />,
        dot: "🟢",
        headline: "GREEN",
      };
    case "amber":
      return {
        text: "#fbbf24",
        bar: "#f59e0b",
        bg: "rgba(245,158,11,0.08)",
        border: "rgba(245,158,11,0.35)",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        dot: "🟡",
        headline: "AMBER",
      };
    case "red":
      return {
        text: "#f87171",
        bar: "#ef4444",
        bg: "rgba(239,68,68,0.08)",
        border: "rgba(239,68,68,0.35)",
        icon: <X className="h-3.5 w-3.5" />,
        dot: "🔴",
        headline: "RED",
      };
    case "info":
    default:
      return {
        text: "#94a3b8",
        bar: "#64748b",
        bg: "rgba(148,163,184,0.05)",
        border: "rgba(148,163,184,0.2)",
        icon: <span className="text-[14px] leading-none">·</span>,
        dot: "○",
        headline: "INFO",
      };
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
