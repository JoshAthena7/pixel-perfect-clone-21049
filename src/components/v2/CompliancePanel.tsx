import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listQuestionCompliance } from "@/lib/compliance.functions";
import { ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, FileText } from "lucide-react";

type Props = { questionId: string; compact?: boolean };

const SEVERITY_RANK: Record<string, number> = { critical: 0, significant: 1, standard: 2 };
const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-rose-300 border-rose-500/30 bg-rose-500/[0.05]",
  significant: "text-amber-300 border-amber-500/30 bg-amber-500/[0.05]",
  standard: "text-cyan-300 border-cyan-500/30 bg-cyan-500/[0.05]",
};

export function CompliancePanel({ questionId, compact }: Props) {
  const fetchFn = useServerFn(listQuestionCompliance);
  const { data, isLoading } = useQuery({
    queryKey: ["question-compliance", questionId],
    queryFn: () => fetchFn({ data: { questionId } }),
  });
  const [expanded, setExpanded] = useState(!compact);

  if (isLoading) {
    return <div className="rounded-[10px] border border-border bg-surface p-4 text-xs text-muted-foreground">Loading compliance…</div>;
  }
  if (!data) return null;

  const allItems = [
    ...data.mission.map((m: any) => ({ ...m, kind: "mission" })),
    ...data.federal.map((f: any) => ({
      id: f.id,
      source_document: f.regulation_name,
      section_reference: f.citation,
      requirement_text: f.section_text,
      plain_language: f.plain_language,
      severity: f.severity,
      source_kind: "federal",
      kind: "federal",
    })),
  ].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));

  // Map latest status per requirement
  const statusByReq = new Map<string, string>();
  for (const r of data.latestResults as any[]) {
    if (r.requirement_id && !statusByReq.has(r.requirement_id)) statusByReq.set(r.requirement_id, r.status);
  }

  const totalChecked = allItems.length;
  const metCount = allItems.filter((r) => statusByReq.get(r.id) === "compliant").length;
  const openCount = allItems.filter((r) => {
    const s = statusByReq.get(r.id);
    return s === "non_compliant" || s === "conflicting" || s === "partial";
  }).length;

  const pct = totalChecked === 0 ? 0 : Math.round((metCount / totalChecked) * 100);

  return (
    <section className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-surface-hover"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">Compliance Status</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {totalChecked > 0 ? (
            <>
              <span className="text-muted-foreground">{metCount} of {totalChecked} met</span>
              {openCount > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> {openCount} open
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No requirements matched</span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {totalChecked > 0 && (
        <div className="h-1.5 w-full bg-black/30">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      {expanded && (
        <div className="border-t border-border p-4 space-y-2 max-h-[480px] overflow-y-auto">
          {allItems.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No compliance requirements matched to this question yet. Upload a Model Contract or State Regulations in the Vault to trigger IRIS extraction.
            </div>
          ) : (
            allItems.map((r: any) => {
              const status = statusByReq.get(r.id) ?? "unknown";
              const statusBadge =
                status === "compliant" ? "✓ Met" :
                status === "partial" ? "◐ Partial" :
                status === "non_compliant" ? "✗ Not addressed" :
                status === "conflicting" ? "⚠ Conflicting" : "○ Unknown";
              const statusColor =
                status === "compliant" ? "text-emerald-400" :
                status === "partial" ? "text-amber-300" :
                status === "non_compliant" ? "text-rose-300" :
                status === "conflicting" ? "text-rose-400" : "text-muted-foreground";
              return (
                <div key={r.id} className={`rounded-md border p-3 text-xs ${SEVERITY_COLOR[r.severity] ?? SEVERITY_COLOR.standard}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">
                      <FileText className="h-3 w-3" />
                      {r.source_document}{r.section_reference ? ` · ${r.section_reference}` : ""}
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] bg-black/30 text-foreground/80">
                        {r.severity}
                      </span>
                      {r.kind === "federal" && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] bg-cyan-500/15 text-cyan-300">FEDERAL</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold ${statusColor}`}>{statusBadge}</span>
                  </div>
                  <div className="mt-1.5 text-foreground/85 leading-relaxed">{r.plain_language ?? r.requirement_text}</div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
