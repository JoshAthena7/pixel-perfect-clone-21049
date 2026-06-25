import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ComplianceObligation = {
  obligation_summary: string | null;
  obligation_text: string | null;
  obligation_type: string | null;
  section_reference: string | null;
  risk_level: "critical" | "high" | "medium" | "low" | null;
  document_type: "model_contract" | "scope_of_work" | null;
};

export type QuestionComplianceCheck = {
  id: string;
  verification_status: "pending" | "compliant" | "conflict" | "not_applicable" | "needs_review";
  verification_note: string | null;
  iris_assessment: string | null;
  iris_confidence: number | null;
  iris_flag: string | null;
  compliance_obligations: ComplianceObligation | null;
};

export type ComplianceStats = {
  total: number;
  verified: number;
  conflicts: number;
  pending: number;
};

const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function useQuestionCompliance(questionId: string | null | undefined, missionId: string) {
  const [checks, setChecks] = useState<QuestionComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ComplianceStats>({ total: 0, verified: 0, conflicts: 0, pending: 0 });

  const fetchChecks = useCallback(async () => {
    if (!questionId || !missionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("question_compliance_checks")
      .select(
        `id, verification_status, verification_note, iris_assessment, iris_confidence, iris_flag,
         compliance_obligations(obligation_summary, obligation_text, obligation_type, section_reference, risk_level, document_type)`,
      )
      .eq("question_id", questionId);

    const all = ((data ?? []) as QuestionComplianceCheck[]).slice().sort((a, b) => {
      const ar = RISK_ORDER[a.compliance_obligations?.risk_level ?? "medium"] ?? 2;
      const br = RISK_ORDER[b.compliance_obligations?.risk_level ?? "medium"] ?? 2;
      return ar - br;
    });
    setChecks(all);
    setStats({
      total: all.length,
      verified: all.filter((c) => c.verification_status === "compliant" || c.verification_status === "not_applicable").length,
      conflicts: all.filter((c) => c.verification_status === "conflict").length,
      pending: all.filter((c) => c.verification_status === "pending").length,
    });
    setLoading(false);
  }, [questionId, missionId]);

  useEffect(() => {
    void fetchChecks();
  }, [fetchChecks]);

  const updateCheck = useCallback(
    async (
      checkId: string,
      status: "pending" | "compliant" | "conflict" | "not_applicable" | "needs_review",
      note?: string,
    ) => {
      const { data: userData } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("question_compliance_checks")
        .update({
          verification_status: status,
          verification_note: note ?? null,
          verified_by: userData.user?.id ?? null,
          verified_at: status === "pending" ? null : new Date().toISOString(),
        })
        .eq("id", checkId);
      await fetchChecks();
    },
    [fetchChecks],
  );

  return { checks, loading, stats, updateCheck, refetch: fetchChecks };
}
