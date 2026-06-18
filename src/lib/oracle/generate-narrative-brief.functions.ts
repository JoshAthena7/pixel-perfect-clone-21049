import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * IRIS Narrative Brief — "Your Place in the Story"
 * Generates three-paragraph context for a single question:
 *   thread / neighbors / evaluator
 * Cached in iris_answers (prompt_type = 'narrative_brief') for 24h.
 */

export type NarrativeBrief = {
  notMapped?: boolean;
  message?: string;
  thread: string;
  neighbors: string;
  evaluator: string;
  winTheme: string;
  connectedQuestions: { number: string; relationship: string; question_text?: string; question_id?: string }[];
  cached?: boolean;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function callGemini(system: string, user: string): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing on server");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 1500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`AI gateway ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = (await r.json()) as any;
  const content = j.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned no JSON object");
  return JSON.parse(match[0]);
}

function parseWinThemes(raw: unknown): { title: string; description: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any, i: number) => {
    if (typeof t === "string") {
      const [title, ...rest] = t.split(/\s+[—–-]\s+/);
      return { title: (title ?? `Theme ${i + 1}`).trim(), description: rest.join(" — ").trim() };
    }
    const text =
      typeof t?.text === "string" ? t.text
      : typeof t?.title === "string" ? t.title
      : typeof t?.label === "string" ? t.label
      : "";
    const [titlePart, ...rest] = text.split(/\s+[—–-]\s+/);
    return {
      title: (titlePart ?? `Theme ${i + 1}`).trim(),
      description:
        rest.join(" — ").trim() ||
        (typeof t?.description === "string" ? t.description : "") ||
        (typeof t?.rationale === "string" ? t.rationale : ""),
    };
  });
}

export const generateNarrativeBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid(),
        force: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<NarrativeBrief> => {
    const { supabase, userId } = context;

    // ---- Load this question ----
    const { data: q } = await supabase
      .from("mission_questions")
      .select(
        "id, question_number, question_text, primary_win_theme, secondary_win_theme, evaluator_fear, narrative_role, evaluation_weight, point_value, section_id",
      )
      .eq("id", data.questionId)
      .eq("mission_id", data.missionId)
      .maybeSingle();

    if (!q) {
      return {
        notMapped: true,
        message: "Question not found",
        thread: "", neighbors: "", evaluator: "", winTheme: "", connectedQuestions: [],
      };
    }
    const primaryTheme = (q as any).primary_win_theme as string | null;
    if (!primaryTheme) {
      return {
        notMapped: true,
        message: "Run story mapping first",
        thread: "", neighbors: "", evaluator: "", winTheme: "", connectedQuestions: [],
      };
    }

    // ---- Cache lookup ----
    if (!data.force) {
      const { data: cached } = await supabase
        .from("iris_answers")
        .select("response_full, created_at")
        .eq("mission_id", data.missionId)
        .eq("question_id", data.questionId)
        .eq("prompt_type", "narrative_brief")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached && cached.created_at) {
        const age = Date.now() - new Date(cached.created_at as string).getTime();
        if (age < CACHE_TTL_MS) {
          return { ...((cached.response_full as any) ?? {}), cached: true };
        }
      }
    }

    // ---- Section name ----
    let sectionName: string | null = null;
    if ((q as any).section_id) {
      const { data: s } = await supabase
        .from("mission_sections")
        .select("name")
        .eq("id", (q as any).section_id)
        .maybeSingle();
      sectionName = (s as any)?.name ?? null;
    }

    // ---- Connected questions (same primary win theme, exclude self) ----
    const { data: peers } = await supabase
      .from("mission_questions")
      .select("id, question_number, question_text, narrative_role, evaluation_weight, point_value")
      .eq("mission_id", data.missionId)
      .eq("primary_win_theme", primaryTheme)
      .eq("is_withdrawn", false)
      .neq("id", data.questionId)
      .limit(5);

    const connected = (peers ?? []) as any[];

    // ---- Oracle context ----
    const { data: cfg } = await supabase
      .from("oracle_engagement_config")
      .select("win_themes, north_star, central_claim")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const themes = parseWinThemes((cfg as any)?.win_themes);
    const themeMeta = themes.find((t) => t.title.toLowerCase() === primaryTheme.toLowerCase());
    const centralClaim = (cfg as any)?.central_claim ?? (cfg as any)?.north_star ?? "(not configured)";

    // ---- AI prompt ----
    const system =
      "You are IRIS, the narrative intelligence engine for Athena Strategy Group. You help proposal writers understand how their specific answer fits into one connected story. Return ONLY a single JSON object.";
    const peerBlock =
      connected.length === 0
        ? "(none — this question stands alone in its thread)"
        : connected
            .map(
              (p) =>
                `${p.question_number ?? "?"}: ${String(p.question_text ?? "").slice(0, 80)} — Role: ${p.narrative_role ?? "standalone"}`,
            )
            .join("\n");

    const user = `CENTRAL CLAIM:
${centralClaim}

WIN THEME THIS QUESTION SERVES:
${primaryTheme}${themeMeta?.description ? ` — ${themeMeta.description}` : ""}

THIS QUESTION:
${(q as any).question_number ?? "?"}: ${String((q as any).question_text ?? "").slice(0, 2000)}
Section: ${sectionName ?? "unknown"}
Eval weight: ${(q as any).evaluation_weight ?? (q as any).point_value ?? "not specified"}
Narrative role: ${(q as any).narrative_role ?? "standalone"}
Evaluator fear: ${(q as any).evaluator_fear ?? "(not yet captured)"}

CONNECTED QUESTIONS (same narrative thread):
${peerBlock}

YOUR TASK:
Write three short paragraphs for this writer.

Paragraph 1 — THE THREAD (2-3 sentences): How does this question serve the central claim? What piece of the argument does it carry? Be specific to this question and this mission — not generic.

Paragraph 2 — YOUR NEIGHBORS (2-3 sentences): Name the connected questions and explain the relationship. What should this writer's answer reinforce from those questions? What should it set up for the questions that come after? If no connected questions: explain what this question establishes on its own.

Paragraph 3 — THE EVALUATOR (1-2 sentences): What is the evaluator actually afraid of when they ask this question? What does a high-scoring answer make them feel — specifically?

Tone: direct. Specific. Like a trusted colleague briefing you before a big meeting. Not corporate. Not generic. Every sentence must be specific to this question, this mission, this state.

Return JSON only:
{
  "thread": string,
  "neighbors": string,
  "evaluator": string,
  "winTheme": string,
  "connectedQuestions": [ { "number": string, "relationship": string } ]
}`;

    let parsed: any;
    try {
      parsed = await callGemini(system, user);
    } catch (e) {
      console.error("[narrative-brief] AI failure", e);
      throw new Error("IRIS is thinking — try again");
    }

    const brief: NarrativeBrief = {
      thread: String(parsed.thread ?? "").trim(),
      neighbors: String(parsed.neighbors ?? "").trim(),
      evaluator: String(parsed.evaluator ?? "").trim(),
      winTheme: String(parsed.winTheme ?? primaryTheme).trim(),
      connectedQuestions: Array.isArray(parsed.connectedQuestions)
        ? parsed.connectedQuestions
            .map((c: any) => {
              const num = String(c?.number ?? "").trim();
              const peer = connected.find((p) => String(p.question_number ?? "") === num);
              return {
                number: num,
                relationship: String(c?.relationship ?? "").trim(),
                question_text: peer ? String(peer.question_text ?? "").slice(0, 200) : undefined,
                question_id: peer?.id,
              };
            })
            .filter((c: any) => c.number)
        : connected.map((p) => ({
            number: String(p.question_number ?? ""),
            relationship: p.narrative_role ?? "shares_thread",
            question_text: String(p.question_text ?? "").slice(0, 200),
            question_id: p.id,
          })),
    };

    // Tone guardrail — log only
    const blob = `${brief.thread} ${brief.neighbors} ${brief.evaluator}`.toLowerCase();
    const qNum = String((q as any).question_number ?? "").toLowerCase();
    if (qNum && !blob.includes(qNum)) {
      console.warn("[narrative-brief] generic-sounding output", { questionId: data.questionId });
    }

    // ---- Cache write ----
    try {
      await supabase.from("iris_answers").insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        prompt_type: "narrative_brief",
        context_snapshot: {
          questionId: data.questionId,
          winTheme: primaryTheme,
          connectedCount: connected.length,
        },
        response_full: brief as any,
        confidence_level: "high",
        created_by: userId,
      } as any);
    } catch (e) {
      console.warn("[narrative-brief] cache write failed", e);
    }

    return brief;
  });

/** Rate feedback for a cached narrative brief. */
export const rateNarrativeBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid(),
        helpful: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("iris_answers")
      .select("id")
      .eq("mission_id", data.missionId)
      .eq("question_id", data.questionId)
      .eq("prompt_type", "narrative_brief")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { ok: false };
    await supabase
      .from("iris_answers")
      .update({ was_helpful: data.helpful } as any)
      .eq("id", (row as any).id);
    return { ok: true };
  });

/** Pre-generate narrative briefs for every mapped question in a mission. */
export const pregenerateNarrativeBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Auth: admin or mission member
    const [{ data: isAdmin }, { data: team }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", data.missionId)
        .eq("member_id", userId)
        .maybeSingle(),
    ]);
    if (!isAdmin && !team) return { ok: false, generated: 0, skipped: 0 };

    const { data: qs } = await supabase
      .from("mission_questions")
      .select("id")
      .eq("mission_id", data.missionId)
      .eq("is_withdrawn", false)
      .not("primary_win_theme", "is", null);
    const all = (qs ?? []) as { id: string }[];

    // Skip those already cached < 24h
    const { data: cached } = await supabase
      .from("iris_answers")
      .select("question_id, created_at")
      .eq("mission_id", data.missionId)
      .eq("prompt_type", "narrative_brief");
    const fresh = new Set<string>();
    const now = Date.now();
    (cached ?? []).forEach((c: any) => {
      if (c.question_id && now - new Date(c.created_at).getTime() < CACHE_TTL_MS) {
        fresh.add(c.question_id);
      }
    });
    const todo = all.filter((q) => !fresh.has(q.id));

    let generated = 0;
    const skipped = all.length - todo.length;
    const BATCH = 5;

    // Inline generation — re-use logic by re-invoking the handler is awkward,
    // so we call generateNarrativeBrief's body via direct fetch path? simpler:
    // duplicate the minimal flow per question. To avoid drift we just call
    // the AI again, identical prompt. Best-effort, errors are swallowed.
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (qq) => {
          try {
            const res = await generateNarrativeBrief({
              data: { missionId: data.missionId, questionId: qq.id, force: false },
            } as any);
            if (res && !res.notMapped) generated += 1;
          } catch (e) {
            console.warn("[pregen-narrative] failed for", qq.id, e);
          }
        }),
      );
    }

    return { ok: true, generated, skipped, total: all.length };
  });
