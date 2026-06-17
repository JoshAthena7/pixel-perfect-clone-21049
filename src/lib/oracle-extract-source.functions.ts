/**
 * ORACLE — extractSourceIntelligence
 *
 * Per-document-type extraction. Given a mission_document row, loads its text
 * (from mission_iris_extractions if previously parsed, or content_summary),
 * routes to the per-type prompt, and persists:
 *   - mission_proof_points
 *   - mission_risks
 *   - intelligence_graph_nodes (with source_document_id)
 *   - mission_iris_extractions (raw trace)
 *
 * The primary_rfp doc type is intentionally skipped — the existing
 * iris-process-rfp pipeline owns it (structure + questions).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  document_id: z.string().uuid(),
});

const DOC_TYPE_PROMPTS: Record<string, string> = {
  amendment: `This is an RFP AMENDMENT. Extract changes to scope, requirements, deadlines, scoring, or submission rules. New risks introduced by the change. New requirements that become proof points or win-theme opportunities.`,
  attachment: `This is an RFP ATTACHMENT (forms, exhibits, technical specs). Extract referenced standards, required certifications, mandatory data formats, integration touchpoints, and any compliance signals that become risks or proof-point requirements.`,
  scoring_criteria: `This is the SCORING/EVALUATION CRITERIA document. Extract evaluator priorities (what they reward), evaluation factors and weights, scoring thresholds, and any disqualifying criteria. Each priority becomes a win-theme signal. Each disqualifier becomes a risk.`,
  prior_qa: `This is a PRIOR Q&A or bidder-question document. Extract clarifications the state issued, areas of confusion (signal of evaluator priorities), and corrections to the base RFP. Each clarification is a graph node; each area of state concern is a risk or priority signal.`,
  research: `This is RESEARCH or third-party context (analyst report, state plan, EQRO, prior contract). Extract state priorities, performance benchmarks, competitive landscape facts, incumbent performance issues (risks), and quantitative evidence we can cite (proof points).`,
  media_url: `This is a MEDIA/NEWS item. Extract state-level developments, leadership changes, political signals, and public concerns that affect the procurement. Each item is a graph node; persistent concerns become risks.`,
  manual_note: `This is a MANUAL NOTE from a team member. Treat with high authority. Extract proof points, risks, competitive intel, and stakeholder insights exactly as stated.`,
  other: `This is an unclassified support document. Extract any proof points, risks, evaluator signals, or competitive intel relevant to a state Medicaid procurement response.`,
};

const SYSTEM = `You are ORACLE, the mission intelligence engine. Extract structured intelligence from the document. Return ONLY valid JSON, no preamble, no markdown fences.

{
  "proof_points": [{ "text": "string (a defensible claim, with the number if applicable)", "authority": "client_stated|public|inferred", "confidence": "high|medium|low" }],
  "risks": [{ "title": "string (<=120 chars)", "description": "string", "severity": "Low|Medium|High|Critical" }],
  "graph_nodes": [{ "node_type": "requirement|evaluator|stakeholder|policy|competitor|research|win_theme|risk|internal_knowledge", "label": "string (<=200 chars)", "description": "string", "confidence": "high|medium|low" }]
}

Rules:
- Be conservative. Do NOT invent facts. If nothing is extractable for a category, return an empty array.
- Each entry must be grounded in the document text provided.
- Prefer specificity (numbers, names, dates) over generalities.`;

type AIResult = {
  proof_points?: Array<{ text: string; authority?: string; confidence?: string }>;
  risks?: Array<{ title: string; description?: string; severity?: string }>;
  graph_nodes?: Array<{ node_type: string; label: string; description?: string; confidence?: string }>;
};

const NODE_TYPES = new Set([
  "requirement", "evaluator", "stakeholder", "policy",
  "competitor", "research", "win_theme", "risk", "internal_knowledge",
]);
const SEVERITY = new Set(["Low", "Medium", "High", "Critical"]);
const CONF = new Set(["high", "medium", "low"]);
const CONF_TO_NUM: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
const AUTH = new Set(["client_stated", "public", "inferred"]);

function tryParseJSON<T>(s: string): T | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

async function callAI(apiKey: string, user: string): Promise<string | null> {
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 3000,
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
    console.error("[oracle-extract] gateway error", res.status, await res.text().catch(() => ""));
    return null;
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? null;
}

export type ExtractResult = {
  ok: boolean;
  skipped?: string;
  document_type: string;
  counts: { proof_points: number; risks: number; graph_nodes: number };
};

export const extractSourceIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ExtractResult> => {
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("mission_documents")
      .select("id, mission_id, document_type, title, content_summary, file_url")
      .eq("id", data.document_id)
      .single();
    if (docErr || !doc) throw new Error("Document not found or access denied.");
    if (doc.mission_id !== data.mission_id) throw new Error("Document/mission mismatch.");

    const docType = String(doc.document_type ?? "other");
    const empty = { proof_points: 0, risks: 0, graph_nodes: 0 };

    if (docType === "primary_rfp") {
      return { ok: true, skipped: "primary_rfp_uses_dedicated_pipeline", document_type: docType, counts: empty };
    }

    const typePrompt = DOC_TYPE_PROMPTS[docType] ?? DOC_TYPE_PROMPTS.other;

    // Source text: prefer existing extracted text rows, else summary.
    const { data: extractRows } = await supabase
      .from("mission_iris_extractions")
      .select("extracted_value")
      .eq("source_file_id", doc.id)
      .eq("extracted_field", "raw_text")
      .limit(1);
    const rawText = extractRows?.[0]?.extracted_value as string | undefined;
    const text = (rawText && rawText.trim().length > 100)
      ? rawText
      : (doc.content_summary ?? "");

    if (!text || text.trim().length < 100) {
      return { ok: true, skipped: "insufficient_text", document_type: docType, counts: empty };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("ORACLE is not configured — built-in AI key missing.");

    const userMsg = `Document type: ${docType}\nDocument title: ${doc.title ?? "(untitled)"}\n\nType-specific extraction guidance:\n${typePrompt}\n\n--- DOCUMENT TEXT ---\n${text.slice(0, 60_000)}`;

    const content = await callAI(apiKey, userMsg);
    if (!content) return { ok: false, skipped: "ai_no_response", document_type: docType, counts: empty };

    const parsed = tryParseJSON<AIResult>(content);
    if (!parsed) return { ok: false, skipped: "ai_unparseable", document_type: docType, counts: empty };

    const counts = { proof_points: 0, risks: 0, graph_nodes: 0 };
    const sourceTag = `oracle_extract:${docType}:${doc.id}`;

    // --- Proof points ---
    const pps = Array.isArray(parsed.proof_points) ? parsed.proof_points : [];
    for (const pp of pps.slice(0, 50)) {
      const text = String(pp.text ?? "").trim().slice(0, 2000);
      if (!text) continue;
      const auth = AUTH.has(pp.authority ?? "") ? pp.authority! : "inferred";
      const conf = CONF.has(pp.confidence ?? "") ? pp.confidence! : "medium";
      const { error } = await supabase.from("mission_proof_points").insert({
        mission_id: data.mission_id,
        text,
        source: sourceTag,
        signal_authority: auth,
        is_manually_added: false,
        iris_confidence: CONF_TO_NUM[conf] ?? 0.6,
        iris_sources: [{ document_id: doc.id, document_type: docType, title: doc.title }],
      });
      if (!error) counts.proof_points++;
    }

    // --- Risks ---
    const risks = Array.isArray(parsed.risks) ? parsed.risks : [];
    for (const r of risks.slice(0, 30)) {
      const title = String(r.title ?? "").trim().slice(0, 200);
      if (!title) continue;
      const severity = SEVERITY.has(r.severity ?? "") ? r.severity! : "Medium";
      const { error } = await supabase.from("mission_risks").insert({
        mission_id: data.mission_id,
        title,
        description: String(r.description ?? "").slice(0, 2000) || null,
        severity,
        status: "Open",
        created_by_system: true,
      });
      if (!error) counts.risks++;
    }

    // --- Graph nodes ---
    const { data: existingNodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("label")
      .eq("mission_id", data.mission_id);
    const existingLabels = new Set(
      (existingNodes ?? []).map((n) => String(n.label).toLowerCase()),
    );

    const nodes = Array.isArray(parsed.graph_nodes) ? parsed.graph_nodes : [];
    for (const n of nodes.slice(0, 50)) {
      const label = String(n.label ?? "").trim().slice(0, 200);
      if (!label || existingLabels.has(label.toLowerCase())) continue;
      const nodeType = NODE_TYPES.has(n.node_type) ? n.node_type : "internal_knowledge";
      const conf = CONF.has(n.confidence ?? "") ? n.confidence! : "medium";
      const { error } = await supabase.from("intelligence_graph_nodes").insert({
        mission_id: data.mission_id,
        node_type: nodeType,
        label,
        description: String(n.description ?? "").slice(0, 800) || null,
        source: sourceTag,
        source_document_id: doc.id,
        confidence_level: conf,
        is_active: true,
      });
      if (!error) {
        existingLabels.add(label.toLowerCase());
        counts.graph_nodes++;
      }
    }

    // --- Trace ---
    await supabase.from("mission_iris_extractions").insert({
      mission_id: data.mission_id,
      source_file_id: doc.id,
      source_file_name: doc.title ?? null,
      extracted_field: "oracle_extraction_summary",
      extracted_value: JSON.stringify({ document_type: docType, counts, at: new Date().toISOString() }),
      confidence_score: 0.8,
      wizard_step: null,
    });

    return { ok: true, document_type: docType, counts };
  });

// Convenience: extract every non-primary-rfp document for a mission.
const BatchInput = z.object({ mission_id: z.string().uuid() });

export const extractAllSourcesForMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BatchInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; processed: number; results: ExtractResult[] }> => {
    const { supabase } = context;
    const { data: docs, error } = await supabase
      .from("mission_documents")
      .select("id, document_type")
      .eq("mission_id", data.mission_id)
      .neq("document_type", "primary_rfp");
    if (error) throw new Error(error.message);

    const results: ExtractResult[] = [];
    for (const d of docs ?? []) {
      try {
        const r = await extractSourceIntelligence({
          data: { mission_id: data.mission_id, document_id: d.id },
        });
        results.push(r);
      } catch (e) {
        console.error("[oracle-extract-all] failed for doc", d.id, e);
      }
    }
    return { ok: true, processed: results.length, results };
  });
