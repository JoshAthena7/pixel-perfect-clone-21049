import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

/**
 * IRIS Setup-Record Auto-Fill
 *
 * Runs a single AI pass over the mission's uploaded documents, briefing book,
 * Strategic Foundation, and kickoff intelligence to pre-fill the Setup Record.
 *
 * Idempotent: re-running without `force` returns the previously-cached
 * suggestion map without re-charging the AI gateway.
 *
 * Only fills fields that are currently empty. Never overwrites admin entries.
 */

const FIELD_KEYS = [
  "description",
  "client",
  "state_agency",
  "submission_date",
  "contract_value",
  "contract_term",
  "mission_highlights",
  "client_strengths",
  "client_win_strategy",
  "program_goals",
  "key_requirements",
  "incumbent_name",
  "evaluation_criteria",
  "win_themes",
  "geographic_scope",
  "population_served",
] as const;

export type AutofillFieldKey = (typeof FIELD_KEYS)[number];

export type SuggestedField = {
  value: string | string[] | null;
  source: string;
  generated_at: string;
};

export type SuggestedFieldsMap = Partial<Record<AutofillFieldKey, SuggestedField>>;

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: ["string", "null"] },
    client: { type: ["string", "null"] },
    state_agency: { type: ["string", "null"] },
    submission_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD if found" },
    contract_value: { type: ["string", "null"] },
    contract_term: { type: ["string", "null"] },
    mission_highlights: { type: ["string", "null"] },
    client_strengths: { type: ["string", "null"] },
    client_win_strategy: { type: ["string", "null"] },
    program_goals: { type: ["string", "null"] },
    key_requirements: { type: "array", items: { type: "string" } },
    incumbent_name: { type: ["string", "null"] },
    evaluation_criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          points: { type: ["number", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["category"],
      },
    },
    win_themes: { type: "array", items: { type: "string" } },
    geographic_scope: { type: ["string", "null"] },
    population_served: { type: ["string", "null"] },
  },
  required: [],
} as const;

async function callAutofillModel(system: string, user: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "setup_autofill", schema: SUGGESTION_SCHEMA },
        },
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PER_DOC = 6000;
const TOTAL_CAP = 45000;

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function nonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

export const irisPopulateSetupRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId, force } = data;

    const { data: mission, error: missionErr } = await supabase
      .from("missions")
      .select("*")
      .eq("id", missionId)
      .maybeSingle();
    if (missionErr) throw new Error(missionErr.message);
    if (!mission) throw new Error("Mission not found");

    // Idempotent short-circuit
    if (
      !force &&
      mission.iris_setup_autofill_status &&
      mission.iris_setup_suggested_fields &&
      Object.keys(mission.iris_setup_suggested_fields).length > 0
    ) {
      return {
        status: mission.iris_setup_autofill_status as string,
        suggestedFields: mission.iris_setup_suggested_fields as SuggestedFieldsMap,
        written: 0,
        skipped: 0,
        cached: true,
      };
    }

    // Parallel reads of all source layers
    const [vault, briefingBook, clientIntel, evalRows] = await Promise.all([
      supabase
        .from("document_extractions")
        .select("extracted_text,summary,mission_library!inner(name,category,mission_id)")
        .eq("mission_id", missionId)
        .eq("status", "ready")
        .limit(10),
      supabase
        .from("briefing_book_sections")
        .select("section_key,content")
        .eq("mission_id", missionId)
        .limit(20),
      supabase.from("mission_client_intel").select("*").eq("mission_id", missionId).maybeSingle(),
      supabase
        .from("mission_evaluation_criteria")
        .select("id")
        .eq("mission_id", missionId)
        .limit(1),
    ]);

    // Compose source text
    let totalLen = 0;
    const parts: string[] = [];
    for (const r of (vault.data ?? []) as Array<{
      extracted_text: string | null;
      summary: string | null;
      mission_library: { name: string; category: string | null } | null;
    }>) {
      const name = r.mission_library?.name ?? "Document";
      const body = (r.extracted_text ?? r.summary ?? "").slice(0, PER_DOC);
      if (!body.trim()) continue;
      const chunk = `### ${name}\n${body}`;
      if (totalLen + chunk.length > TOTAL_CAP) break;
      parts.push(chunk);
      totalLen += chunk.length;
    }
    const rfpText = parts.join("\n\n---\n\n");

    const briefingText = (briefingBook.data ?? [])
      .map((s) => `## ${s.section_key}\n${(s.content ?? "").slice(0, 3000)}`)
      .join("\n\n")
      .slice(0, 15000);

    const system =
      "You are IRIS, the strategic intelligence engine for a proposal command center. " +
      "Your job is to read the RFP, uploaded knowledge documents, and prior IRIS output, " +
      "then pre-fill a Mission Setup Record. " +
      "Ground every field in the source material. NEVER invent facts. " +
      "If a field cannot be confidently inferred, return null (or omit array items). " +
      "Use the existing values shown as the source of truth — only suggest fields where the existing value is empty. " +
      "Match the JSON schema exactly.";

    const existing = [
      `Mission Name: ${mission.name ?? ""}`,
      `Client: ${mission.client ?? ""}`,
      `State Agency: ${mission.state_agency ?? ""}`,
      `Submission Date: ${mission.submission_date ?? ""}`,
      `Contract Value: ${mission.contract_value ?? ""}`,
      `Contract Term: ${mission.contract_term ?? ""}`,
      `Incumbent: ${mission.incumbent_name ?? ""}`,
      `Mission Highlights: ${mission.mission_highlights ?? "(empty)"}`,
      `Client Strengths: ${mission.client_strengths ?? "(empty)"}`,
      `Win Strategy: ${mission.client_win_strategy ?? "(empty)"}`,
      `Program Goals: ${mission.program_goals ?? "(empty)"}`,
      `Key Requirements: ${(mission.key_requirements ?? []).join("; ") || "(empty)"}`,
      `Win Themes: ${(mission.win_themes ?? []).join("; ") || "(empty)"}`,
    ].join("\n");

    const userMsg = [
      "# Existing Mission Record",
      existing,
      "",
      "# IRIS Briefing Book (prior IRIS output)",
      briefingText || "(none generated yet)",
      "",
      "# RFP and Knowledge Documents",
      rfpText || "(no extracted text)",
      "",
      "# Task",
      "Return a JSON object with one entry per Setup Record field you can confidently infer.",
      "Prose fields (mission_highlights, client_strengths, client_win_strategy, program_goals): 3–5 sentences each, grounded in the source.",
      "key_requirements: 6–12 short imperative bullets capturing non-negotiable contract requirements.",
      "evaluation_criteria: extract from the RFP's Evaluation / Selection / Scoring section if present.",
      "win_themes: 3–6 short phrases the proposal should reinforce.",
      "geographic_scope and population_served: short phrases (e.g., 'New Jersey, all 21 counties', 'youth ages 14–24').",
      "Submission date: ISO YYYY-MM-DD if explicitly stated. Otherwise null.",
      "Return null for any field you cannot ground in the source.",
    ].join("\n");

    const generated = await callAutofillModel(system, userMsg);
    if (!generated) {
      await supabase
        .from("missions")
        .update({ iris_setup_autofill_status: "pending", iris_setup_autofill_at: new Date().toISOString() })
        .eq("id", missionId);
      return { status: "pending", suggestedFields: {} as SuggestedFieldsMap, written: 0, skipped: 0, cached: false };
    }

    const now = new Date().toISOString();
    const suggestionMap: SuggestedFieldsMap = {};
    const missionPatch: Record<string, unknown> = {};
    let written = 0;
    let skipped = 0;

    // mission-row fields (string / array)
    const stringFields: Array<{ key: AutofillFieldKey; col: string; current: unknown }> = [
      { key: "description", col: "description", current: mission.description },
      { key: "client", col: "client", current: mission.client },
      { key: "state_agency", col: "state_agency", current: mission.state_agency },
      { key: "submission_date", col: "submission_date", current: mission.submission_date },
      { key: "contract_value", col: "contract_value", current: mission.contract_value },
      { key: "contract_term", col: "contract_term", current: mission.contract_term },
      { key: "mission_highlights", col: "mission_highlights", current: mission.mission_highlights },
      { key: "client_strengths", col: "client_strengths", current: mission.client_strengths },
      { key: "client_win_strategy", col: "client_win_strategy", current: mission.client_win_strategy },
      { key: "program_goals", col: "program_goals", current: mission.program_goals },
      { key: "incumbent_name", col: "incumbent_name", current: mission.incumbent_name },
    ];

    for (const f of stringFields) {
      const v = generated[f.key];
      if (!nonEmptyString(v)) continue;
      suggestionMap[f.key] = { value: v, source: "IRIS", generated_at: now };
      if (!nonEmptyString(f.current)) {
        missionPatch[f.col] = v;
        written++;
      } else {
        skipped++;
      }
    }

    // array fields
    const arrayFields: Array<{ key: AutofillFieldKey; col: string; current: unknown }> = [
      { key: "key_requirements", col: "key_requirements", current: mission.key_requirements },
      { key: "win_themes", col: "win_themes", current: mission.win_themes },
    ];
    for (const f of arrayFields) {
      const v = generated[f.key];
      if (!nonEmptyArray(v)) continue;
      const items = v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 20);
      if (items.length === 0) continue;
      suggestionMap[f.key] = { value: items, source: "IRIS", generated_at: now };
      const currentArr = Array.isArray(f.current) ? (f.current as unknown[]) : [];
      if (currentArr.length === 0) {
        missionPatch[f.col] = items;
        written++;
      } else {
        skipped++;
      }
    }

    // Non-column suggestions tracked for UI hints only
    for (const k of ["geographic_scope", "population_served"] as const) {
      const v = generated[k];
      if (nonEmptyString(v)) {
        suggestionMap[k] = { value: v, source: "IRIS", generated_at: now };
      }
    }

    // mission_evaluation_criteria — only insert if none exist
    const evalSuggested = generated.evaluation_criteria;
    if (nonEmptyArray(evalSuggested)) {
      const items = (evalSuggested as Array<{ category?: unknown; points?: unknown; notes?: unknown }>)
        .map((e, idx) => ({
          mission_id: missionId,
          category: String(e.category ?? "").trim(),
          points: typeof e.points === "number" ? Math.round(e.points) : 0,
          display_order: idx,
        }))
        .filter((e) => e.category.length > 0);
      suggestionMap.evaluation_criteria = {
        value: items.map((e) => e.category),
        source: "IRIS",
        generated_at: now,
      };
      if (items.length > 0 && (evalRows.data ?? []).length === 0) {
        await supabase.from("mission_evaluation_criteria").insert(items);
        written++;
      } else if (items.length > 0) {
        skipped++;
      }
    }

    missionPatch.iris_setup_autofill_status = "suggested";
    missionPatch.iris_setup_autofill_at = now;
    missionPatch.iris_setup_suggested_fields = suggestionMap;

    const { error: updErr } = await supabase
      .from("missions")
      .update(missionPatch as never)
      .eq("id", missionId);
    if (updErr) throw new Error(updErr.message);

    // Ensure a client_intel row exists so the form section renders
    if (!clientIntel.data) {
      await supabase.from("mission_client_intel").insert({ mission_id: missionId, created_by_system: true });
    }

    return { status: "suggested", suggestedFields: suggestionMap, written, skipped, cached: false };
  });

export const approveIrisSetupSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("missions")
      .update({ iris_setup_autofill_status: "approved" })
      .eq("id", data.missionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissIrisSetupSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("missions")
      .update({ iris_setup_autofill_status: "reviewing" })
      .eq("id", data.missionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
