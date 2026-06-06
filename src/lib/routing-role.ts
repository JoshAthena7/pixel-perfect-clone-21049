// Phase 3 — pure routing-role helpers (client-safe).
// computePrimaryRoutingRole lives on the server (see routing.functions.ts);
// these helpers + types are shared by both runtimes.

export type RoutingRole =
  | "executive_sponsor"
  | "engagement_lead"
  | "pm"
  | "reviewer"
  | "writer"
  | "sme"
  | "checkin_only"
  | "none";

export const ROLE_PRIORITY: Record<RoutingRole, number> = {
  executive_sponsor: 1,
  engagement_lead: 2,
  pm: 3,
  reviewer: 4,
  writer: 5,
  sme: 5,
  checkin_only: 6,
  none: 99,
};

// Phase 5: Olympus is shipped. Executive Sponsors land here on login.
export const EXEC_ROUTING_DESTINATION = "/olympus" as const;

export const SESSION_RECENCY_HOURS = 4;

// Default mission sort per role (read by Atrium on first mount).
export type RoleSortDefault = "submission" | "health" | "activity" | "alpha";
export const DEFAULT_SORT_BY_ROLE: Record<RoutingRole, RoleSortDefault> = {
  executive_sponsor: "health",
  engagement_lead: "health",
  pm: "submission",
  reviewer: "submission",
  writer: "submission",
  sme: "submission",
  checkin_only: "submission",
  none: "submission",
};

// Map raw role strings from user_roles + mission_members → RoutingRole.
export function mapRawRoleToRouting(raw: string): RoutingRole | null {
  const r = raw.toLowerCase().trim();
  if (r === "executive_sponsor") return "executive_sponsor";
  if (r === "engagement_lead" || r === "lead" || r === "lead_writer") return "engagement_lead";
  if (r === "pm" || r === "project_manager") return "pm";
  if (r === "reviewer") return "reviewer";
  if (r === "writer" || r === "lead_graphics") return "writer";
  if (r === "sme") return "sme";
  if (r === "checkin_only" || r === "checkin") return "checkin_only";
  if (r === "viewer") return "writer";
  if (r === "admin") return "pm"; // mission-level admin → treat as PM for routing
  return null;
}

export function pickPrimaryRole(rawRoles: string[], isPlatformAdmin: boolean): RoutingRole {
  if (isPlatformAdmin) return "executive_sponsor";
  const mapped = rawRoles
    .map(mapRawRoleToRouting)
    .filter((x): x is RoutingRole => x !== null);
  if (mapped.length === 0) return "none";
  return mapped.reduce((best, r) =>
    ROLE_PRIORITY[r] < ROLE_PRIORITY[best] ? r : best,
  );
}

export type RoutingDestination = {
  to: string;
  search?: Record<string, string>;
  params?: Record<string, string>;
};

export function routeForRole(
  role: RoutingRole,
  ctx: { missionCount: number; singleMissionId: string | null },
): RoutingDestination {
  switch (role) {
    case "executive_sponsor":
      return { to: EXEC_ROUTING_DESTINATION };
    case "engagement_lead":
      if (ctx.missionCount === 1 && ctx.singleMissionId) {
        return {
          to: "/missions/$missionId/brief",
          params: { missionId: ctx.singleMissionId },
        };
      }
      return { to: "/home" };
    case "pm":
      return { to: "/home" };
    case "reviewer":
      return { to: "/cockpit", search: { status_filter: "in_review" } };
    case "writer":
      return { to: "/cockpit" };
    case "sme":
      return { to: "/cockpit", search: { sme_filter: "active" } };
    case "checkin_only":
      return { to: "/checkin-home" };
    case "none":
    default:
      return { to: "/home" };
  }
}

// Paths that count as "the default landing" — LoginRouter will only reroute
// from these. Anything else is treated as a deep link.
export const DEFAULT_LANDING_PATHS = new Set(["/", "/atrium", "/home"]);

export function shouldHonorDeepLink(pathname: string): boolean {
  return !DEFAULT_LANDING_PATHS.has(pathname);
}
