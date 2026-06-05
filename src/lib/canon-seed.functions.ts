// Seed a starter pack into intelligence_canon (the table IRIS reads).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SeedRow = {
  topic: string;
  category: string;
  citation?: string;
  content: string;
  source_url?: string | null;
  tags?: string[];
  priority?: number;
};

const STARTER: SeedRow[] = [
  // --- Writing Standards ---
  {
    topic: "Person-First Language",
    category: "Writing Standards",
    content:
      "Always use person-first language. Say 'people with disabilities,' not 'the disabled.' Say 'members enrolled in Medicaid,' not 'Medicaid recipients.' Say 'people experiencing homelessness,' not 'the homeless.' Never use 'consumer' for Medicaid members — use 'member' or 'enrollee.'",
    tags: ["voice", "style", "language"],
    priority: 1,
  },
  {
    topic: "Athena Voice & Tone",
    category: "Writing Standards",
    content:
      "Confident, specific, evidence-based. No marketing fluff. Every claim ties to a number, a citation, or operational specifics. Prefer active voice and concrete verbs. Replace 'leverage,' 'robust,' 'innovative,' 'best-in-class,' and 'solutions' with specific operational language.",
    tags: ["voice", "style"],
    priority: 1,
  },
  {
    topic: "Quantify Everything",
    category: "Writing Standards",
    content:
      "Replace adjectives with numbers wherever possible. Not 'extensive experience' → '14 years operating Medicaid MLTSS in 6 states covering 412,000 members.' Not 'rapid response' → '95% of urgent service authorizations resolved within 24 hours.'",
    tags: ["voice", "evidence"],
    priority: 2,
  },

  // --- Federal Statutes ---
  {
    topic: "Social Security Act §1932 — Managed Care",
    category: "Federal Statutes",
    citation: "42 U.S.C. §1396u-2",
    content:
      "Section 1932 of the Social Security Act establishes states' authority to require Medicaid managed care enrollment without a waiver, sets MCO contract requirements, enrollment/disenrollment protections, quality assurance standards, and grievance/appeals rights.",
    source_url: "https://www.ssa.gov/OP_Home/ssact/title19/1932.htm",
    tags: ["managed-care", "statute"],
    priority: 3,
  },
  {
    topic: "Social Security Act §1915(b) & §1915(c) Waivers",
    category: "Federal Statutes",
    citation: "42 U.S.C. §1396n",
    content:
      "§1915(b) authorizes managed care/freedom-of-choice waivers. §1915(c) authorizes Home and Community-Based Services (HCBS) waivers for populations who would otherwise require institutional care. Combined 1915(b)(c) waivers are the most common LTSS authority.",
    tags: ["waiver", "HCBS", "LTSS"],
    priority: 3,
  },

  // --- Federal Regulations ---
  {
    topic: "Medicaid Managed Care Rule — 42 CFR Part 438",
    category: "Federal Regulations",
    citation: "42 CFR §438",
    content:
      "Governs Medicaid managed care: network adequacy (§438.68), access standards (§438.206), MLR (§438.8), quality strategy (§438.340), beneficiary protections (§438.100), grievance/appeals (§438.400 series), and program integrity (§438.608).",
    source_url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-438",
    tags: ["managed-care", "regulation", "compliance"],
    priority: 2,
  },
  {
    topic: "HCBS Settings Rule",
    category: "Federal Regulations",
    citation: "42 CFR §441.301(c)(4)-(5)",
    content:
      "Requires HCBS settings be integrated in the community, provide privacy, choice of services and providers, control of personal resources, and freedom from coercion. Settings presumed institutional (e.g., on hospital grounds, gated communities) require heightened scrutiny.",
    tags: ["HCBS", "LTSS", "regulation"],
    priority: 3,
  },
  {
    topic: "Mental Health Parity — 42 CFR §438.910",
    category: "Federal Regulations",
    citation: "42 CFR §438.900-920",
    content:
      "MCOs must apply parity in financial requirements, treatment limitations, and NQTLs between behavioral health and medical/surgical benefits. States must perform parity analyses and MCOs must document parity compliance for any benefit limit.",
    tags: ["behavioral-health", "parity", "compliance"],
    priority: 3,
  },

  // --- CMS Guidance ---
  {
    topic: "CMS Medicaid Managed Care Network Adequacy Toolkit",
    category: "CMS Guidance",
    content:
      "CMS expects time/distance, appointment wait time, provider-to-enrollee ratio, and telehealth components. Network adequacy standards must be enforced through annual validation and quarterly monitoring with corrective action plans.",
    source_url: "https://www.medicaid.gov/medicaid/managed-care/guidance/index.html",
    tags: ["network-adequacy", "guidance"],
    priority: 4,
  },
  {
    topic: "CMS Access Rule (April 2024)",
    category: "CMS Guidance",
    citation: "CMS-2442-F",
    content:
      "Strengthens access transparency: requires public reporting of wait times, secret shopper surveys, payment rate transparency for HCBS, and 80/20 HCBS direct care worker compensation requirement (phased over 6 years).",
    source_url: "https://www.cms.gov/newsroom/fact-sheets/medicaid-access-rule-final",
    tags: ["access", "HCBS", "guidance"],
    priority: 3,
  },

  // --- Athena Methodologies ---
  {
    topic: "Athena Implementation Methodology",
    category: "Athena Methodologies",
    content:
      "Three phases: (1) Foundation — readiness assessment, system configuration, staff hiring/training, network contracting; (2) Validation — operational readiness review, mock claims/auths/calls, parallel testing, CMS/state readiness review; (3) Launch — phased go-live, daily war room, weekly state checkpoints, 90-day stabilization. Default timeline: 9–14 months from award.",
    tags: ["implementation", "methodology"],
    priority: 4,
  },
  {
    topic: "Athena Care Management Model",
    category: "Athena Methodologies",
    content:
      "Tiered acuity model: high-risk (3+ chronic conditions, recent inpatient, complex psychosocial) gets in-person comprehensive assessment + intensive care coordination; moderate-risk gets telephonic; low-risk gets self-management support. Caseload ratios: 1:50 high, 1:150 moderate, 1:400 low. All members get a named care manager and a written person-centered plan within 30 days of enrollment.",
    tags: ["care-management", "methodology"],
    priority: 4,
  },

  // --- Athena Playbooks ---
  {
    topic: "Win Theme: Operator, Not Vendor",
    category: "Athena Playbooks",
    content:
      "We don't sell a platform — we operate the program. Every commitment is something Athena owns and is accountable for. Avoid language that distances Athena from execution ('our partners will,' 'the state will'). Prefer 'Athena will,' 'our team will,' 'we are accountable for.'",
    tags: ["win-theme", "voice"],
    priority: 2,
  },
  {
    topic: "Win Theme: Lived Experience at the Table",
    category: "Athena Playbooks",
    content:
      "Member and family voice is built into governance, not bolted on. Cite the Member Advisory Council with voting authority on benefit design changes, the lived-experience hiring requirement for Care Connectors (50% of frontline care coordination staff), and the quarterly Listening Sessions with quotable outputs.",
    tags: ["win-theme", "member-voice"],
    priority: 2,
  },
];

export const seedStarterCanon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Confirm admin (RLS would block anyway — return clean error)
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Only admins can seed the Canon.");

    // Skip topics that already exist (idempotent)
    const topics = STARTER.map((s) => s.topic);
    const { data: existing } = await supabase
      .from("intelligence_canon")
      .select("topic")
      .in("topic", topics);
    const have = new Set((existing ?? []).map((r: any) => r.topic));
    const toInsert = STARTER.filter((s) => !have.has(s.topic)).map((s) => ({
      ...s,
      source_url: s.source_url ?? null,
      tags: s.tags ?? [],
      priority: s.priority ?? 5,
      is_active: true,
      created_by: userId,
    }));

    if (toInsert.length === 0) {
      return { inserted: 0, skipped: STARTER.length };
    }

    const { error } = await supabase.from("intelligence_canon").insert(toInsert);
    if (error) throw new Error(error.message);
    return { inserted: toInsert.length, skipped: STARTER.length - toInsert.length };
  });
