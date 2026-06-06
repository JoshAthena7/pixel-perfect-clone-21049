// ATLAS V1 — single mission constants
export const NJ_CSOC_MISSION_ID = "2c47b677-60ec-4579-a5ed-d9bc3ec227c2";

// Role buckets used for routing + visibility
export const PM_ROLES = ["project_manager", "engagement_lead", "lead", "lead_writer", "admin"];
export const WRITER_ROLES = ["writer", "sme", "lead_writer"];

export function isPmRole(role: string | null | undefined): boolean {
  return !!role && PM_ROLES.includes(role.toLowerCase());
}

export function isWriterRole(role: string | null | undefined): boolean {
  return !!role && WRITER_ROLES.includes(role.toLowerCase());
}

export type SectionStatus =
  | "not_started"
  | "in_progress"
  | "draft_done"
  | "in_review"
  | "approved"
  | "blocked";

export function normalizeStatus(raw: string | null | undefined): SectionStatus {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  if (s === "in_progress") return "in_progress";
  if (s === "draft_done" || s === "draft") return "draft_done";
  if (s === "in_review" || s === "review") return "in_review";
  if (s === "approved" || s === "complete") return "approved";
  if (s === "blocked") return "blocked";
  return "not_started";
}

export const STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  draft_done: "Draft Done",
  in_review: "In Review",
  approved: "Approved",
  blocked: "Blocked",
};
