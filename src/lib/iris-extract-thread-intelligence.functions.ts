// IRIS Thread Intelligence Extraction
// Scans a question's thread messages, asks the AI gateway to extract
// proposal intelligence signals, and writes them to public.insights and
// public.signals so future missions can benefit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const SIGNAL_TYPES = [
  "program",
  "competitive",
  "state",
  "approach",
  "expert",
  "compliance",
] as const;
type SignalType = (typeof SIGNAL_TYPES)[number];

type ExtractedSignal = {
  signal_type: SignalType;
  content: string;
  confidence: "high" | "medium" | "low";
  applies_to_programs: string[];
  applies_to_states: string[];
  applies_to_question_types: string[];
  source_evidence: string;
  recommended_table: "insights" | "signals";
};

const ExtractInput = z.object({
  mission_id: z.string().uuid(),
  question_id: z.string().uuid(),
  question_text: z.string().max(8000).optional(),
  thread_content: z.string().max(60000).optional(),
});

export const extractThreadIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ExtractInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const userId = context.userId as string;
    return runExtraction(supabase, userId, data);
  });

const BatchInput = z.object({ mission_id: z.string().uuid() });

export const batchExtractMissionThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const userId = context.userId as string;

    // Admin or mission lead only
    const { data: canManage } = await supabase.rpc("has_mission_role", {
      _mission_id: data.mission_id,
      _user_id: userId,
      _roles: ["admin", "lead", "owner", "engagement_lead"],
    });
    if (!canManage) throw new Error("Only mission leads or admins can run batch extraction.");

    const { data: qs } = await supabase
      .from("mission_questions")
      .select("id, question_text")
      .eq("mission_id", data.mission_id)
      .eq("iris_extracted", false)
      .eq("is_withdrawn", false);

    const questions = (qs ?? []) as Array<{ id: string; question_text: string | null }>;
    let processed = 0;
    let signalsTotal = 0;
    const errors: string[] = [];

    for (const q of questions) {
      try {
        const res = await runExtraction(supabase, userId, {
          mission_id: data.mission_id,
          question_id: q.id,
          question_text: q.question_text ?? "",
        });
        if (res.skipped) continue;
        processed += 1;
        signalsTotal += res.signals_extracted;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return {
      total_questions: questions.length,
      processed,
      signals_extracted: signalsTotal,
      errors: errors.slice(0, 5),
    };
  });

// ---- core extraction logic ----

async function runExtraction(
  supabase: Supa,
  userId: string,
  data: {
    mission_id: string;
    question_id: string;
    question_text?: string;
    thread_content?: string;
  },
): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  signals_extracted: number;
  insights_written: number;
  signals_written: number;
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "no_api_key", signals_extracted: 0, insights_written: 0, signals_written: 0 };
  }

  // 1. Load question + thread if not supplied
  let questionText = data.question_text ?? "";
  let threadContent = data.thread_content ?? "";

  if (!questionText) {
    const { data: q } = await supabase
      .from("mission_questions")
      .select("question_text")
      .eq("id", data.question_id)
      .maybeSingle();
    questionText = (q as { question_text: string | null } | null)?.question_text ?? "";
  }

  if (!threadContent) {
    const { data: msgs } = await supabase
      .from("thread_messages")
      .select("sender_name, message_body, message_type, created_at")
      .eq("question_id", data.question_id)
      .order("created_at", { ascending: true })
      .limit(200);
    const rows = (msgs ?? []) as Array<{
      sender_name: string | null;
      message_body: string | null;
      message_type: string | null;
      created_at: string;
    }>;
    // Skip IRIS-generated messages — we want human intelligence.
    const human = rows.filter((m) => m.message_type !== "iris" && (m.message_body ?? "").trim().length > 0);
    if (human.length === 0) {
      return { ok: true, skipped: true, reason: "no_thread_content", signals_extracted: 0, insights_written: 0, signals_written: 0 };
    }
    threadContent = human
      .map((m) => `[${m.created_at.slice(0, 10)}] ${m.sender_name ?? "Member"}: ${m.message_body}`)
      .join("\n")
      .slice(0, 40000);
  }

  if (!threadContent.trim()) {
    return { ok: true, skipped: true, reason: "no_thread_content", signals_extracted: 0, insights_written: 0, signals_written: 0 };
  }

  const system = `You are IRIS, an intelligence extraction AI for a government proposal firm. Analyze this proposal thread for intelligence signals. For each signal found, return a JSON object with key "signals" whose value is an array: [{ signal_type: 'program|competitive|state|approach|expert|compliance', content: string (the actual intelligence written as a concrete fact), confidence: 'high|medium|low', applies_to_programs: string[], applies_to_states: string[], applies_to_question_types: string[], source_evidence: string (short quote from thread), recommended_table: 'insights|signals' }].

Signal types:
- PROGRAM = how this agency/program works, their priorities, hidden requirements, evaluator preferences.
- COMPETITIVE = incumbents, competitors, their approach or pricing.
- STATE = state-specific procurement behavior or requirements.
- APPROACH = winning argument, framework, or solution that could reuse on future proposals.
- EXPERT = subject matter expertise demonstrated by a contributor worth capturing for future routing.
- COMPLIANCE = compliance requirement, page limit, formatting rule, or evaluation criterion surfaced in thread.

Return { "signals": [] } if no signals found. Be conservative — only extract facts grounded in the thread, not generic advice.`;

  const userMsg = `QUESTION:\n${questionText}\n\nTHREAD:\n${threadContent}`;

  const aiRes = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        max_tokens: 2500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });

  if (aiRes.status === 402) throw new Error("Workspace is out of AI credits.");
  if (aiRes.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!aiRes.ok) throw new Error(`IRIS gateway returned ${aiRes.status}.`);

  const json = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = match ? safeJson(match[0]) : null;
  const rawSignals = Array.isArray(parsed?.signals) ? (parsed!.signals as unknown[]) : [];
  const signals = rawSignals.map(normalizeSignal).filter((s) => s.content);

  let insightsWritten = 0;
  let signalsWritten = 0;

  const questionTag = `q_${data.question_id.slice(0, 8)}`;

  const insightRows: Array<Record<string, unknown>> = [];
  const signalRows: Array<Record<string, unknown>> = [];

  for (const s of signals) {
    const tags = dedupe([
      s.signal_type,
      ...s.applies_to_programs,
      ...s.applies_to_states,
      ...s.applies_to_question_types,
      "thread_extracted",
      questionTag,
    ]).slice(0, 25);

    if (s.recommended_table === "signals") {
      signalRows.push({
        mission_id: data.mission_id,
        user_id: userId,
        source_module: "iris_thread_extraction",
        signal_type: s.signal_type,
        signal_title: s.content.slice(0, 200),
        signal_summary: s.source_evidence ? `${s.content}\n\nEvidence: ${s.source_evidence}` : s.content,
        severity: "info",
        confidence: confidenceToNumber(s.confidence),
        status: "active",
        created_by_system: true,
        related_question_id: data.question_id,
        tags,
      });
    } else {
      insightRows.push({
        mission_id: data.mission_id,
        insight_type: s.signal_type,
        content: s.content,
        source: `thread_extracted:${data.question_id}`,
        confidence: s.confidence,
        tags,
      });
    }
  }

  if (insightRows.length > 0) {
    const { error } = await supabase.from("insights").insert(insightRows);
    if (!error) insightsWritten = insightRows.length;
  }
  if (signalRows.length > 0) {
    const { error } = await supabase.from("signals").insert(signalRows);
    if (!error) signalsWritten = signalRows.length;
  }

  // Fire-and-forget mirror into the entity-first intel_events feed.
  if (signals.length > 0) {
    const { writeIntelEvents } = await import("@/lib/intel-events-writer");
    writeIntelEvents(
      signals.map((s) => ({
        mission_id: data.mission_id,
        event_type: "thread_extraction",
        title: s.content.slice(0, 200),
        content: s.source_evidence ? `${s.content}\n\nEvidence: ${s.source_evidence}` : s.content,
        confidence: (s.confidence as "high" | "medium" | "low") ?? null,
        generated_by: "iris_thread_extraction",
        tags: dedupe([
          s.signal_type,
          "thread_extracted",
          questionTag,
          ...s.applies_to_programs,
          ...s.applies_to_states,
        ]).slice(0, 25),
      })),
    );
  }

  // Mark question as extracted (best-effort)
  await supabase
    .from("mission_questions")
    .update({ iris_extracted: true, iris_extracted_at: new Date().toISOString() })
    .eq("id", data.question_id);

  return {
    ok: true,
    signals_extracted: signals.length,
    insights_written: insightsWritten,
    signals_written: signalsWritten,
  };
}

// ---- helpers ----

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

function confidenceToNumber(c: "high" | "medium" | "low"): number {
  if (c === "high") return 0.9;
  if (c === "low") return 0.4;
  return 0.65;
}

function normalizeSignal(raw: unknown): ExtractedSignal {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = typeof r.signal_type === "string" && (SIGNAL_TYPES as readonly string[]).includes(r.signal_type)
    ? (r.signal_type as SignalType)
    : "approach";
  const conf =
    r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  const table = r.recommended_table === "signals" ? "signals" : "insights";
  return {
    signal_type: type,
    content: typeof r.content === "string" ? r.content.trim().slice(0, 2000) : "",
    confidence: conf as ExtractedSignal["confidence"],
    applies_to_programs: strArr(r.applies_to_programs),
    applies_to_states: strArr(r.applies_to_states),
    applies_to_question_types: strArr(r.applies_to_question_types),
    source_evidence: typeof r.source_evidence === "string" ? r.source_evidence.trim().slice(0, 500) : "",
    recommended_table: table,
  };
}
