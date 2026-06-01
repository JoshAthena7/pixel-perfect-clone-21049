import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export type SignalSeverity = "info" | "warning" | "critical";

export type SignalInput = {
  mission_id: string;
  source_module: string;
  signal_type: string;
  signal_title: string;
  signal_summary?: string;
  severity?: SignalSeverity;
  confidence?: number;
  owner_id?: string | null;
  user_role?: string | null;
  related_question_id?: string | null;
  related_document_id?: string | null;
  related_decision_id?: string | null;
  related_risk_id?: string | null;
  related_conflict_id?: string | null;
  tags?: string[];
  recommended_action?: string | null;
  created_by_system?: boolean;
};

/**
 * Emit a structured signal for IRIS. Every meaningful action in Command
 * should call this so IRIS has a reusable, machine-readable record.
 *
 * Guardrail: mission_id is required. Failures are logged but never throw —
 * signal emission must never break the originating user action.
 */
export async function createSignal(input: SignalInput, queryClient?: QueryClient): Promise<void> {
  if (!input.mission_id) {
    console.warn("[signals] missing mission_id, signal not emitted", input);
    return;
  }
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    const { error } = await supabase.from("signals").insert({
      mission_id: input.mission_id,
      user_id: userId,
      user_role: input.user_role ?? null,
      source_module: input.source_module,
      signal_type: input.signal_type,
      signal_title: input.signal_title,
      signal_summary: input.signal_summary ?? null,
      severity: input.severity ?? "info",
      confidence: input.confidence ?? 0.8,
      owner_id: input.owner_id ?? null,
      related_question_id: input.related_question_id ?? null,
      related_document_id: input.related_document_id ?? null,
      related_decision_id: input.related_decision_id ?? null,
      related_risk_id: input.related_risk_id ?? null,
      related_conflict_id: input.related_conflict_id ?? null,
      tags: input.tags ?? null,
      recommended_action: input.recommended_action ?? null,
      created_by_system: input.created_by_system ?? false,
    });
    if (error) console.warn("[signals] insert failed", error.message);
  } catch (err) {
    console.warn("[signals] unexpected error", err);
  }
}

export const SIGNAL_TYPE_LABELS: Record<string, string> = {
  comment_added: "Comment",
  sme_requested: "SME Requested",
  decision_needed: "Decision Needed",
  leadership_guidance_added: "Guidance Added",
  question_completed: "Question Completed",
  question_assigned: "Question Assigned",
  score_logged: "Score Logged",
  alignment_conflict_detected: "Alignment Conflict",
  sos_raised: "SOS Raised",
  risk_created: "Risk Created",
  risk_updated: "Risk Updated",
  decision_logged: "Decision Logged",
  assumption_created: "Assumption Created",
  assumption_changed: "Assumption Changed",
  document_uploaded: "Document Uploaded",
};

export function signalTypeLabel(t: string): string {
  return SIGNAL_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
