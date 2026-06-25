import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type QuestionResponseOutline = {
  id: string;
  mission_id: string;
  question_id: string | null;
  document_id: string | null;
  section_headers: string[];
  content_guidance: string | null;
  word_allocation: Record<string, number>;
  total_word_limit: number | null;
  format_notes: string | null;
  required_elements: string[];
  prohibited_elements: string[];
  source_text: string | null;
  confidence: number | null;
  parsed_at: string | null;
};

export function useQuestionOutline(questionId: string | null, missionId: string | null) {
  const [outline, setOutline] = useState<QuestionResponseOutline | null>(null);
  const [hasGlobalOutline, setHasGlobalOutline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!questionId || !missionId) {
      setOutline(null);
      setHasGlobalOutline(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: specific } = await sb
        .from("question_response_outlines")
        .select("*")
        .eq("mission_id", missionId)
        .eq("question_id", questionId)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (specific) {
        setOutline(specific as QuestionResponseOutline);
        setHasGlobalOutline(false);
        setLoading(false);
        return;
      }

      const { data: general } = await sb
        .from("question_response_outlines")
        .select("*")
        .eq("mission_id", missionId)
        .is("question_id", null)
        .order("parsed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (general) {
        setOutline(general as QuestionResponseOutline);
        setHasGlobalOutline(true);
      } else {
        setOutline(null);
        setHasGlobalOutline(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId, missionId, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  return { outline, hasGlobalOutline, loading, refetch };
}
