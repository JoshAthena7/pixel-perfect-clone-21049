/**
 * Mission display helpers — short code extraction, title casing, status labels.
 */

/**
 * Extract a short mission code from a name like "T1932 - Contracted System..."
 * Returns the first dash-or-whitespace token, or a 12-char truncation as fallback.
 */
export function shortMissionCode(name: string | null | undefined): string {
  if (!name) return "Mission";
  const first = name.split(/\s*-\s*/)[0]?.trim();
  if (first && first.length <= 12) return first;
  if (name.length <= 12) return name;
  return name.slice(0, 12).trimEnd() + "…";
}

/** Title-case a name like "DANIEL MARTIN" → "Daniel Martin". Preserves mixed-case names. */
export function toTitleCase(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

/** Canonical user-facing status label map. */
export const STATUS_LABELS: Record<string, string> = {
  // question status
  not_started: "Not Started",
  drafting: "Drafting",
  in_review: "In Review",
  finalized: "Finalized",
  briefed: "Drafting",
  in_progress: "Drafting",
  // question health
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At Risk",
  unstarted: "Unstarted",
  unscored: "Unscored",
  // roles
  engagement_lead: "Engagement Lead",
  lead: "Engagement Lead",
  project_manager: "Project Manager",
  writer: "Writer",
  lead_writer: "Lead Writer",
  sme: "SME",
  reviewer: "Reviewer",
  admin: "Admin",
  // urgency
  immediate: "Immediate",
  high: "High",
  normal: "Normal",
  low: "Low",
  // signal status
  approved: "Approved",
  pushed: "Platform",
  needs_review: "Needs Review",
  dismissed: "Dismissed",
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}
