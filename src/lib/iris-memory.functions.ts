import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CATEGORIES = [
  "Firm Intelligence",
  "Competitive Intel",
  "Win Strategies",
  "State Knowledge",
  "Client Intelligence",
  "Proposal Lessons",
  "IRIS Preferences",
  "Compliance",
  "Relationships",
  "Other",
] as const;

const IMPORTANCE = ["critical", "preferred", "reference"] as const;
const SCOPE = ["global", "mission"] as const;

async function callGateway(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/* ───────── IRIS analyzes pasted content ───────── */

export const irisAnalyzeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      content: z.string().min(10).max(20000),
      source: z.string().max(500).optional(),
      missionContext: z
        .object({ id: z.string().uuid(), name: z.string() })
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sys = `You are IRIS — Athena Strategy Group's institutional memory analyst. A leader is teaching you something. Your job is to read the content and structure it as a memory.

Return STRICT JSON only (no markdown fences). Schema:
{
  "title": "concise 5-10 word title",
  "summary": "2-3 sentence summary of what IRIS will remember",
  "category": "one of: ${CATEGORIES.join(", ")}",
  "tags": ["3-6 short tags, e.g. 'Indiana', 'BH Integration', 'Competitor A'"],
  "importance": "critical | preferred | reference",
  "scope": "global | mission",
  "reasoning": "1-2 sentences explaining your category, importance, and scope choices"
}

Importance rubric:
- critical: firm-wide non-negotiable rule, always must inform proposal decisions
- preferred: strong guidance IRIS uses when relevant
- reference: background context

Scope rubric:
- global: applies across all missions and future work
- mission: specific to one named mission${data.missionContext ? ` (current context: ${data.missionContext.name})` : ""}`;

    const user = `Source: ${data.source ?? "(not provided)"}\n\nContent:\n${data.content}`;
    const raw = await callGateway(sys, user);
    if (!raw) {
      return {
        title: data.content.slice(0, 60),
        summary: data.content.slice(0, 240),
        category: "Other",
        tags: [] as string[],
        importance: "reference" as const,
        scope: "global" as const,
        reasoning: "IRIS is not configured; defaults applied. Edit before saving.",
      };
    }
    // Try to parse — be forgiving about ```json fences
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        title: String(parsed.title ?? "").slice(0, 200) || "Untitled memory",
        summary: String(parsed.summary ?? "").slice(0, 1000),
        category: (CATEGORIES as readonly string[]).includes(parsed.category)
          ? parsed.category
          : "Other",
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.slice(0, 10).map((t: any) => String(t).slice(0, 40))
          : [],
        importance: (IMPORTANCE as readonly string[]).includes(parsed.importance)
          ? (parsed.importance as (typeof IMPORTANCE)[number])
          : ("reference" as const),
        scope: (SCOPE as readonly string[]).includes(parsed.scope)
          ? (parsed.scope as (typeof SCOPE)[number])
          : ("global" as const),
        reasoning: String(parsed.reasoning ?? "").slice(0, 600),
      };
    } catch {
      return {
        title: data.content.slice(0, 60),
        summary: raw.slice(0, 500),
        category: "Other",
        tags: [],
        importance: "reference" as const,
        scope: "global" as const,
        reasoning: "IRIS returned unstructured output. Defaults applied.",
      };
    }
  });

/* ───────── Save memory ───────── */

export const saveIrisMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(20000),
      summary: z.string().max(2000).optional().nullable(),
      category: z.string().max(80),
      tags: z.array(z.string().max(40)).max(20),
      importance: z.enum(IMPORTANCE),
      scope: z.enum(SCOPE),
      missionId: z.string().uuid().optional().nullable(),
      source: z.string().max(500).optional().nullable(),
      irisReasoning: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      title: data.title,
      content: data.content,
      summary: data.summary ?? null,
      category: data.category,
      tags: data.tags,
      importance: data.importance,
      scope: data.scope,
      mission_id: data.scope === "mission" ? data.missionId ?? null : null,
      source: data.source ?? null,
      iris_reasoning: data.irisReasoning ?? null,
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("iris_memories")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await supabase
      .from("iris_memories")
      .insert({ ...payload, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/* ───────── Archive / restore ───────── */

export const archiveIrisMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), archive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("iris_memories")
      .update({ archived_at: data.archive ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIrisMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("iris_memories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────── Helper: fetch memory context for an IRIS prompt ─────────
   Used by Ask IRIS / briefs to inject institutional knowledge. */

export async function fetchIrisMemoryContext(
  supabase: any,
  opts: { missionId?: string | null },
): Promise<{ block: string; ids: string[] }> {
  // 1) All critical global (always included)
  const { data: critical } = await supabase
    .from("iris_memories")
    .select("id,title,summary,content,importance,scope,tags")
    .is("archived_at", null)
    .eq("scope", "global")
    .eq("importance", "critical")
    .limit(30);

  // 2) Preferred global (cap)
  const { data: preferred } = await supabase
    .from("iris_memories")
    .select("id,title,summary,content,importance,scope,tags")
    .is("archived_at", null)
    .eq("scope", "global")
    .eq("importance", "preferred")
    .order("usage_count", { ascending: false })
    .limit(20);

  // 3) Mission-specific (if missionId)
  let mission: any[] = [];
  if (opts.missionId) {
    const { data } = await supabase
      .from("iris_memories")
      .select("id,title,summary,content,importance,scope,tags")
      .is("archived_at", null)
      .eq("scope", "mission")
      .eq("mission_id", opts.missionId)
      .limit(30);
    mission = data ?? [];
  }

  const all = [
    ...(critical ?? []).map((m: any) => ({ ...m, _bucket: "CRITICAL · GLOBAL" })),
    ...mission.map((m: any) => ({ ...m, _bucket: "MISSION MEMORY" })),
    ...(preferred ?? []).map((m: any) => ({ ...m, _bucket: "PREFERRED · GLOBAL" })),
  ];

  if (all.length === 0) return { block: "", ids: [] };

  const lines = all.map((m) => {
    const body = (m.summary || m.content || "").toString().slice(0, 600);
    return `- [${m._bucket}] ${m.title}: ${body}`;
  });

  const block = `INSTITUTIONAL MEMORY (Athena Strategy Group leadership has taught you these — Critical entries must always inform your response; never contradict a Critical memory without flagging the conflict):\n${lines.join("\n")}`;
  return { block, ids: all.map((m) => m.id) };
}

/* ───────── Log usage (called by IRIS handlers after a response) ───────── */

export async function logIrisMemoryUsage(
  supabase: any,
  memoryIds: string[],
  ctx: { missionId?: string | null; questionId?: string | null; context?: string },
) {
  if (memoryIds.length === 0) return;
  try {
    const rows = memoryIds.map((id) => ({
      memory_id: id,
      mission_id: ctx.missionId ?? null,
      question_id: ctx.questionId ?? null,
      context: ctx.context ?? null,
    }));
    await supabase.from("iris_memory_usage").insert(rows);
    // Bump usage counters and last_used_at. usage_count increments via individual updates.
    const now = new Date().toISOString();
    for (const id of memoryIds) {
      const { data: cur } = await supabase
        .from("iris_memories")
        .select("usage_count")
        .eq("id", id)
        .maybeSingle();
      await supabase
        .from("iris_memories")
        .update({ usage_count: (cur?.usage_count ?? 0) + 1, last_used_at: now })
        .eq("id", id);
    }
  } catch {
    // best-effort logging; never block the IRIS answer
  }
}
