/**
 * Profile Completeness — shared scoring logic.
 *
 * IMPORTANT: This must stay in lockstep with the SQL function
 * `public.calc_atlas_profile_completeness` (a BEFORE INSERT/UPDATE trigger on
 * `atlas_team_members` writes the canonical score using that function).
 * The DB is the source of truth; this helper exists so the UI can show the
 * same per-field breakdown without a roundtrip.
 */

export type CompletenessSource = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  atlas_role: string | null;
  atlas_invite_status: string | null;
  atlas_hipaa_acknowledged: boolean | null;
  atlas_resume_url: string | null;
};

export type CompletenessItem = {
  key: string;
  label: string;
  points: number;
  ok: boolean;
  futureOnboarding?: boolean;
};

const nonEmpty = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function getCompletenessBreakdown(m: CompletenessSource): CompletenessItem[] {
  return [
    { key: "first_name", label: "First name", points: 5, ok: nonEmpty(m.first_name) },
    { key: "last_name", label: "Last name", points: 5, ok: nonEmpty(m.last_name) },
    { key: "email", label: "Email", points: 10, ok: nonEmpty(m.email) },
    { key: "phone", label: "Phone", points: 5, ok: nonEmpty(m.phone) },
    { key: "job_title", label: "Job title", points: 10, ok: nonEmpty(m.job_title) },
    { key: "avatar_url", label: "Avatar", points: 10, ok: nonEmpty(m.avatar_url) },
    {
      key: "skills",
      label: "Skills (3+)",
      points: 15,
      ok: Array.isArray(m.skills) && m.skills.filter(Boolean).length >= 3,
    },
    {
      key: "atlas_role",
      label: "Role",
      points: 10,
      ok: !!m.atlas_role && m.atlas_role !== "unassigned",
    },
    {
      key: "atlas_invite_status",
      label: "Active on ATLAS",
      points: 10,
      ok: m.atlas_invite_status === "active",
    },
    {
      key: "hipaa",
      label: "HIPAA Acknowledged",
      points: 10,
      ok: m.atlas_hipaa_acknowledged === true,
      futureOnboarding: true,
    },
    {
      key: "resume",
      label: "Resume",
      points: 10,
      ok: nonEmpty(m.atlas_resume_url),
      futureOnboarding: true,
    },
  ];
}

export function calcCompletenessScore(m: CompletenessSource): number {
  const total = getCompletenessBreakdown(m).reduce((s, it) => s + (it.ok ? it.points : 0), 0);
  return Math.max(0, Math.min(100, total));
}

export type CompletenessBand = {
  band: "incomplete" | "partial" | "nearly" | "complete";
  label: string;
  /** Tailwind class targeting the inner `<div>` of shadcn Progress. */
  barClass: string;
};

export function getCompletenessBand(pct: number): CompletenessBand {
  if (pct >= 100)
    return { band: "complete", label: "Complete", barClass: "[&>div]:bg-emerald-500" };
  if (pct >= 76)
    return { band: "nearly", label: "Nearly Complete", barClass: "[&>div]:bg-blue-500" };
  if (pct >= 41)
    return { band: "partial", label: "Partial", barClass: "[&>div]:bg-amber-500" };
  return { band: "incomplete", label: "Incomplete", barClass: "[&>div]:bg-red-500" };
}

/** Compact tooltip line used in the roster row. */
export function formatBreakdownTooltip(items: CompletenessItem[]): string {
  return items
    .map((i) => `${i.ok ? "✓" : "✗"} ${shortLabel(i.key)}`)
    .join(" · ");
}

function shortLabel(key: string): string {
  switch (key) {
    case "first_name":
      return "First";
    case "last_name":
      return "Last";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "job_title":
      return "Job Title";
    case "avatar_url":
      return "Avatar";
    case "skills":
      return "Skills";
    case "atlas_role":
      return "Role";
    case "atlas_invite_status":
      return "Active";
    case "hipaa":
      return "HIPAA";
    case "resume":
      return "Resume";
    default:
      return key;
  }
}
