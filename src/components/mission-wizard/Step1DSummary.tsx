import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchSummary(missionId: string) {
  const [mission, docs, sections, questions] = await Promise.all([
    supabase.from("missions").select("submission_deadline, iris_disclaimer").eq("id", missionId).single(),
    supabase.from("mission_documents").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
    supabase
      .from("mission_sections")
      .select("id, parent_section_id, iris_confidence")
      .eq("mission_id", missionId),
    supabase
      .from("mission_questions")
      .select("id, iris_confidence")
      .eq("mission_id", missionId),
  ]);
  if (mission.error) throw mission.error;
  const sec = sections.data ?? [];
  const qs = questions.data ?? [];
  const conf = (c: string) => sec.filter((s) => s.iris_confidence === c).length + qs.filter((q) => q.iris_confidence === c).length;
  return {
    submission_deadline: mission.data.submission_deadline as string | null,
    iris_disclaimer: mission.data.iris_disclaimer as string | null,
    docs: docs.count ?? 0,
    sections: sec.filter((s) => s.parent_section_id === null).length,
    sub_sections: sec.filter((s) => s.parent_section_id !== null).length,
    questions: qs.length,
    high: conf("high"),
    medium: conf("medium"),
    low: conf("low"),
  };
}

export function Step1DSummary({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mission-summary", missionId],
    queryFn: () => fetchSummary(missionId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Failed to load summary.</p>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const allZero =
    data.docs === 0 &&
    data.sections === 0 &&
    data.sub_sections === 0 &&
    data.questions === 0 &&
    data.high === 0 &&
    data.medium === 0 &&
    data.low === 0;

  const stats = [
    { label: "Documents Processed", value: data.docs },
    { label: "Sections Identified", value: data.sections },
    { label: "Sub-sections Identified", value: data.sub_sections },
    { label: "Questions Identified", value: data.questions },
    { label: "High Confidence Fields", value: data.high },
    { label: "Amber Confidence Fields", value: data.medium },
    { label: "Low Confidence Fields", value: data.low },
    {
      label: "Submission Deadline",
      value: data.submission_deadline
        ? format(new Date(data.submission_deadline), "MMMM d, yyyy 'at' h:mm a")
        : "—",
      isText: true,
    },
  ];

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Here is what I found.</h1>
        <p className="text-muted-foreground">Review my work before we go section by section.</p>
      </div>

      <div className="rounded-xl border-2 border-[var(--athena-gold)]/50 bg-[var(--athena-navy-light)]/10 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => (
            <div key={s.label} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p
                className={
                  s.isText
                    ? "text-base font-semibold text-foreground"
                    : "text-3xl font-bold text-[var(--athena-gold)]"
                }
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {data.iris_disclaimer && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/90">{data.iris_disclaimer}</p>
        </div>
      )}

      {allZero && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/90">
            I was not able to extract a structure from your documents. You will build the section structure manually
            in the next step.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          onClick={() =>
            navigate({
              to: "/olympus/missions/$missionId/wizard",
              params: { missionId },
              search: { step: 4 },
            })
          }
          className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)] min-w-[240px]"
        >
          Review Section by Section →
        </Button>
        <Button
          variant="outline"
          onClick={() => toast("Download coming soon.")}
          className="border-[var(--athena-gold)]/40 text-foreground"
        >
          Download Extraction Report
        </Button>
      </div>
    </div>
  );
}
