import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ArrowLeft, Sparkles, ClipboardCheck, Flag, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ReadinessChip } from "@/components/v2/MissionReadinessPanel";
import { generateIrisIntelligence } from "@/lib/iris-intelligence.functions";

const NAVY = "#1F3864";
const GOLD = "#C9A84C";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  component: MissionCommandView,
});

function MissionCommandView() {
  const { missionId } = useParams({ from: "/_authenticated/admin/missions/$missionId" });

  const missionQ = useQuery({
    queryKey: ["admin-mission", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, client, status, health, submission_date, created_at")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (missionQ.isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Loading mission…</div>;
  }
  if (!missionQ.data) {
    return (
      <div className="p-10">
        <h2 className="text-lg font-semibold">Mission not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The mission you requested no longer exists or you don't have access to it.
        </p>
        <Link
          to="/olympus"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Olympus
        </Link>
      </div>
    );
  }

  const m = missionQ.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-6">
      <Header mission={m} missionId={missionId} />
      <SignalsBanner missionId={missionId} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IrisStatusPanel missionId={missionId} />
        <RequirementsPanel missionId={missionId} />
        <PreFlightPanel missionId={missionId} />
        <TeamPanel missionId={missionId} />
        <WinThemesPanel missionId={missionId} />
        <DeadlinesPanel missionId={missionId} submissionDate={m.submission_date} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────── Header ─────────────────────────────────── */

function Header({
  mission,
  missionId,
}: {
  mission: {
    id: string;
    name: string | null;
    client: string | null;
    status: string | null;
    submission_date: string | null;
  };
  missionId: string;
}) {
  const dueDays = daysUntil(mission.submission_date);
  const [confirming, setConfirming] = useState(false);
  const runIris = useRunIris(missionId, mission.name ?? "this mission");

  return (
    <div
      className="rounded-lg border p-5"
      style={{ borderColor: "rgba(201,168,76,0.25)", background: `linear-gradient(135deg, ${NAVY}26, transparent)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mission.name ?? "Untitled mission"}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">{mission.client ?? "—"}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <StatusBadge status={mission.status} />
            <span className="text-muted-foreground">
              {dueDays === null ? "— submission date" : `${dueDays}d to submission`}
            </span>
            <span className="text-muted-foreground">·</span>
            <ReadinessChip missionId={missionId} onClick={() => {}} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/missions/$missionId/setup"
            params={{ missionId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          >
            <ClipboardCheck className="h-3 w-3" /> Open Setup Record
          </Link>
          <button
            onClick={() => setConfirming(true)}
            disabled={runIris.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: GOLD, color: "#1a1a1a" }}
          >
            <Sparkles className="h-3 w-3" />
            {runIris.isPending ? "Running IRIS…" : "Run IRIS™"}
          </button>
          <Link
            to="/olympus"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Olympus
          </Link>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Re-run IRIS?"
          body={`This will regenerate the Mission Brief and Strategic Assessment for "${mission.name ?? "this mission"}" using the latest completed documents.`}
          confirmLabel="Run IRIS"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            runIris.mutate();
          }}
        />
      )}
    </div>
  );
}

function useRunIris(missionId: string, missionName: string) {
  const generate = useServerFn(generateIrisIntelligence);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: docs, error } = await supabase
        .from("mission_documents")
        .select("id")
        .eq("mission_id", missionId)
        .eq("processing_status", "complete");
      if (error) throw new Error(error.message);
      const ids = (docs ?? []).map((d: { id: string }) => d.id);
      for (const layer of ["mission_brief", "strategic_assessment"] as const) {
        const res: any = await generate({ data: { mission_id: missionId, document_ids: ids, layer } });
        if (res && res.success === false) {
          throw new Error(`IRIS ${layer} failed: ${res.error ?? "unknown"}`);
        }
      }
    },
    onSuccess: async () => {
      toast.success(`IRIS regenerated for ${missionName}`);
      await qc.invalidateQueries({ queryKey: ["admin-mission-intel", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "IRIS run failed"),
  });
}


function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "Active").toUpperCase();
  const map: Record<string, string> = {
    DRAFT: "bg-white/10 text-foreground/80",
    ACTIVE: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    REVIEW: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    SUBMITTED: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
    WON: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
    LOST: "bg-red-500/15 text-red-300 border border-red-500/30",
  };
  const cls = map[s] ?? "bg-white/10 text-foreground/80";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${cls}`}>
      {s}
    </span>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#0d1421] p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ background: GOLD, color: "#1a1a1a" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Open Signals Banner ─────────────────────────────── */

function SignalsBanner({ missionId }: { missionId: string }) {
  const { data, isError } = useQuery({
    queryKey: ["admin-mission-signals", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signals")
        .select("signal_title, severity, created_at")
        .eq("mission_id", missionId)
        .eq("status", "open")
        .in("severity", ["warning", "critical"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isError || !data || data.length === 0) return null;
  const hasCritical = data.some((s: any) => s.severity === "critical");
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
        hasCritical
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">
          {data.length} open signal{data.length === 1 ? "" : "s"} ·{" "}
          <span className="font-normal opacity-90">{fmtTime(data[0].created_at)}</span>
        </div>
        <div className="mt-0.5 truncate opacity-90">
          {data.map((s: any) => s.signal_title).join(" · ")}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Panel: IRIS Intelligence ─────────────────────────────── */

function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function IrisStatusPanel({ missionId }: { missionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-mission-intel", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_intelligence")
        .select("layer, version, generated_at, content")
        .eq("mission_id", missionId)
        .order("layer", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Panel title="IRIS Intelligence Status">
      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <Unavailable />
      ) : (
        <IrisStatusBody rows={data ?? []} missionId={missionId} />
      )}
    </Panel>
  );
}

function IrisStatusBody({ rows, missionId }: { rows: Array<{ layer: string; version: number; generated_at: string; content: any }>; missionId: string }) {

  const layers: Array<{ key: string; label: string }> = [
    { key: "mission_brief", label: "Layer 1 · Mission Brief" },
    { key: "strategic_assessment", label: "Layer 2 · Strategic Assessment" },
  ];
  const latest = new Map<string, { version: number; generated_at: string; content: any }>();
  for (const r of rows) {
    if (!latest.has(r.layer)) latest.set(r.layer, r);
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 space-y-2">
        <div>
          IRIS has not analyzed this mission yet. IRIS needs at least one
          processed document (RFP, amendments, supporting materials) before it
          can generate the Mission Brief and Strategic Assessment.
        </div>
        <Link
          to="/admin/missions/$missionId/setup"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[12px] font-semibold text-amber-100 hover:bg-amber-400/20"
        >
          <ClipboardCheck className="h-3 w-3" /> Open Setup Record to upload documents
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {layers.map((l) => {
        const row = latest.get(l.key);
        return (
          <li key={l.key} className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{l.label}</div>
                {row && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    v{row.version} · {fmtTime(row.generated_at)}
                  </div>
                )}
              </div>
              {row ? (
                <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Generated
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                  Not Generated
                </span>
              )}
            </div>
            {row && (
              <div className="mt-2 line-clamp-2 text-[12px] text-foreground/70">
                {previewContent(row.content)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function previewContent(content: any): string {
  if (!content) return "";
  let s = "";
  if (typeof content === "string") s = content;
  else s = JSON.stringify(content);
  s = s.replace(/[{}"\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 120) + (s.length > 120 ? "…" : "");
}

/* ─────────────────────────────── Panel: Requirements ─────────────────────────────── */

function RequirementsPanel({ missionId }: { missionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-mission-reqs", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_requirements")
        .select("id, severity, is_federal, requirement_type")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Panel title="Requirements Coverage">
      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <Unavailable />
      ) : !data || data.length === 0 ? (
        <EmptyNote text="No requirements extracted yet. Upload the RFP and run IRIS to extract requirements." />
      ) : (
        (() => {
          const total = data.length;
          const critical = data.filter((r: any) => r.severity === "critical").length;
          const standard = data.filter((r: any) => r.severity === "standard").length;
          const minor = data.filter((r: any) => r.severity === "minor").length;
          const federal = data.filter((r: any) => r.is_federal).length;
          const cPct = (critical / total) * 100;
          const sPct = (standard / total) * 100;
          const mPct = (minor / total) * 100;
          return (
            <div>
              <div className="text-sm">
                <span className="text-xl font-bold">{total}</span>{" "}
                <span className="text-muted-foreground">requirements extracted</span>
              </div>
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div style={{ width: `${cPct}%`, background: "#ef4444" }} />
                <div style={{ width: `${sPct}%`, background: "#f59e0b" }} />
                <div style={{ width: `${mPct}%`, background: "#10b981" }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
                <span><span className="text-red-300">{critical}</span> critical</span>
                <span><span className="text-amber-300">{standard}</span> standard</span>
                <span><span className="text-emerald-300">{minor}</span> minor</span>
                <span>·</span>
                <span><span className="text-foreground">{federal}</span> federal</span>
              </div>
              {critical > 0 && (
                <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                  {critical} critical requirement{critical === 1 ? "" : "s"} flagged — review in Setup Record.
                </div>
              )}
            </div>
          );
        })()
      )}
    </Panel>
  );
}

/* ─────────────────────────────── Panel: Pre-Flight ─────────────────────────────── */

function PreFlightPanel({ missionId }: { missionId: string }) {
  const briefsQ = useQuery({
    queryKey: ["admin-mission-briefs", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("section_briefs")
        .select("question_status")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const totalQ = useQuery({
    queryKey: ["admin-mission-qtotal", missionId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("question_records")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <Panel title="Pre-Flight Status">
      {briefsQ.isLoading || totalQ.isLoading ? (
        <Skeleton />
      ) : briefsQ.isError || totalQ.isError ? (
        <Unavailable />
      ) : (
        (() => {
          const briefs = briefsQ.data ?? [];
          const total = totalQ.data ?? 0;
          const withBrief = briefs.filter((b: any) => b.question_status === "refined_brief_ready").length;
          const inProgress = briefs.filter((b: any) =>
            ["questions_ready", "answering", "answers_submitted"].includes(b.question_status),
          ).length;
          const dark = Math.max(0, total - briefs.length);
          const pct = total > 0 ? Math.round((withBrief / total) * 100) : 0;
          return (
            <div>
              <div className="text-sm">
                <span className="text-xl font-bold">{withBrief}</span>{" "}
                <span className="text-muted-foreground">of {total} sections with Pre-Flight brief</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full" style={{ width: `${pct}%`, background: GOLD }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
                <span><span className="text-emerald-300">{withBrief}</span> with IRIS brief</span>
                <span><span className="text-amber-300">{inProgress}</span> in flight plan</span>
                <span><span className="text-red-300">{dark}</span> dark</span>
              </div>
              {dark > 0 && (
                <div className="mt-3 text-[12px] text-muted-foreground">
                  {dark} section{dark === 1 ? "" : "s"} have no Pre-Flight brief.
                </div>
              )}
            </div>
          );
        })()
      )}
    </Panel>
  );
}

/* ─────────────────────────────── Panel: Team & Section Health ─────────────────────────────── */

function TeamPanel({ missionId }: { missionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-mission-team", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("question_number, health, pens_down_date, assigned_writer_id, profiles:assigned_writer_id(display_name)")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const arr = [...(data ?? [])];
    arr.sort((a: any, b: any) => {
      const aU = a.assigned_writer_id ? 1 : 0;
      const bU = b.assigned_writer_id ? 1 : 0;
      if (aU !== bU) return aU - bU; // unassigned first
      const ad = a.pens_down_date ?? "9999-12-31";
      const bd = b.pens_down_date ?? "9999-12-31";
      return ad.localeCompare(bd);
    });
    return arr;
  }, [data]);

  return (
    <Panel title="Team & Section Health">
      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <Unavailable />
      ) : rows.length === 0 ? (
        <EmptyNote text="No sections in this mission yet." />
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <tr className="border-b border-white/10">
                <th className="px-2 py-1.5 text-left font-medium">Section</th>
                <th className="px-2 py-1.5 text-left font-medium">Writer</th>
                <th className="px-2 py-1.5 text-left font-medium">Health</th>
                <th className="px-2 py-1.5 text-right font-medium">Pens Down</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => {
                const days = daysUntil(r.pens_down_date);
                const urgent = days !== null && days <= 7;
                const writerName = r.profiles?.display_name;
                return (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="px-2 py-1.5 font-medium">{r.question_number}</td>
                    <td className="px-2 py-1.5">
                      {writerName ? (
                        <span className="text-foreground/85">{writerName}</span>
                      ) : (
                        <span className="text-muted-foreground/70">— Unassigned</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <HealthDot health={r.health} />
                    </td>
                    <td className={`px-2 py-1.5 text-right ${urgent ? "text-red-300 font-semibold" : "text-foreground/80"}`}>
                      {r.pens_down_date ? `${r.pens_down_date}${days !== null ? ` · ${days}d` : ""}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HealthDot({ health }: { health: string | null }) {
  const color = health === "green" ? "#10b981" : health === "red" ? "#ef4444" : "#f59e0b";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="capitalize text-foreground/70">{health ?? "—"}</span>
    </span>
  );
}

/* ─────────────────────────────── Panel: Win Themes ─────────────────────────────── */

function WinThemesPanel({ missionId }: { missionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-mission-themes", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("win_themes")
        .select("id, title, description, question_ids")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Panel title="Win Themes">
      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <Unavailable />
      ) : !data || data.length === 0 ? (
        <EmptyNote text="No win themes defined. Add them in the mission Setup Record." />
      ) : (
        <ul className="space-y-2">
          {data.map((t: any) => {
            const count = Array.isArray(t.question_ids) ? t.question_ids.length : 0;
            return (
              <li key={t.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-medium">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 line-clamp-2 text-[12px] text-foreground/70">{t.description}</div>
                )}
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {count > 0 ? (
                    <>Mapped to {count} section{count === 1 ? "" : "s"}</>
                  ) : (
                    <span className="text-amber-300">Not mapped to any section</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────────────────────── Panel: Deadlines ─────────────────────────────── */

function DeadlinesPanel({
  missionId,
  submissionDate,
}: {
  missionId: string;
  submissionDate: string | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-mission-gates", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_review_gates")
        .select("gate_name, target_date, gate_order")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Panel title="Deadlines">
      {isLoading ? (
        <Skeleton />
      ) : (
        <ol className="space-y-2">
          {(isError ? [] : data ?? []).map((g: any, i: number) => {
            const days = daysUntil(g.target_date);
            const past = days !== null && days < 0;
            const urgent = days !== null && days >= 0 && days <= 14;
            return (
              <li
                key={i}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  past ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-black/20"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.gate_name}</div>
                  <div className="text-[11px] text-muted-foreground">{g.target_date ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {days === null ? "—" : past ? `${Math.abs(days)}d ago` : `${days}d`}
                  </span>
                  {urgent && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                      Urgent
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <Flag className="h-3.5 w-3.5" />
              Submission
            </div>
            <div className="text-[12px] text-amber-200">
              {submissionDate ?? "—"}
              {submissionDate && (() => {
                const d = daysUntil(submissionDate);
                return d !== null ? ` · ${d}d` : "";
              })()}
            </div>
          </li>
          {(isError || (data ?? []).length === 0) && (
            <li className="text-[11px] italic text-muted-foreground">
              Review gates not configured.
            </li>
          )}
        </ol>
      )}
    </Panel>
  );
}

/* ─────────────────────────────── shared bits ─────────────────────────────── */

function Skeleton() {
  return <div className="h-20 animate-pulse rounded-md bg-white/[0.04]" />;
}
function Unavailable() {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[12px] italic text-muted-foreground">
      Data unavailable
    </div>
  );
}
function EmptyNote({ text }: { text: string }) {
  return <div className="text-[12px] text-muted-foreground">{text}</div>;
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
