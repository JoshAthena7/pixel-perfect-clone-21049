import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import {
  getResponseTemplate,
  getMissionTemplateCompliance,
} from "@/lib/response-template.functions";

export function ResponseTemplateStatusRow({ missionId }: { missionId: string }) {
  const getTpl = useServerFn(getResponseTemplate);
  const getCompliance = useServerFn(getMissionTemplateCompliance);

  const { data: tplData } = useQuery({
    queryKey: ["response-template", missionId],
    queryFn: () => getTpl({ data: { missionId } }),
  });
  const { data: compliance } = useQuery({
    queryKey: ["template-compliance", missionId],
    queryFn: () => getCompliance({ data: { missionId } }),
    enabled: tplData?.template?.status === "active",
  });

  const tpl = tplData?.template;
  const elementCount = (tplData?.elements ?? []).filter((e) => e.element_type !== "word_limit").length;

  return (
    <section>
      <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Response Template</h2>

      {tpl?.status === "active" ? (
        <div className="rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Active — IRIS-parsed, applied to all sections
                </div>
                {tpl.confirmed_at && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Confirmed {new Date(tpl.confirmed_at).toLocaleDateString()}
                    {" · "}
                    {elementCount} required elements
                  </div>
                )}
                {compliance?.configured && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Template compliance:{" "}
                    <span className="text-foreground font-medium">
                      {compliance.totalSections === 0
                        ? "—"
                        : `${Math.round((compliance.compliantSections / compliance.totalSections) * 100)}%`}
                    </span>{" "}
                    ({compliance.compliantSections} / {compliance.totalSections} sections fully compliant)
                  </div>
                )}
              </div>
            </div>
            <Link
              to="/missions/$missionId/response-template"
              params={{ missionId }}
              className="rounded-md border border-[#6366F1]/40 bg-[#6366F1]/10 px-3 py-1.5 text-xs font-medium text-[#6366F1] hover:bg-[#6366F1]/20"
            >
              View Template
            </Link>
          </div>
        </div>
      ) : tpl?.status === "skipped" ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-200">No response template configured</div>
                <p className="text-xs text-amber-200/70 mt-1">
                  If the client requires a specific response structure, add it here.
                </p>
              </div>
            </div>
            <Link
              to="/missions/$missionId/response-template"
              params={{ missionId }}
              className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
            >
              Configure Template
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">Configure response template</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Define the structure every section must follow.
                </p>
              </div>
            </div>
            <Link
              to="/missions/$missionId/response-template"
              params={{ missionId }}
              className="rounded-md bg-[#6366F1] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7274F3]"
            >
              Configure
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
