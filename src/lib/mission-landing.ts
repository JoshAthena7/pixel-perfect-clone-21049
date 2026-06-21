/**
 * Role-based mission landing routes (FIVE-5 Step 1).
 *
 * Writers/SMEs land on "My Questions" (flight-deck).
 * Leads/PMs land on "Mission Control" (war-room).
 * Admin/reviewer fall back to Briefing.
 */
export type LandingSlug = "flight-deck" | "war-room" | "briefing";

export function getMissionLandingSlug(role: string | null | undefined): LandingSlug {
  const r = String(role ?? "").toLowerCase();
  if (r === "writer" || r === "sme") return "flight-deck";
  if (r === "engagement_lead" || r === "project_manager" || r === "lead" || r === "pm") {
    return "war-room";
  }
  return "briefing";
}

export function getMissionLandingPath(missionId: string, role: string | null | undefined): string {
  return `/missions/${missionId}/${getMissionLandingSlug(role)}`;
}

export const ROLE_DISPLAY: Record<string, string> = {
  writer: "Writer",
  engagement_lead: "Engagement Lead",
  project_manager: "Project Manager",
  pm: "Project Manager",
  lead: "Lead",
  admin: "Admin",
  sme: "SME",
  reviewer: "Reviewer",
};

export function displayRole(role: string | null | undefined): string {
  const r = String(role ?? "").toLowerCase();
  return ROLE_DISPLAY[r] ?? (r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Member");
}

export function firstVisitKey(missionId: string, userId: string): string {
  return `atlas_first_visit_${missionId}_${userId}`;
}

export function firstLoginGlobalKey(userId: string): string {
  return `atlas_first_login_at_${userId}`;
}
