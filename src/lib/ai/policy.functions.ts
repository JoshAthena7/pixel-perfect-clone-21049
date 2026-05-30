import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const PROGRAM_AREAS = [
  "Care Management",
  "Behavioral Health",
  "LTSS",
  "HCBS",
  "Network Adequacy",
  "Quality",
  "Staffing",
  "IT Systems",
  "Operations",
  "Implementation",
  "Transition",
] as const;

export const POLICY_SOURCES = [
  "CMS",
  "Federal Register",
  "State Medicaid Agency",
  "MACPAC",
  "KFF",
  "State Legislature",
  "CMS Informational Bulletin",
  "Other",
] as const;

export const POLICY_TYPES = [
  "New Rule",
  "Guidance",
  "Informational Bulletin",
  "Legislative",
  "State Rule",
  "Regulatory Update",
  "Court Decision",
] as const;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function areasOverlap(a: string[] | null, b: string[] | null): boolean {
  if (!a?.length || !b?.length) return false;
  const aSet = new Set(a.map(normalize));
  return b.some((x) => aSet.has(normalize(x)));
}

/**
 * Auto-map a single policy to all engagements whose state matches relevant_states
 * and whose heatmap sections overlap with relevant_program_areas. Then optionally
 * generate writing implications via AI.
 */
export const mapPolicyToEngagements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        policyId: z.string().uuid(),
        engagementIds: z.array(z.string().uuid()).optional(),
        generateImplications: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: policy, error: pErr } = await supabase
      .from("policy_intelligence")
      .select("*")
      .eq("id", data.policyId)
      .maybeSingle();
    if (pErr || !policy) throw new Error(pErr?.message ?? "Policy not found");

    // Engagements to consider
    let engQ = supabase.from("engagements").select("id, state");
    if (data.engagementIds?.length) engQ = engQ.in("id", data.engagementIds);
    const { data: engagements } = await engQ;
    if (!engagements?.length) return { ok: true, mappings_created: 0 };

    const relevantStates = (policy.relevant_states ?? []).map((s: string) => s.toUpperCase().trim());
    const eligible = (engagements as any[]).filter((e) => {
      if (!relevantStates.length) return true;
      return e.state && relevantStates.includes(String(e.state).toUpperCase().trim());
    });
    if (eligible.length === 0) return { ok: true, mappings_created: 0 };

    const engIds = eligible.map((e) => e.id);
    const { data: sections } = await supabase
      .from("heatmap_sections")
      .select("id, engagement_id, section_name")
      .in("engagement_id", engIds);

    type Row = {
      policy_id: string;
      engagement_id: string;
      section_id: string | null;
      question_id: string | null;
      ai_generated: boolean;
      confirmed: boolean;
      writing_implication: string | null;
    };
    const toInsert: Row[] = [];
    const flagQuestionIds = new Set<string>();

    for (const sec of (sections as any[]) ?? []) {
      if (!areasOverlap(policy.relevant_program_areas, [sec.section_name])) continue;
      toInsert.push({
        policy_id: policy.id,
        engagement_id: sec.engagement_id,
        section_id: sec.id,
        question_id: null,
        ai_generated: true,
        confirmed: false,
        writing_implication: null,
      });

      // also link to the questions inside that section + flag them
      const { data: qs } = await supabase
        .from("rfp_questions")
        .select("id")
        .eq("section_id", sec.id);
      for (const q of (qs as any[]) ?? []) {
        toInsert.push({
          policy_id: policy.id,
          engagement_id: sec.engagement_id,
          section_id: sec.id,
          question_id: q.id,
          ai_generated: true,
          confirmed: false,
          writing_implication: null,
        });
        flagQuestionIds.add(q.id);
      }
    }

    // Dedupe against existing
    const { data: existing } = await supabase
      .from("policy_section_mappings")
      .select("engagement_id, section_id, question_id")
      .eq("policy_id", policy.id);
    const existingKey = new Set(
      ((existing as any[]) ?? []).map(
        (r) => `${r.engagement_id}:${r.section_id ?? "-"}:${r.question_id ?? "-"}`,
      ),
    );
    const fresh = toInsert.filter(
      (r) => !existingKey.has(`${r.engagement_id}:${r.section_id ?? "-"}:${r.question_id ?? "-"}`),
    );

    if (fresh.length) {
      const { error } = await supabase.from("policy_section_mappings").insert(fresh);
      if (error) throw new Error(error.message);
    }

    if (flagQuestionIds.size) {
      await supabase
        .from("rfp_questions")
        .update({ policy_flagged: true })
        .in("id", Array.from(flagQuestionIds));
    }

    return { ok: true, mappings_created: fresh.length, questions_flagged: flagQuestionIds.size };
  });

/**
 * Generate writing_implication text for mappings missing one.
 */
export const generatePolicyImplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        engagementId: z.string().uuid(),
        policyId: z.string().uuid().optional(),
        onlyMissing: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    let q = supabase
      .from("policy_section_mappings")
      .select(
        "id, writing_implication, policy_id, section_id, question_id, policy_intelligence!inner(title, summary, policy_type, source), heatmap_sections(section_name), rfp_questions(question_number, title, body)",
      )
      .eq("engagement_id", data.engagementId);
    if (data.policyId) q = q.eq("policy_id", data.policyId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const targets = ((rows as any[]) ?? []).filter(
      (r) => !data.onlyMissing || !r.writing_implication,
    );
    if (targets.length === 0) return { ok: true, updated: 0 };

    let updated = 0;
    for (const r of targets) {
      const policy = r.policy_intelligence;
      const question = r.rfp_questions;
      const section = r.heatmap_sections;
      const target = question
        ? `RFP Question ${question.question_number ?? ""} — ${question.title ?? ""}\n${question.body ?? ""}`.slice(0, 2500)
        : section
          ? `Section: ${section.section_name}`
          : "this proposal section";

      const sys =
        'You write one specific, concrete sentence telling a proposal writer what to do differently because of a recent policy update. Output STRICT JSON: {"implication": string}. Name the specific action, cite a number, or quote language the writer should include. No fluff.';
      const user = `POLICY (${policy.source} · ${policy.policy_type}): ${policy.title}\n${policy.summary ?? ""}\n\nTARGET:\n${target}\n\nReturn JSON only.`;

      const res = await fetch(`${GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
        if (res.status === 402)
          throw new Error("AI credits exhausted — top up in Settings → Workspace.");
        continue;
      }
      const json = (await res.json()) as any;
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      let implication = "";
      try {
        implication = String(JSON.parse(raw).implication ?? "").trim();
      } catch {
        implication = "";
      }
      if (!implication) continue;

      const { error: upErr } = await supabase
        .from("policy_section_mappings")
        .update({ writing_implication: implication, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (!upErr) updated++;
    }
    return { ok: true, updated };
  });
