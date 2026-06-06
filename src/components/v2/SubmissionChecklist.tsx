// Submission Checklist — surfaces template compliance and other go/no-go items
// on the Mission Overview. The template compliance line is generated from
// getMissionTemplateCompliance and drills down to per-section reasons.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, Circle, FileText } from "lucide-react";
import { getMissionTemplateCompliance } from "@/lib/response-template.functions";

export function SubmissionChecklist({ missionId }: { missionId: string }) {
  const getCompliance = useServerFn(getMissionTemplateCompliance);
  const { data, isLoading } = useQuery({
    queryKey: ["template-compliance", missionId],
    queryFn: () => getCompliance({ data: { missionId } }),
    refetchInterval: 15000,
  });

  return (
    <section>
      <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>
        Submission Checklist
      </h2>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
        <TemplateRow missionId={missionId} data={data} isLoading={isLoading} />
        {/* future checklist items (signatures, attachments, etc.) plug in here */}
      </div>
    </section>
  );
}

function TemplateRow({
  missionId,
  data,
  isLoading,
}: {
  missionId: string;
  data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getMissionTemplateCompliance>>>> | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
        <Circle className="h-4 w-4 animate-pulse" /> Checking template compliance…
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div className="flex items-start gap-3 px-5 py-4">
        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">Response template</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            No client response template configured for this mission.
          </div>
        </div>
        <Link
          to="/missions/$missionId/response-template"
          params={{ missionId }}
          className="text-xs text-[#6366F1] hover:underline self-center"
        >
          Configure
        </Link>
      </div>
    );
  }

  const total = data.totalSections;
  const compliant = data.compliantSections;
  const allClear = total > 0 && compliant === total;
  const pct = total === 0 ? 0 : Math.round((compliant / total) * 100);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        {allClear ? (
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Template compliance</span>
            <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-[#6366F1] bg-[#6366F1]/10 px-1.5 py-0.5 rounded">
              IRIS
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {total === 0
              ? "No sections to evaluate yet."
              : allClear
                ? `All ${total} sections follow the client response template.`
                : `${compliant} of ${total} sections fully compliant (${pct}%)`}
          </div>

          {data.issues.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.issues.slice(0, 6).map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-amber-400/70 mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{issue.sectionLabel || "Section"}</span>
                    {" — "}
                    {issue.reason}
                  </span>
                </li>
              ))}
              {data.issues.length > 6 && (
                <li className="text-[11px] text-muted-foreground/70 pl-3">
                  + {data.issues.length - 6} more issue{data.issues.length - 6 === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}
        </div>
        <Link
          to="/missions/$missionId/response-template"
          params={{ missionId }}
          className="text-xs text-[#6366F1] hover:underline self-center shrink-0"
        >
          View Template
        </Link>
      </div>
    </div>
  );
}
