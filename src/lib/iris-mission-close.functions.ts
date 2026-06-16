// IRIS Post-Mission Close Pipeline
// Records the outcome, marks the mission closed, then runs IRIS analysis
// to generate lessons, update competitor intel, and add a state signal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const OUTCOMES = [
  "win",
  "loss",
  "no_award",
  "cancelled",
  "protest_pending",
  "protest_sustained",
  "protest_denied",
] as const;

const OutcomeInput = z.object({
  mission_id: z.string().uuid(),
  outcome: z.enum(OUTCOMES),
  awarded_to: z.string().trim().max(500).nullish(),
  award_value: z.number().finite().nonnegative().nullish(),
  award_date: z.string().nullish(),
  final_score_received: z.number().finite().nullish(),
  final_rank: z.number().int().nullish(),
  total_offerors: z.number().int().nullish(),
  debrief_received: z.boolean().optional(),
  debrief_notes: z.string().max(20000).nullish(),
  orals_held: z.boolean().optional(),
  orals_notes: z.string().max(20000).nullish(),
  bafo_requested: z.boolean().optional(),
  bafo_notes: z.string().max(20000).nullish(),
  incumbent_retained: z.boolean().nullish(),
  transition_start_date: z.string().nullish(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

type Lesson = {
  lesson_type: string;
  lesson_text: string;
  confidence: "high" | "medium" | "low";
  applies_to_programs: string[];
  applies_to_states: string[];
  applies_to_question_types: string[];
  evidence: string;
};

export const closeMissionAndUpdateIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => OutcomeInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const userId = context.userId as string;

    // Authorization: must be admin or mission lead
    const { data: canManage } = await supabase.rpc("has_mission_role", {
      _mission_id: data.mission_id,
      _user_id: userId,
      _roles: ["admin", "lead", "owner", "engagement_lead"],
    });
    if (!canManage) throw new Error("Only mission leads or admins can close a mission.");

    // 1. Upsert outcome
    const outcomeRow = {
      mission_id: data.mission_id,
      outcome: data.outcome,
      awarded_to: data.awarded_to ?? null,
      award_value: data.award_value ?? null,
      award_date: data.award_date || null,
      final_score_received: data.final_score_received ?? null,
      final_rank: data.final_rank ?? null,
      total_offerors: data.total_offerors ?? null,
      debrief_received: !!data.debrief_received,
      debrief_notes: data.debrief_notes ?? null,
      orals_held: !!data.orals_held,
      orals_notes: data.orals_notes ?? null,
      bafo_requested: !!data.bafo_requested,
      bafo_notes: data.bafo_notes ?? null,
      incumbent_retained: data.incumbent_retained ?? null,
      transition_start_date: data.transition_start_date || null,
      recorded_by: userId,
      recorded_at: new Date().toISOString(),
    };

    const { error: outErr } = await supabase
      .from("mission_outcomes")
      .upsert(outcomeRow, { onConflict: "mission_id" });
    if (outErr) throw new Error(`Could not record outcome: ${outErr.message}`);

    // 2. Mark mission closed
    await supabase.from("missions").update({ status: "closed" }).eq("id", data.mission_id);

    // 3. Run IRIS post-mission pipeline (best-effort)
    let lessonsGenerated = 0;
    let competitorsUpdated = 0;
    let signalsAdded = 0;
    let pipelineError: string | null = null;

    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("IRIS AI key missing");

      // A) Read full mission record
      const [missionRes, questionsRes, signalsRes, insightsRes, extractionsRes] =
        await Promise.all([
          supabase
            .from("missions")
            .select(
              "id, name, client_name, state, agency_name, program_type, procurement_type, north_star, why_win, why_lose, known_competitors, win_themes_text, reinforce, avoid",
            )
            .eq("id", data.mission_id)
            .maybeSingle(),
          supabase
            .from("mission_questions")
            .select("id, question_number, question_text, section_name")
            .eq("mission_id", data.mission_id)
            .limit(200),
          supabase
            .from("signals")
            .select("signal_title, signal_summary, severity, created_at")
            .eq("mission_id", data.mission_id)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("insights")
            .select("content, insight_type, tags")
            .eq("mission_id", data.mission_id)
            .limit(50),
          supabase
            .from("mission_iris_extractions")
            .select("extracted_field, extracted_value")
            .eq("mission_id", data.mission_id)
            .like("extracted_field", "competitor_card_%"),
        ]);

      const mission = missionRes?.data ?? {};
      const questions = (questionsRes?.data ?? []) as Array<{
        question_number: string | null;
        question_text: string | null;
        section_name: string | null;
      }>;
      const signals = (signalsRes?.data ?? []) as Array<{
        signal_title: string;
        signal_summary: string | null;
        created_at: string;
      }>;
      const insights = (insightsRes?.data ?? []) as Array<{ content: string }>;
      const competitorCards = (extractionsRes?.data ?? []) as Array<{
        extracted_field: string;
        extracted_value: string | null;
      }>;

      const recordText = `
MISSION: ${mission.name ?? ""}
CLIENT: ${mission.client_name ?? ""}
STATE: ${mission.state ?? ""}
AGENCY: ${mission.agency_name ?? ""}
PROGRAM TYPE: ${mission.program_type ?? ""}
NORTH STAR: ${mission.north_star ?? ""}
WHY WIN: ${mission.why_win ?? ""}
WHY LOSE: ${mission.why_lose ?? ""}
WIN THEMES: ${mission.win_themes_text ?? ""}
KNOWN COMPETITORS: ${(mission.known_competitors ?? []).join(", ")}

OUTCOME: ${data.outcome}${data.awarded_to ? ` — awarded to ${data.awarded_to}` : ""}
AWARD VALUE: ${data.award_value ?? "n/a"}
OUR SCORE: ${data.final_score_received ?? "n/a"}; RANK: ${data.final_rank ?? "n/a"} of ${data.total_offerors ?? "n/a"}
DEBRIEF NOTES: ${data.debrief_notes ?? "(none)"}
ORALS NOTES: ${data.orals_notes ?? "(none)"}
BAFO NOTES: ${data.bafo_notes ?? "(none)"}

QUESTIONS (${questions.length}):
${questions.slice(0, 40).map((q) => `- ${q.question_number ?? ""} [${q.section_name ?? ""}] ${q.question_text ?? ""}`.slice(0, 300)).join("\n")}

RECENT SIGNALS (${signals.length}):
${signals.slice(0, 20).map((s) => `- [${s.created_at.slice(0, 10)}] ${s.signal_title}: ${s.signal_summary ?? ""}`.slice(0, 300)).join("\n")}

PRIOR INSIGHTS (${insights.length}):
${insights.slice(0, 20).map((i) => `- ${i.content}`.slice(0, 300)).join("\n")}

COMPETITOR CARDS ON FILE: ${competitorCards.length}
`.trim();

      // B) Generate lessons via Lovable AI
      const system = `You are IRIS analyzing a completed government proposal mission. Based on the full mission record provided, generate exactly 5 mission lessons. Each lesson MUST be specific, actionable, and tied to evidence from this mission (not generic best-practice advice).

Return ONLY a JSON object: { "lessons": [ { "lesson_type": "strategy" | "writing" | "technical" | "pricing" | "team" | "competitive", "lesson_text": "string", "confidence": "high" | "medium" | "low", "applies_to_programs": ["string"], "applies_to_states": ["string"], "applies_to_question_types": ["string"], "evidence": "string (quote or reference from this mission)" } ] }`;
      const userMsg = `Mission outcome: ${data.outcome}\n\nFULL MISSION RECORD:\n${recordText}`;

      const aiRes = await withAICircuit(async () => {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: 3000,
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

      const aiJson = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = aiJson.choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = match ? safeJson(match[0]) : null;
      const rawLessons = Array.isArray(parsed?.lessons) ? (parsed!.lessons as unknown[]) : [];
      const lessons: Lesson[] = rawLessons.slice(0, 5).map((l) => normalizeLesson(l));

      // Persist lessons to insights table
      if (lessons.length > 0) {
        const lessonRows = lessons.map((l) => ({
          mission_id: data.mission_id,
          insight_type: "lesson",
          content: l.lesson_text,
          source: `mission_close:${data.outcome}`,
          confidence: l.confidence,
          tags: dedupe([
            l.lesson_type,
            ...(l.applies_to_programs ?? []),
            ...(l.applies_to_states ?? []),
            ...(l.applies_to_question_types ?? []),
            `evidence:${(l.evidence ?? "").slice(0, 80)}`,
          ]).slice(0, 20),
        }));
        const { error: insErr } = await supabase.from("insights").insert(lessonRows);
        if (!insErr) lessonsGenerated = lessons.length;
      }

      // C) Update competitor intelligence
      const competitors: string[] = Array.isArray(mission.known_competitors)
        ? (mission.known_competitors as string[])
        : [];
      const compRows: Array<Record<string, unknown>> = [];
      const dateStr = (data.award_date as string) || new Date().toISOString().slice(0, 10);

      if (data.outcome === "win") {
        for (const comp of competitors) {
          compRows.push({
            mission_id: data.mission_id,
            insight_type: "competitive_intel",
            content: `Defeated ${comp} on ${mission.program_type ?? "this program"} in ${mission.state ?? "this state"} on ${dateStr}. Our positioning: ${mission.north_star ?? "(no north star recorded)"}. Their apparent weakness: ${extractWeakness(data.debrief_notes ?? null) || "(no debrief weakness extracted)"}.`,
            source: `mission_close:win`,
            confidence: "medium",
            tags: dedupe([comp, "win", mission.state, mission.program_type].filter(Boolean) as string[]),
          });
        }
      } else if (data.outcome === "loss" && data.awarded_to) {
        const winner = data.awarded_to.trim();
        const matchedComp =
          competitors.find((c) => winner.toLowerCase().includes(c.toLowerCase())) || winner;
        compRows.push({
          mission_id: data.mission_id,
          insight_type: "competitive_intel",
          content: `${matchedComp} won ${mission.program_type ?? "this program"} in ${mission.state ?? "this state"} on ${dateStr}. Award value: ${data.award_value ?? "unknown"}. Debrief notes: ${data.debrief_notes ?? "(none)"}.`,
          source: `mission_close:loss`,
          confidence: "high",
          tags: dedupe([matchedComp, "loss", mission.state, mission.program_type].filter(Boolean) as string[]),
        });
      }

      if (compRows.length > 0) {
        const { error: cErr } = await supabase.from("insights").insert(compRows);
        if (!cErr) competitorsUpdated = compRows.length;
      }

      // D) Add a state-intelligence signal
      const sigTitle = `Mission outcome: ${data.outcome.toUpperCase()} — ${mission.program_type ?? "program"} in ${mission.state ?? "state"}`;
      const sigSummaryParts = [
        `Award date: ${dateStr}.`,
        data.outcome === "win"
          ? `Our approach: ${mission.north_star ?? "(none)"}.`
          : `Awarded to: ${data.awarded_to ?? "(unknown)"}. Score received: ${data.final_score_received ?? "n/a"}.`,
      ];
      const { error: sErr } = await supabase.from("signals").insert({
        mission_id: data.mission_id,
        user_id: userId,
        source_module: "iris_mission_close",
        signal_type: "outcome",
        signal_title: sigTitle,
        signal_summary: sigSummaryParts.join(" "),
        severity: data.outcome === "win" ? "info" : "warn",
        confidence: 0.9,
        status: "active",
        created_by_system: true,
        tags: dedupe(
          [
            mission.state,
            mission.program_type,
            data.outcome,
            String(new Date().getFullYear()),
          ].filter(Boolean) as string[],
        ),
      });
      if (!sErr) signalsAdded = 1;

      // Fire-and-forget mirror into intel_events.
      try {
        const { writeIntelEvent, writeIntelEvents } = await import("@/lib/intel-events-writer");
        writeIntelEvent({
          mission_id: data.mission_id,
          event_type: "mission_close_summary",
          title: sigTitle,
          content: sigSummaryParts.join(" "),
          confidence: "high",
          generated_by: "iris_mission_close",
          tags: dedupe(
            [mission.state, mission.program_type, data.outcome, String(new Date().getFullYear())].filter(Boolean) as string[],
          ),
        });
        if (compRows.length > 0) {
          writeIntelEvents(
            compRows.map((r) => ({
              mission_id: data.mission_id,
              event_type: "mission_close_competitor",
              title: String((r as { content?: string }).content ?? "").slice(0, 200),
              content: String((r as { content?: string }).content ?? ""),
              confidence: ((r as { confidence?: string }).confidence as "high" | "medium" | "low") ?? "medium",
              generated_by: "iris_mission_close",
              tags: Array.isArray((r as { tags?: string[] }).tags) ? (r as { tags: string[] }).tags : [],
            })),
          );
        }
        if (lessonsGenerated > 0) {
          writeIntelEvent({
            mission_id: data.mission_id,
            event_type: "mission_close_lesson",
            title: `${lessonsGenerated} lesson(s) recorded from mission close`,
            content: `Outcome=${data.outcome}. See insights tagged 'mission_close' for full text.`,
            confidence: "medium",
            generated_by: "iris_mission_close",
            tags: ["mission_close", "lessons"],
          });
        }
      } catch (e) {
        console.error("[iris-mission-close] intel_events mirror failed", e);
      }
    } catch (e) {
      pipelineError = e instanceof Error ? e.message : String(e);
    }

    return {
      ok: true,
      lessons_generated: lessonsGenerated,
      competitors_updated: competitorsUpdated,
      signals_added: signalsAdded,
      message: pipelineError
        ? `Outcome recorded. IRIS analysis partial: ${pipelineError}`
        : `Outcome recorded. IRIS generated ${lessonsGenerated} lessons, updated ${competitorsUpdated} competitor records, and added ${signalsAdded} signal.`,
    };
  });

// ---------- helpers ----------

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeLesson(raw: unknown): Lesson {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = typeof r.lesson_type === "string" ? r.lesson_type : "strategy";
  const conf = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  return {
    lesson_type: type,
    lesson_text: typeof r.lesson_text === "string" ? r.lesson_text.trim() : "",
    confidence: conf as Lesson["confidence"],
    applies_to_programs: strArr(r.applies_to_programs),
    applies_to_states: strArr(r.applies_to_states),
    applies_to_question_types: strArr(r.applies_to_question_types),
    evidence: typeof r.evidence === "string" ? r.evidence.trim() : "",
  };
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

function extractWeakness(debrief: string | null): string {
  if (!debrief) return "";
  const lower = debrief.toLowerCase();
  const idx = lower.indexOf("weakness");
  if (idx === -1) return "";
  return debrief.slice(idx, idx + 200).trim();
}

export const getMissionOutcome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mission_id: string }) =>
    z.object({ mission_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const { data: outcome } = await supabase
      .from("mission_outcomes")
      .select("*")
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!outcome) return { outcome: null, lesson_count: 0, competitor_count: 0 };

    const [{ count: lessonCount }, { count: compCount }] = await Promise.all([
      supabase
        .from("insights")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.mission_id)
        .eq("insight_type", "lesson"),
      supabase
        .from("insights")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.mission_id)
        .eq("insight_type", "competitive_intel")
        .like("source", "mission_close:%"),
    ]);

    return {
      outcome,
      lesson_count: lessonCount ?? 0,
      competitor_count: compCount ?? 0,
    };
  });
