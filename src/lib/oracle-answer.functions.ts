/**
 * ORACLE — generateOracleAnswer
 *
 * The single answer engine for AtlasAssist, WritersBlock, and the Briefing
 * page. Pulls the canonical mission intelligence (proof points, risks, win
 * themes, top graph nodes, evaluator priorities, optional question context),
 * calls the AI with a tight grounding prompt, and persists the result in
 * iris_answers for traceability + future user feedback.
 *
 * Inputs
 *   mission_id   — required
 *   prompt       — the user/system question (e.g. "What proof points support
 *                  member engagement for question 3.14?")
 *   prompt_type  — atlas_assist | writers_block | brief | manual
 *   question_id  — optional, scopes context to that question
 *
 * Output: { answer, confidence, sources_used, answer_id }
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  prompt: z.string().trim().min(3).max(8_000),
  prompt_type: z.enum(["atlas_assist", "writers_block", "brief", "manual"]).default("manual"),
  question_id: z.string().uuid().optional(),
});

const SYSTEM = `You are ORACLE, the mission intelligence engine for Athena Strategy Group's state Medicaid procurement work. You answer using ONLY the grounded mission context provided. Return ONLY valid JSON, no preamble, no markdown fences.

{
  "answer": "string — the direct answer, plain prose, no headings unless the question asks for structure",
  "confidence": "high|medium|low",
  "sources_used": ["string — short label of each context block you actually used, e.g. 'proof_point:42', 'graph_node:Centene', 'risk:RFP scoring change'"],
  "gaps": ["string — what's missing from context that would have made the answer stronger (or empty array)"]
}

Rules:
- Ground every claim in the provided context. If the context does not support a claim, do not make it.
- If the context is insufficient, say so plainly in 'answer' and list what's missing in 'gaps'. Do NOT invent.
- Never fabricate client-specific performance data. Industry-level facts from research/policy sources are OK.
- Keep the answer focused — one or two paragraphs unless the question explicitly asks for more.`;

function tryParseJSON<T>(s: string): T | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

export type OracleAnswer = {
  answer: string;
  confidence: "high" | "medium" | "low";
  sources_used: string[];
  gaps: string[];
  answer_id: string | null;
};

export const generateOracleAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<OracleAnswer> => {
    const { supabase, userId } = context;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("ORACLE is not configured — built-in AI key missing.");

    // --- Assemble grounded context, in parallel ---
    const [
      missionRes,
      proofRes,
      riskRes,
      themesRes,
      nodesRes,
      questionRes,
    ] = await Promise.all([
      supabase.from("missions").select("id, name, client_name, agency_name").eq("id", data.mission_id).single(),
      supabase
        .from("mission_proof_points")
        .select("id, text, signal_authority, iris_confidence")
        .eq("mission_id", data.mission_id)
        .limit(40),
      supabase
        .from("mission_risks")
        .select("id, title, description, severity, status")
        .eq("mission_id", data.mission_id)
        .neq("status", "Closed")
        .limit(20),
      supabase
        .from("mission_win_themes")
        .select("id, theme, supporting_evidence")
        .eq("mission_id", data.mission_id)
        .limit(15),
      supabase
        .from("intelligence_graph_nodes")
        .select("id, label, node_type, description")
        .eq("mission_id", data.mission_id)
        .eq("is_active", true)
        .limit(60),
      data.question_id
        ? supabase
            .from("mission_questions")
            .select("id, question_number, question_text, word_limit, page_limit, evaluation_criteria, brief_notes")
            .eq("id", data.question_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const mission = missionRes.data;
    if (!mission) throw new Error("Mission not found or access denied.");

    const proofs = proofRes.data ?? [];
    const risks = riskRes.data ?? [];
    const themes = themesRes.data ?? [];
    const nodes = nodesRes.data ?? [];
    const q = (questionRes as { data: any }).data;

    const ctxParts: string[] = [];
    ctxParts.push(`Mission: ${mission.name} — Client: ${mission.client_name ?? "—"} — Agency: ${mission.agency_name ?? "—"}`);

    if (q) {
      ctxParts.push(
        `\n# Active Question\n${q.question_number ?? ""} ${q.question_text ?? ""}` +
        (q.word_limit ? `\nWord limit: ${q.word_limit}` : "") +
        (q.page_limit ? `\nPage limit: ${q.page_limit}` : "") +
        (q.evaluation_criteria ? `\nEvaluation criteria: ${q.evaluation_criteria}` : "") +
        (q.brief_notes ? `\nWriter notes: ${q.brief_notes}` : ""),
      );
    }

    if (proofs.length) {
      ctxParts.push("\n# Proof Points");
      for (const p of proofs) {
        ctxParts.push(`- proof_point:${p.id} [${p.signal_authority ?? "?"}] ${p.text}`);
      }
    }
    if (themes.length) {
      ctxParts.push("\n# Win Themes");
      for (const t of themes) {
        ctxParts.push(`- win_theme:${t.id} ${t.theme}${t.supporting_evidence ? ` — ${t.supporting_evidence}` : ""}`);
      }
    }
    if (risks.length) {
      ctxParts.push("\n# Open Risks");
      for (const r of risks) {
        ctxParts.push(`- risk:${r.id} [${r.severity}] ${r.title}${r.description ? ` — ${r.description}` : ""}`);
      }
    }
    if (nodes.length) {
      ctxParts.push("\n# Graph Intelligence");
      for (const n of nodes) {
        ctxParts.push(`- graph_node:${n.label} (${n.node_type})${n.description ? ` — ${n.description}` : ""}`);
      }
    }

    const grounded = ctxParts.join("\n");
    const truncated = grounded.length > 80_000 ? grounded.slice(0, 80_000) : grounded;

    const user = `${truncated}\n\n---\nUser prompt (${data.prompt_type}):\n${data.prompt}`;

    // --- Call AI ---
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 2500,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("ORACLE is rate limited. Try again shortly.");
    if (!res.ok) {
      console.error("[oracle-answer] gateway error", res.status, await res.text().catch(() => ""));
      throw new Error("ORACLE could not produce an answer right now.");
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";

    type Parsed = { answer?: string; confidence?: string; sources_used?: string[]; gaps?: string[] };
    const parsed = tryParseJSON<Parsed>(content) ?? {};
    const answer = (parsed.answer ?? "").trim() || "ORACLE could not produce a grounded answer from the available mission context.";
    const confidence: "high" | "medium" | "low" =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";
    const sources_used = Array.isArray(parsed.sources_used) ? parsed.sources_used.map(String).slice(0, 50) : [];
    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.map(String).slice(0, 20) : [];

    // --- Persist ---
    const { data: row } = await supabase
      .from("iris_answers")
      .insert({
        mission_id: data.mission_id,
        question_id: data.question_id ?? null,
        prompt_type: data.prompt_type,
        context_snapshot: {
          prompt: data.prompt,
          counts: {
            proof_points: proofs.length,
            risks: risks.length,
            win_themes: themes.length,
            graph_nodes: nodes.length,
            question_id: data.question_id ?? null,
          },
        },
        response_full: { answer, gaps, raw: parsed },
        sources_used,
        confidence_level: confidence,
        created_by: userId,
      })
      .select("id")
      .single();

    return {
      answer,
      confidence,
      sources_used,
      gaps,
      answer_id: row?.id ?? null,
    };
  });
