import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, AlertTriangle, Info, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Amendment = {
  id: string;
  mission_id: string;
  amendment_type: string;
  status: string;
  summary: string | null;
  total_changes: number;
  critical_changes: number;
  analyzed_at: string | null;
  created_at: string;
  error_message: string | null;
};

type Change = {
  id: string;
  change_type: string;
  severity: string;
  description: string;
  affected_sections: string[] | null;
  affected_question_ids: string[] | null;
  writer_action_required: string | null;
  acknowledged: boolean;
};

type QuestionLite = { id: string; question_number: string | null; title: string | null };

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  significant: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  administrative: "border-border bg-muted/30 text-muted-foreground",
};

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  significant: Info,
  administrative: Clock,
};

export function AmendmentReviewPanel({
  amendmentId,
  missionId,
  onClose,
}: {
  amendmentId: string;
  missionId: string;
  onClose: () => void;
}) {
  const { data: amendment } = useQuery({
    queryKey: ["amendment", amendmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rfp_amendments")
        .select("id,mission_id,amendment_type,status,summary,total_changes,critical_changes,analyzed_at,created_at,error_message")
        .eq("id", amendmentId)
        .maybeSingle();
      return data as Amendment | null;
    },
  });

  const { data: changes = [] } = useQuery({
    queryKey: ["amendment-changes", amendmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("amendment_changes")
        .select("id,change_type,severity,description,affected_sections,affected_question_ids,writer_action_required,acknowledged")
        .eq("amendment_id", amendmentId)
        .order("severity", { ascending: true });
      return (data ?? []) as Change[];
    },
  });

  const allQuestionIds = Array.from(
    new Set(changes.flatMap((c) => c.affected_question_ids ?? [])),
  );

  const { data: questions = [] } = useQuery({
    queryKey: ["amendment-questions", amendmentId, allQuestionIds.length],
    enabled: allQuestionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .in("id", allQuestionIds);
      return (data ?? []) as QuestionLite[];
    },
  });
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const counts = {
    critical: changes.filter((c) => c.severity === "critical").length,
    significant: changes.filter((c) => c.severity === "significant").length,
    administrative: changes.filter((c) => c.severity === "administrative").length,
    questions: allQuestionIds.length,
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="mx-auto max-w-4xl px-6 py-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)] font-semibold mb-1">
              IRIS Amendment Analysis
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {amendment?.amendment_type?.replace(/_/g, " ") ?? "Amendment"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {amendment?.analyzed_at
                ? `Analyzed ${new Date(amendment.analyzed_at).toLocaleString()}`
                : amendment?.status === "analyzing"
                ? "Analyzing…"
                : amendment?.status === "failed"
                ? `Failed: ${amendment.error_message ?? "unknown error"}`
                : "Pending"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border p-2 hover:bg-muted/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {amendment?.summary && (
          <div className="rounded-[10px] border border-border bg-surface p-4 mb-6 text-sm leading-relaxed">
            {amendment.summary}
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-6">
          <SummaryStat label="Critical" value={counts.critical} tone="destructive" />
          <SummaryStat label="Significant" value={counts.significant} tone="amber" />
          <SummaryStat label="Administrative" value={counts.administrative} tone="muted" />
          <SummaryStat label="Questions affected" value={counts.questions} tone="iris" />
        </div>

        <div className="space-y-3">
          {changes.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {amendment?.status === "analyzed"
                ? "IRIS found no substantive changes in this amendment."
                : "No changes recorded yet."}
            </div>
          )}
          {changes.map((c) => {
            const Icon = SEVERITY_ICON[c.severity] ?? Info;
            const affected = (c.affected_question_ids ?? [])
              .map((id) => qMap.get(id))
              .filter(Boolean) as QuestionLite[];
            return (
              <div
                key={c.id}
                className={`rounded-[10px] border p-4 ${SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.significant}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider font-semibold">
                      <span>{c.severity}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{c.change_type.replace(/_/g, " ")}</span>
                      {c.acknowledged && (
                        <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400 normal-case tracking-normal">
                          acknowledged
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{c.description}</p>
                    {c.writer_action_required && (
                      <p className="text-sm font-medium text-foreground">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">Action:</span>
                        {c.writer_action_required}
                      </p>
                    )}
                    {affected.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {affected.map((q) => (
                          <Link
                            key={q.id}
                            to="/missions/$missionId/sections/$questionId"
                            params={{ missionId, questionId: q.id }}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-[color:var(--iris,#22d3ee)]"
                            onClick={onClose}
                          >
                            <span className="font-mono">{q.question_number ?? "?"}</span>
                            <span className="text-muted-foreground truncate max-w-[200px]">
                              {q.title ?? ""}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "destructive" | "amber" | "muted" | "iris";
}) {
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "amber"
      ? "text-amber-400"
      : tone === "iris"
      ? "text-[color:var(--iris,#22d3ee)]"
      : "text-muted-foreground";
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
