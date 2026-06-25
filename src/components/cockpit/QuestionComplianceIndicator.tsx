import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tiny indicator chip for a single question's compliance status.
 * Used inside flight-deck question cards.
 */
export function QuestionComplianceIndicator({ questionId }: { questionId: string }) {
  const { data } = useQuery({
    queryKey: ["q-compliance-mini", questionId],
    enabled: !!questionId,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("question_compliance_checks")
        .select("verification_status")
        .eq("question_id", questionId);
      const rows = (data ?? []) as Array<{ verification_status: string }>;
      return {
        total: rows.length,
        pending: rows.filter((r) => r.verification_status === "pending").length,
        conflicts: rows.filter((r) => r.verification_status === "conflict").length,
      };
    },
  });

  if (!data || data.total === 0) return null;
  if (data.conflicts > 0) {
    return (
      <span
        title={`${data.conflicts} compliance conflict${data.conflicts > 1 ? "s" : ""} flagged`}
        style={{ fontSize: 9, color: "rgba(248,113,113,0.85)", marginLeft: 4 }}
      >
        ⚠ {data.conflicts}
      </span>
    );
  }
  if (data.pending > 0) {
    return (
      <span
        title={`${data.pending} compliance check${data.pending > 1 ? "s" : ""} pending`}
        style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}
      >
        ○ {data.pending}
      </span>
    );
  }
  return (
    <span
      title="All compliance checks verified"
      style={{ fontSize: 9, color: "rgba(74,222,128,0.7)", marginLeft: 4 }}
    >
      ✓
    </span>
  );
}
