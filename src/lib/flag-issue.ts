import { supabase } from "@/integrations/supabase/client";

export type IssueType = "sos" | "risk";
export type IssueSeverity = "Yellow" | "Orange" | "Red";

// Map the unified Yellow/Orange/Red scale to each table's existing severity enum.
const SOS_SEVERITY: Record<IssueSeverity, string> = {
  Yellow: "Medium",
  Orange: "High",
  Red: "Critical",
};
const RISK_SEVERITY: Record<IssueSeverity, string> = {
  Yellow: "Medium",
  Orange: "High",
  Red: "Critical",
};

export type CreateIssueInput = {
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  recommendedAction?: string | null;
  engagementId: string;
  userId: string;
  memberName: string;
  // Optional structured context (used by huddle auto-flag, etc.)
  category?: string;
  ownerName?: string | null;
  titleHint?: string;
};

export async function createIssue(input: CreateIssueInput) {
  const desc = input.description.trim();
  const action = input.recommendedAction?.trim() || null;

  if (input.type === "sos") {
    const { data, error } = await supabase
      .from("sos_alerts")
      .insert({
        engagement_id: input.engagementId,
        submitted_by: input.userId,
        submitter_name: input.memberName,
        category: input.category ?? "Blocker",
        severity: SOS_SEVERITY[input.severity],
        description: desc,
        owner_name: input.ownerName ?? null,
        recommended_action: action,
        status: "Open",
      })
      .select("id")
      .maybeSingle();
    return { error, id: data?.id ?? null };
  }

  const title = (input.titleHint?.trim() || desc.split("\n")[0]).slice(0, 140);
  const body = action ? `${desc}\n\nRecommended action: ${action}` : desc;
  const { data, error } = await supabase
    .from("risks")
    .insert({
      engagement_id: input.engagementId,
      created_by: input.userId,
      title,
      description: body || null,
      severity: RISK_SEVERITY[input.severity],
      likelihood: "Possible",
      owner_name: input.ownerName ?? input.memberName,
      status: "Open",
    })
    .select("id")
    .maybeSingle();
  return { error, id: data?.id ?? null };
}
