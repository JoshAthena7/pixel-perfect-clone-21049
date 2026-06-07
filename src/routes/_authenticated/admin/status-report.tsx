import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Mail, Sparkles, Copy, Printer, X, Send,
} from "lucide-react";
import {
  listMissionsForPM,
  listMissionCheckins,
  getSectionStatusBoard,
  generateStatusReport,
  sendCheckinReminders,
  mintCheckinTokens,
} from "@/lib/checkin.functions";
import { useSelectedAdminMission } from "@/routes/_authenticated/admin";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/status-report")({
  component: StatusReportPage,
});

function StatusReportPage() {
  const adminMissionId = useSelectedAdminMission();
  const listMissions = useServerFn(listMissionsForPM);
  const missionsQuery = useQuery({
    queryKey: ["status-report", "missions"],
    queryFn: () => listMissions(),
  });

  const [missionId, setMissionId] = useState<string | null>(null);
  // O-4: Prefer the admin header's active mission context so Status Report
  // tracks the rest of the Olympus shell. Fall back to local picker.
  const effectiveMissionId =
    missionId ?? adminMissionId ?? missionsQuery.data?.[0]?.id ?? null;

  return (
    <div className="min-h-dvh bg-[#060b14] px-6 py-8 text-slate-200">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-500">ATLAS</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Status Report</h1>
            <p className="mt-1 text-sm text-slate-400">
              Aggregated check-in submissions and section status across the mission.
            </p>
          </div>

          {missionsQuery.data && missionsQuery.data.length > 1 && (
            <select
              value={effectiveMissionId ?? ""}
              onChange={(e) => setMissionId(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
              aria-label="Select mission"
            >
              {missionsQuery.data.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* O-4: never show an infinite spinner. If we have no mission to scope
            to, show a clear empty state instead. */}
        {!effectiveMissionId && !missionsQuery.isLoading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
            Select a mission context above to view the status report.
          </div>
        )}
        {missionsQuery.isLoading && !effectiveMissionId && (
          <div className="text-sm text-slate-500">Loading missions…</div>
        )}
        {missionsQuery.data && missionsQuery.data.length === 0 && !adminMissionId && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
            No missions to report on yet. The Status Report is available to project managers and platform admins.
          </div>
        )}

        {effectiveMissionId && <StatusReportBody missionId={effectiveMissionId} />}
      </div>
    </div>
  );
}

function StatusReportBody({ missionId }: { missionId: string }) {
  const checkinsFn = useServerFn(listMissionCheckins);
  const boardFn = useServerFn(getSectionStatusBoard);
  const reportFn = useServerFn(generateStatusReport);

  const checkins = useQuery({
    queryKey: ["status-report", "checkins", missionId],
    queryFn: () => checkinsFn({ data: { missionId } }),
  });
  const board = useQuery({
    queryKey: ["status-report", "board", missionId],
    queryFn: () => boardFn({ data: { missionId } }),
  });

  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<any>(null);

  async function openReport() {
    try {
      const r = await reportFn({ data: { missionId } });
      setReport(r);
      setReportOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate report");
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={openReport}
          className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-400"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Generate Client Status Report
        </button>
        <MintTokensButton missionId={missionId} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <CheckinFeedPanel data={checkins.data} loading={checkins.isLoading} missionId={missionId} onChange={() => checkins.refetch()} />
        <SectionStatusBoardPanel data={board.data} loading={board.isLoading} />
      </div>

      {reportOpen && report && <StatusReportModal report={report} onClose={() => setReportOpen(false)} />}
    </>
  );
}

// ===== Mint tokens (utility for PMs while email infra is being set up) =====
function MintTokensButton({ missionId }: { missionId: string }) {
  const mint = useServerFn(mintCheckinTokens);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Array<{ writer_user_id: string; token: string }> | null>(null);

  async function go() {
    setBusy(true);
    try {
      const r = await mint({ data: { missionId } });
      setLinks(r.tokens);
      toast.success(`Generated ${r.tokens.length} check-in link${r.tokens.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mint tokens");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
      >
        <Mail className="h-4 w-4" aria-hidden />
        {busy ? "Generating…" : "Generate Check-In Links"}
      </button>
      {links && (
        <div className="w-full rounded-md border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="mb-2 font-semibold text-slate-300">Check-in links (copy & send to writers):</div>
          <ul className="space-y-1.5">
            {links.map((l) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${l.token}`;
              return (
                <li key={l.token} className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-slate-950 px-2 py-1 text-slate-400">{url}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    aria-label="Copy link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// ===== Left: Check-In Feed =====
function CheckinFeedPanel({
  data, loading, missionId, onChange,
}: {
  data: any; loading: boolean; missionId: string; onChange: () => void;
}) {
  const sendFn = useServerFn(sendCheckinReminders);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function sendReminders() {
    if (!data?.cycle) return;
    try {
      const r = await sendFn({ data: { missionId, cycleId: data.cycle.id } });
      toast.success(`Reminder sent to ${r.reminded} writer${r.reminded === 1 ? "" : "s"}`);
      setConfirming(false);
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send reminders");
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">This Week's Check-Ins</h2>
        {data?.completion?.total > 0 && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/20"
          >
            Send Reminder
          </button>
        )}
      </header>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {data && (
        <>
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-slate-300">
                <span className="font-semibold text-white">{data.completion.submitted}</span> of {data.completion.total} writers submitted
              </span>
              <span className="font-semibold text-slate-400">{data.completion.pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${data.completion.pct}%` }} />
            </div>
          </div>

          <ul className="space-y-2">
            {data.writers.map((w: any) => {
              const isOpen = expanded.has(w.user_id);
              return (
                <li key={w.user_id} className="rounded-lg border border-slate-800 bg-slate-900/60">
                  <button
                    type="button"
                    onClick={() => {
                      const n = new Set(expanded);
                      n.has(w.user_id) ? n.delete(w.user_id) : n.add(w.user_id);
                      setExpanded(n);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    aria-expanded={isOpen}
                  >
                    <Avatar name={w.name} url={w.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{w.name}</div>
                      <WriterStatusChip w={w} />
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-800 px-3 py-2.5">
                      {w.updates.length === 0 ? (
                        <p className="text-xs italic text-slate-500">No section updates submitted.</p>
                      ) : (
                        <ul className="space-y-2">
                          {w.updates.map((u: any, i: number) => (
                            <li key={i} className="text-xs">
                              <div className="text-slate-300">
                                <span className="font-semibold">{u.section?.number}</span> {u.section?.title}
                              </div>
                              <div className="text-slate-500">
                                {statusLabel(u.status)}
                                {u.progress_pct !== null && ` · ${u.progress_pct}%`}
                              </div>
                              {u.notes && <div className="mt-0.5 italic text-slate-400">"{u.notes}"</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Send reminder?"
          message={`Send a follow-up email to ${data?.writers?.filter((w: any) => w.status !== "submitted").length ?? 0} writer(s) who haven't submitted.`}
          confirmLabel="Send"
          onCancel={() => setConfirming(false)}
          onConfirm={sendReminders}
        />
      )}
    </section>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    return <img src={url} alt="" className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
      {initials || "?"}
    </div>
  );
}

function WriterStatusChip({ w }: { w: any }) {
  if (w.status === "submitted") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Submitted {timeAgo(w.submitted_at)}
      </div>
    );
  }
  if (w.status === "overdue") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Overdue
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-400">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Not yet submitted
    </div>
  );
}

// ===== Right: Section Status Board =====
type SortKey = "status" | "writer" | "due" | "updated";

function SectionStatusBoardPanel({ data, loading }: { data: any; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("status");

  const sorted = useMemo(() => {
    if (!data?.rows) return [];
    const order = { blocked: 0, not_started: 1, in_progress: 2, draft_done: 3, null: 4 } as any;
    const rows = [...data.rows];
    rows.sort((a, b) => {
      if (sortKey === "status") return (order[a.status ?? "null"] ?? 5) - (order[b.status ?? "null"] ?? 5);
      if (sortKey === "writer") return (a.writer ?? "").localeCompare(b.writer ?? "");
      if (sortKey === "due") return (a.internal_due_date ?? "9999").localeCompare(b.internal_due_date ?? "9999");
      if (sortKey === "updated") return (b.last_updated ?? "").localeCompare(a.last_updated ?? "");
      return 0;
    });
    return rows;
  }, [data, sortKey]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Section Status Board</h2>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Sort:</span>
          {(["status", "writer", "due", "updated"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortKey(k)}
              className="rounded px-2 py-0.5 transition-colors"
              style={{
                background: sortKey === k ? "rgba(59,130,246,0.15)" : "transparent",
                color: sortKey === k ? "#93C5FD" : "#94a3b8",
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </header>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {sorted.length === 0 && !loading && (
        <p className="text-sm text-slate-500">No sections defined for this mission yet.</p>
      )}

      <ul className="space-y-2">
        {sorted.map((r: any) => (
          <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-white">{r.number}</span>
                  <span className="text-sm text-slate-300">{r.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{r.writer}</span>
                  {r.internal_due_date && <span>Due {r.internal_due_date}</span>}
                  {r.last_updated && <span>Updated {timeAgo(r.last_updated)}</span>}
                  <SourceChip source={r.source} />
                </div>
                {r.notes && <div className="mt-1 text-xs italic text-slate-400">"{r.notes}"</div>}
                {r.risks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.risks.map((risk: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: "rgba(99,102,241,0.12)",
                          color: "#a5b4fc",
                          border: "1px solid rgba(99,102,241,0.25)",
                        }}
                      >
                        <Sparkles className="h-3 w-3" aria-hidden />
                        <span style={{ color: risk.level === "red" ? "#fca5a5" : "#fcd34d" }}>●</span>
                        {risk.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <StatusPill status={r.status} />
                {r.progress_pct !== null && r.progress_pct !== undefined && (
                  <span className="text-xs text-slate-400">{r.progress_pct}%</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourceChip({ source }: { source: "studio" | "checkin" | "none" }) {
  if (source === "none") return <span className="text-slate-600">No update</span>;
  const Icon = source === "studio" ? Zap : Mail;
  return (
    <span className="inline-flex items-center gap-1 text-slate-500">
      <Icon className="h-3 w-3" aria-hidden />
      {source === "studio" ? "Studio" : "Check-In"}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    not_started: { bg: "#334155", fg: "#cbd5e1", label: "Not Started" },
    in_progress: { bg: "rgba(59,130,246,0.2)", fg: "#93c5fd", label: "In Progress" },
    draft_done: { bg: "rgba(34,197,94,0.2)", fg: "#86efac", label: "Draft Done" },
    blocked: { bg: "rgba(239,68,68,0.2)", fg: "#fca5a5", label: "Blocked" },
  };
  const m = (status && map[status]) || { bg: "#1e293b", fg: "#64748b", label: "—" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

function statusLabel(s: string | null): string {
  return ({ not_started: "Not Started", in_progress: "In Progress", draft_done: "Draft Done", blocked: "Blocked" } as any)[s ?? ""] ?? "—";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ===== Modal & Report =====
function ConfirmDialog({
  title, message, confirmLabel, onCancel, onConfirm,
}: {
  title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h3 id="confirm-title" className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function StatusReportModal({ report, onClose }: { report: any; onClose: () => void }) {
  const text = useMemo(() => formatReportText(report), [report]);

  function copy() {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }
  function printPdf() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3 print:hidden">
          <h3 id="report-title" className="text-base font-semibold text-white">Client Status Report</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
            </button>
            <button type="button" onClick={printPdf} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
              <Printer className="h-3.5 w-3.5" aria-hidden /> Print / PDF
            </button>
            <button type="button" onClick={() => toast.info("Email send coming once email infrastructure is configured.")} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
              <Send className="h-3.5 w-3.5" aria-hidden /> Email
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <pre className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words bg-white px-6 py-6 font-mono text-[13px] text-slate-900 print:max-h-none print:overflow-visible">{text}</pre>
      </div>
    </div>
  );
}

function formatReportText(r: any): string {
  const pct = (n: number) => (r.total ? `${Math.round((n / r.total) * 100)}%` : "0%");
  const milestones = ""; // Future: pull from mission_timeline if needed
  void milestones;
  const lines = [
    `${r.mission?.name ?? "Mission"} — Weekly Status Report`,
    `Week of ${r.week_of} | Submitted by ${r.pm_name}`,
    "",
    `OVERALL STATUS: ${r.overall}`,
    "",
    `SECTION PROGRESS SUMMARY:`,
    `Complete / Approved:     ${r.counts.complete} sections  (${pct(r.counts.complete)})`,
    `In Progress:             ${r.counts.in_progress} sections  (${pct(r.counts.in_progress)})`,
    `Not Started:             ${r.counts.not_started} sections  (${pct(r.counts.not_started)})`,
    `Blocked:                 ${r.counts.blocked} sections  (${pct(r.counts.blocked)})`,
    "",
    `ACTIVE RISKS:`,
    ...(r.reds.length || r.yellows.length
      ? [...r.reds, ...r.yellows].map((x: any) => `• ${x.label}`)
      : ["• None reported"]),
    "",
    `BLOCKERS REQUIRING ATTENTION:`,
    ...(r.blocked_items.length
      ? r.blocked_items.map((b: any) => `• ${b.label} — ${b.note}`)
      : ["• None"]),
    "",
    `NEXT WEEK FOCUS:`,
    ...(r.next_week.length ? r.next_week.map((s: string) => `• ${s}`) : ["• No sections due in the next 7 days"]),
    "",
    `IRIS ASSESSMENT: ${r.iris_assessment}`,
  ];
  return lines.join("\n");
}
