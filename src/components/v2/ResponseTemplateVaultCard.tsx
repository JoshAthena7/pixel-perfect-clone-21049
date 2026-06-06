import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, ChevronRight } from "lucide-react";
import { getResponseTemplate } from "@/lib/response-template.functions";

export function ResponseTemplateVaultCard({ missionId }: { missionId: string }) {
  const getTpl = useServerFn(getResponseTemplate);
  const { data } = useQuery({
    queryKey: ["response-template", missionId],
    queryFn: () => getTpl({ data: { missionId } }),
  });

  const tpl = data?.template;
  const elements = data?.elements ?? [];
  const elCount = elements.filter((e) => e.element_type !== "word_limit").length;

  const isActive = tpl?.status === "active";
  const isSkipped = tpl?.status === "skipped";

  return (
    <Link
      to="/missions/$missionId/response-template"
      params={{ missionId }}
      className={`block rounded-xl border-2 px-5 py-4 transition ${
        isActive
          ? "border-[#6366F1]/40 bg-[#6366F1]/[0.06] hover:bg-[#6366F1]/[0.10]"
          : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`rounded-lg p-2 ${isActive ? "bg-[#6366F1]/15 text-[#6366F1]" : "bg-amber-500/15 text-amber-300"}`}>
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Response Template</span>
              <span
                className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${
                  isActive
                    ? "bg-[#6366F1]/15 text-[#6366F1]"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {isActive ? "📋 IRIS-Active" : isSkipped ? "⚠ Skipped" : "⚠ Not configured"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {isActive ? (
                <>
                  {tpl?.source === "upload" ? (
                    <>
                      {tpl?.source_file_name ?? "Uploaded file"} ·{" "}
                      {tpl?.confirmed_at ? new Date(tpl.confirmed_at).toLocaleDateString() : "—"} ·{" "}
                      {elCount} elements parsed
                    </>
                  ) : (
                    <>
                      Manually defined ·{" "}
                      {tpl?.confirmed_at ? new Date(tpl.confirmed_at).toLocaleDateString() : "—"} ·{" "}
                      {elCount} elements
                    </>
                  )}
                  <div className="mt-0.5 text-[10px] italic text-muted-foreground/70">
                    Read-only reference · Edit from Mission Overview
                  </div>
                </>
              ) : (
                <>No structure defined for this mission.</>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Link>
  );
}
