/**
 * Mission Control role & permission system.
 *
 * Spec roles (from PROMPT-2):
 *   exec     — Executive: high-visibility read-only. Lobby + Exec view + Mission Control (read).
 *   lead     — Engagement Lead: full access. Maps to existing DB roles `founder` and `engagement_lead`.
 *   pm       — Project Manager: ops + signals + library + resource health. No alignment hub. No strategy.
 *   writer   — Writer: lightweight reading + Pulse + signal submission.
 *   sme      — Subject Matter Expert: briefing read + notes, alignment read, library read, signal submit.
 *   partner  — External Partner: only RFP Intel + State Intel + Meeting Notes + Policy Docs (read).
 *
 * Legacy roles kept for back-compat:
 *   founder       → behaves as `lead`
 *   viewer        → behaves as `exec`
 */

export type RoleId =
  | "exec"
  | "lead"
  | "pm"
  | "writer"
  | "sme"
  | "partner"
  // legacy DB values
  | "founder"
  | "engagement_lead"
  | "viewer";

export type NormalizedRole = "exec" | "lead" | "pm" | "writer" | "sme" | "partner";

export const ROLE_LABELS: Record<NormalizedRole, string> = {
  exec: "Executive",
  lead: "Engagement Lead",
  pm: "Project Manager",
  writer: "Writer",
  sme: "SME",
  partner: "External Partner",
};

/** Map any stored role value to one of the six canonical roles. */
export function normalizeRole(role: string | null | undefined): NormalizedRole | null {
  if (!role) return null;
  switch (role) {
    case "founder":
    case "engagement_lead":
    case "lead":
      return "lead";
    case "pm":
      return "pm";
    case "writer":
      return "writer";
    case "sme":
      return "sme";
    case "partner":
      return "partner";
    case "viewer":
    case "exec":
      return "exec";
    default:
      return null;
  }
}

/**
 * Canonical "pages" (capability targets). One key per nav surface.
 * Keep this list small and stable — module pages reference it.
 */
export type PageKey =
  | "lobby"            // /select-engagement
  | "executiveView"    // /command top section
  | "missionControl"   // /command
  | "deliveryMap"      // /heatmap (Resource Health)
  | "briefing"         // /intel (Mission Briefing / Vault)
  | "briefingRfpOnly"  // partner subset of briefing
  | "escalations"      // /issues (SOS, signals)
  | "broadcasts"       // /broadcasts (Team Signals)
  | "pulse"            // /pulse
  | "alignmentHub"     // /assistant
  | "settings"         // /settings, /section-assignments
  | "compliance"       // /engagement/$id/compliance
  | "library";         // Mission Library (alias for briefing reads)

type Perm = "none" | "read" | "write";

/** Permission matrix: [role][page] → access level. */
const MATRIX: Record<NormalizedRole, Partial<Record<PageKey, Perm>>> = {
  lead: {
    lobby: "write", executiveView: "write", missionControl: "write",
    deliveryMap: "write", briefing: "write", briefingRfpOnly: "write",
    escalations: "write", broadcasts: "write", pulse: "write",
    alignmentHub: "write", settings: "write", compliance: "write", library: "write",
  },
  pm: {
    lobby: "read", executiveView: "read", missionControl: "write",
    deliveryMap: "write", briefing: "read", briefingRfpOnly: "read",
    escalations: "write", broadcasts: "write", pulse: "write",
    alignmentHub: "none", settings: "write", compliance: "write", library: "write",
  },
  exec: {
    lobby: "read", executiveView: "read", missionControl: "read",
    deliveryMap: "none", briefing: "none", briefingRfpOnly: "none",
    escalations: "none", broadcasts: "none", pulse: "none",
    alignmentHub: "none", settings: "none", compliance: "none", library: "none",
  },
  writer: {
    lobby: "read", executiveView: "none", missionControl: "none",
    deliveryMap: "none", briefing: "read", briefingRfpOnly: "read",
    escalations: "read", broadcasts: "read", pulse: "write",
    alignmentHub: "none", settings: "none", compliance: "read", library: "read",
  },
  sme: {
    lobby: "read", executiveView: "none", missionControl: "none",
    deliveryMap: "none", briefing: "write", briefingRfpOnly: "read",
    escalations: "none", broadcasts: "read", pulse: "write",
    alignmentHub: "read", settings: "none", compliance: "read", library: "read",
  },
  partner: {
    lobby: "read", executiveView: "none", missionControl: "none",
    deliveryMap: "none", briefing: "none", briefingRfpOnly: "read",
    escalations: "none", broadcasts: "none", pulse: "none",
    alignmentHub: "none", settings: "none", compliance: "none", library: "read",
  },
};

export function can(role: string | null | undefined, page: PageKey): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  const p = MATRIX[r][page] ?? "none";
  return p !== "none";
}

export function canWrite(role: string | null | undefined, page: PageKey): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return (MATRIX[r][page] ?? "none") === "write";
}

export function permission(
  role: string | null | undefined,
  page: PageKey,
): Perm {
  const r = normalizeRole(role);
  if (!r) return "none";
  return MATRIX[r][page] ?? "none";
}

export const LEAD_ROLES: NormalizedRole[] = ["lead"];
export const STAFF_ROLES: NormalizedRole[] = ["lead", "pm"];
