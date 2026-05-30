import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "google/gemini-embedding-001";
const SIM_THRESHOLD = 0.72;

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured.");
  if (texts.length === 0) return [];
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace.");
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/**
 * Generate AI-suggested mappings between win themes and RFP questions/sections.
 * Inserts rows with ai_suggested=true, confirmed=false. Skips pairs already mapped.
 */
export const suggestWinThemeMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ engagementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { engagementId } = data;

    const [{ data: themes }, { data: questions }, { data: existing }] = await Promise.all([
      supabase.from("win_themes").select("id, title, description").eq("engagement_id", engagementId),
      supabase
        .from("rfp_questions")
        .select("id, section_id, question_number, title, body")
        .eq("engagement_id", engagementId),
      supabase
        .from("win_theme_mappings")
        .select("win_theme_id, section_id, question_id")
        .eq("engagement_id", engagementId),
    ]);

    if (!themes?.length) return { ok: true, created: 0, message: "No win themes." };
    if (!questions?.length) return { ok: true, created: 0, message: "No RFP questions." };

    const existingKey = new Set(
      (existing ?? []).map((m: any) => `${m.win_theme_id}:${m.section_id ?? "-"}:${m.question_id ?? "-"}`),
    );

    const themeTexts = themes.map((t: any) =>
      `${t.title ?? ""}\n${t.description ?? ""}`.trim().slice(0, 2000) || t.title || "theme",
    );
    const qTexts = questions.map((q: any) =>
      `${q.question_number ?? ""} ${q.title ?? ""}\n${q.body ?? ""}`.trim().slice(0, 2000) || "question",
    );

    const [themeEmb, qEmb] = await Promise.all([embedBatch(themeTexts), embedBatch(qTexts)]);

    type Pending = {
      engagement_id: string;
      win_theme_id: string;
      section_id: string | null;
      question_id: string | null;
      ai_suggested: boolean;
      ai_similarity: number;
      confirmed: boolean;
    };
    const toInsert: Pending[] = [];

    // Question-level matches
    for (let i = 0; i < themes.length; i++) {
      for (let j = 0; j < questions.length; j++) {
        const sim = cosine(themeEmb[i], qEmb[j]);
        if (sim < SIM_THRESHOLD) continue;
        const key = `${themes[i].id}:-:${questions[j].id}`;
        if (existingKey.has(key)) continue;
        toInsert.push({
          engagement_id: engagementId,
          win_theme_id: themes[i].id,
          section_id: null,
          question_id: questions[j].id,
          ai_suggested: true,
          ai_similarity: sim,
          confirmed: false,
        });
        existingKey.add(key);
      }
    }

    // Section-level: average question embeddings per section, compare to theme
    const sectionGroups = new Map<string, number[]>();
    questions.forEach((q: any, idx: number) => {
      if (!q.section_id) return;
      const list = sectionGroups.get(q.section_id) ?? [];
      list.push(idx);
      sectionGroups.set(q.section_id, list);
    });
    for (const [sectionId, idxs] of sectionGroups.entries()) {
      const dim = qEmb[idxs[0]].length;
      const avg = new Array(dim).fill(0);
      for (const k of idxs) for (let d = 0; d < dim; d++) avg[d] += qEmb[k][d];
      for (let d = 0; d < dim; d++) avg[d] /= idxs.length;
      for (let i = 0; i < themes.length; i++) {
        const sim = cosine(themeEmb[i], avg);
        if (sim < SIM_THRESHOLD) continue;
        const key = `${themes[i].id}:${sectionId}:-`;
        if (existingKey.has(key)) continue;
        toInsert.push({
          engagement_id: engagementId,
          win_theme_id: themes[i].id,
          section_id: sectionId,
          question_id: null,
          ai_suggested: true,
          ai_similarity: sim,
          confirmed: false,
        });
        existingKey.add(key);
      }
    }

    if (toInsert.length === 0) return { ok: true, created: 0 };

    const { error } = await supabase.from("win_theme_mappings").insert(toInsert);
    if (error) throw new Error(error.message);
    return { ok: true, created: toInsert.length };
  });

/**
 * Generate writer_hint text for each confirmed mapping that doesn't yet have one.
 * Uses chat completions with JSON output.
 */
export const generateWinThemeHints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        engagementId: z.string().uuid(),
        themeId: z.string().uuid().optional(),
        onlyMissing: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    let q = supabase
      .from("win_theme_mappings")
      .select(
        "id, writer_hint, win_theme_id, section_id, question_id, win_themes!inner(title, description), heatmap_sections(section_name), rfp_questions(question_number, title, body)",
      )
      .eq("engagement_id", data.engagementId);
    if (data.themeId) q = q.eq("win_theme_id", data.themeId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const targets = (rows ?? []).filter((r: any) => !data.onlyMissing || !r.writer_hint);
    if (targets.length === 0) return { ok: true, updated: 0 };

    let updated = 0;
    for (const r of targets as any[]) {
      const theme = r.win_themes;
      const section = r.heatmap_sections;
      const question = r.rfp_questions;
      const target = question
        ? `RFP Question ${question.question_number ?? ""} — ${question.title ?? ""}\n${question.body ?? ""}`.slice(0, 2500)
        : section
          ? `Section: ${section.section_name}`
          : "this proposal section";

      const sys =
        "You write concise, concrete instructions to proposal writers. Output STRICT JSON: {\"hint\": string}. The hint must be one to three sentences telling the writer exactly how to land the given win theme when answering the given RFP target. Be specific — name proof points, metrics, or framings. No fluff.";
      const user = `WIN THEME: ${theme.title}\n${theme.description ?? ""}\n\nTARGET:\n${target}\n\nReturn JSON only.`;

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
        if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace.");
        continue;
      }
      const json = (await res.json()) as any;
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      let hint = "";
      try {
        hint = String(JSON.parse(raw).hint ?? "").trim();
      } catch {
        hint = "";
      }
      if (!hint) continue;

      const { error: upErr } = await supabase
        .from("win_theme_mappings")
        .update({ writer_hint: hint, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (!upErr) updated++;
    }
    return { ok: true, updated };
  });

/**
 * Use AI to extract RFP questions from existing Holy Grail opportunity analysis
 * (evaluation criteria, scored requirements, mandatory requirements).
 */
export const extractRfpQuestionsFromOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ engagementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    const { data: opp } = await supabase
      .from("engagement_research")
      .select("content")
      .eq("engagement_id", data.engagementId)
      .eq("category", "holy_grail_opportunity")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!opp?.content) {
      return { ok: false, created: 0, message: "Run Holy Grail Opportunity first." };
    }

    const sys =
      "You extract RFP questions/requirements from a parsed opportunity analysis. Output STRICT JSON: {\"questions\": [{\"question_number\": string|null, \"title\": string, \"body\": string}]}. Return up to 30 distinct, specific requirements writers would need to answer. Prefer scored/evaluated items.";
    const user = `OPPORTUNITY ANALYSIS:\n${JSON.stringify(opp.content).slice(0, 30000)}`;

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
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace.");
      throw new Error(`AI extraction failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    let parsed: { questions?: Array<{ question_number?: string | null; title?: string; body?: string }> } = {};
    try {
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }
    const list = (parsed.questions ?? []).filter((q) => q.body && q.body.trim().length > 0);
    if (list.length === 0) return { ok: true, created: 0, message: "No questions extracted." };

    const rows = list.map((q, i) => ({
      engagement_id: data.engagementId,
      question_number: q.question_number?.toString().slice(0, 32) ?? null,
      title: (q.title ?? "").slice(0, 500) || null,
      body: q.body!.slice(0, 8000),
      sort_order: i,
    }));

    const { error } = await supabase.from("rfp_questions").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, created: rows.length };
  });
