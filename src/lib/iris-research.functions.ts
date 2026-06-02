// IRIS Research Executor — Phase 3.
// Picks pending research_tasks for a mission and runs them through
// Perplexity (sonar-pro) with full mission DNA context so the answers
// are laser-focused on THIS procurement — not generic Medicaid coverage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MissionDna } from "./iris-dna.functions";

type PerplexitySource = { title?: string; url: string };

type PerplexityAnswer = {
  answer: string;
  sources: PerplexitySource[];
  confidence: "high" | "medium" | "low";
  follow_up_questions: string[];
};

function buildSystemPrompt(dna: MissionDna): string {
  const id = dna.mission_identity ?? ({} as MissionDna["mission_identity"]);
  const focus = dna.focus_areas?.primary_focus_areas ?? [];
  const populations = dna.population_profile?.populations ?? [];
  const lines = [
    `You are IRIS — the proposal intelligence engine for Atlas, by Athena Strategy Group.`,
    `You are researching ONE specific procurement. Stay laser-focused on it. Do NOT return generic Medicaid background.`,
    ``,
    `PROCUREMENT CONTEXT (use this to scope every answer):`,
    `- State: ${id.state ?? "unknown"}`,
    `- Agency: ${id.state_agency ?? "unknown"}`,
    `- Program: ${id.program_type ?? id.procurement_name ?? "unknown"}`,
    `- RFP #: ${id.rfp_number ?? "n/a"}`,
    `- Incumbent: ${id.incumbent ?? "unknown"}`,
    `- Primary focus areas: ${focus.join(", ") || "—"}`,
    `- Populations served: ${populations.slice(0, 6).join(", ") || "—"}`,
    ``,
    `RULES:`,
    `1. Prefer state-specific, agency-specific, and recent (last 24 months) sources.`,
    `2. If the question is about federal context, only return what materially affects THIS state and program.`,
    `3. Be concrete: cite programs, dollar figures, dates, performance metrics, named officials.`,
    `4. If you cannot find authoritative information, say so plainly. Do not invent.`,
    `5. Always return STRICT JSON matching the schema. No prose outside JSON. No markdown fences.`,
    ``,
    `OUTPUT SCHEMA:`,
    `{`,
    `  "answer": "3-6 paragraphs of dense, specific intelligence written for a senior proposal strategist",`,
    `  "sources": [{"title": "...", "url": "https://..."}],`,
    `  "confidence": "high" | "medium" | "low",`,
    `  "follow_up_questions": ["...", "..."]`,
    `}`,
  ];
  return lines.join("\n");
}

function buildUserPrompt(question: string, whyItMatters: string | null, sections: string[]): string {
  const parts = [`RESEARCH QUESTION:\n${question}`];
  if (whyItMatters) parts.push(`\nWHY IT MATTERS:\n${whyItMatters}`);
  if (sections && sections.length) parts.push(`\nRELEVANT RFP SECTIONS:\n${sections.join("; ")}`);
  parts.push(`\nReturn the JSON object now.`);
  return parts.join("\n");
}

async function callPerplexity(
  system: string,
  user: string,
): Promise<PerplexityAnswer> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("PERPLEXITY_API_KEY is not configured");

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      search_recency_filter: "year",
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perplexity ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    citations?: string[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  let parsed: Partial<PerplexityAnswer> = {};
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      parsed = { answer: cleaned };
    }
  } else {
    parsed = { answer: cleaned };
  }

  // Merge in Perplexity citations if model didn't include sources
  let sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  if (sources.length === 0 && Array.isArray(json.citations)) {
    sources = json.citations.map((url) => ({ url }));
  }

  const confidence = ["high", "medium", "low"].includes(String(parsed.confidence))
    ? (parsed.confidence as PerplexityAnswer["confidence"])
    : "medium";

  return {
    answer: String(parsed.answer ?? "").slice(0, 12_000),
    sources: sources.slice(0, 20),
    confidence,
    follow_up_questions: Array.isArray(parsed.follow_up_questions)
      ? parsed.follow_up_questions.slice(0, 8).map(String)
      : [],
  };
}

// ─── INPUTS ───────────────────────────────────────────────────────────────
const RunMissionInput = z.object({
  missionId: z.string().uuid(),
  limit: z.number().int().min(1).max(40).optional(),
});

const RunTaskInput = z.object({ taskId: z.string().uuid() });

// ─── HELPERS (exported for cron / refresh route) ──────────────────────────
export { buildSystemPrompt, buildUserPrompt, callPerplexity };
export async function runOneTask(
  supabase: any,
  task: {
    id: string;
    mission_id: string;
    question: string;
    why_it_matters: string | null;
    relevant_rfp_sections: string[] | null;
  },
  dna: MissionDna,
): Promise<{ ok: boolean; error?: string }> {

  // Mark in_progress
  await (supabase as any)
    .from("research_tasks")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", task.id);

  try {
    const system = buildSystemPrompt(dna);
    const user = buildUserPrompt(
      task.question,
      task.why_it_matters,
      Array.isArray(task.relevant_rfp_sections) ? task.relevant_rfp_sections : [],
    );
    const out = await callPerplexity(system, user);

    const { error: insErr } = await (supabase as any).from("research_results").insert({
      task_id: task.id,
      mission_id: task.mission_id,
      answer: out.answer || "(no answer returned)",
      sources: out.sources as unknown as object,
      confidence: out.confidence,
      follow_up_questions: out.follow_up_questions,
    });
    if (insErr) throw new Error(insErr.message);

    await (supabase as any)
      .from("research_tasks")
      .update({ status: "complete", updated_at: new Date().toISOString() })
      .eq("id", task.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await (supabase as any)
      .from("research_tasks")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", task.id);
    return { ok: false, error: msg };
  }
}

// ─── SERVER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Execute pending research tasks for a mission via Perplexity.
 * Runs sequentially (Perplexity rate-friendly) and stops at `limit`.
 */
export const executeResearchAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RunMissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // 1. Load current DNA
    const { data: dnaRow } = await supabase
      .from("mission_intelligence_dna")
      .select("dna")
      .eq("mission_id", data.missionId)
      .eq("is_current", true)
      .maybeSingle();
    if (!dnaRow) throw new Error("No intelligence DNA found — generate it first");
    const dna = dnaRow.dna as unknown as MissionDna;

    // 2. Pick pending tasks (high priority first)
    const limit = data.limit ?? 12;
    const { data: pending } = await supabase
      .from("research_tasks")
      .select("id, mission_id, question, why_it_matters, relevant_rfp_sections, priority")
      .eq("mission_id", data.missionId)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    const tasks = pending ?? [];
    if (tasks.length === 0) return { executed: 0, succeeded: 0, failed: 0 };

    let succeeded = 0;
    let failed = 0;
    for (const t of tasks) {
      const r = await runOneTask(supabase, t as any, dna);
      if (r.ok) succeeded++;
      else failed++;
      // small delay to be polite to Perplexity
      await new Promise((res) => setTimeout(res, 600));
    }

    await supabase.from("olympus_audit_log").insert({
      mission_id: data.missionId,
      user_id: userId,
      action_type: "iris_research_executed",
      action_summary: `IRIS executed ${tasks.length} research task(s) — ${succeeded} succeeded, ${failed} failed`,
      target_table: "research_tasks",
    });

    return { executed: tasks.length, succeeded, failed };
  });

/** Run a single research task (manual retry). */
export const executeResearchTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RunTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: task } = await supabase
      .from("research_tasks")
      .select("id, mission_id, question, why_it_matters, relevant_rfp_sections")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task) throw new Error("Task not found");

    const { data: dnaRow } = await supabase
      .from("mission_intelligence_dna")
      .select("dna")
      .eq("mission_id", task.mission_id)
      .eq("is_current", true)
      .maybeSingle();
    if (!dnaRow) throw new Error("No DNA — generate intelligence DNA first");

    const result = await runOneTask(supabase, task as any, dnaRow.dna as unknown as MissionDna);
    if (!result.ok) throw new Error(result.error ?? "Research failed");
    return { ok: true };
  });
