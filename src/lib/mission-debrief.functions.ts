import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DebriefInput = z.object({
  missionId: z.string().uuid(),
  outcome: z.enum(["won", "lost"]),
  scoredWell: z.string().max(4000).optional(),
  missed: z.string().max(4000).optional(),
  evaluatorFeedback: z.string().max(8000).optional(),
  lessonsLearned: z.string().max(8000).optional(),
});

export const saveDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DebriefInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("mission_debriefs")
      .upsert({
        mission_id: data.missionId,
        outcome: data.outcome,
        scored_well: data.scoredWell ?? null,
        missed: data.missed ?? null,
        evaluator_feedback: data.evaluatorFeedback ?? null,
        lessons_learned: data.lessonsLearned ?? null,
        captured_by: userId,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "mission_id" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const generateCanonSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ debriefId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: debrief } = await supabase
      .from("mission_debriefs").select("*,missions(name,client,program_type)").eq("id", data.debriefId).maybeSingle();
    if (!debrief) throw new Error("Debrief not found");

    const suggestions = await synthesizeCanonSuggestions(debrief);
    if (suggestions.length === 0) return { count: 0 };

    const rows = suggestions.map((s) => ({
      mission_id: debrief.mission_id,
      debrief_id: debrief.id,
      title: s.title,
      body: s.body,
      category: s.category ?? null,
      status: "pending",
    }));
    await supabase.from("canon_suggestions").insert(rows);
    return { count: rows.length };
  });

export const approveCanonItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("canon_suggestions").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Suggestion not found");

    if (data.approve) {
      // Promote to intelligence_canon as a universal item.
      await supabase.from("intelligence_canon").insert({
        topic: row.title,
        content: row.body,
        category: row.category ?? "Lessons Learned",
        priority: 3,
        universal: true,
      } as any).then(() => null, () => null);
    }
    await supabase.from("canon_suggestions").update({
      status: data.approve ? "approved" : "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { ok: true };
  });

async function synthesizeCanonSuggestions(debrief: any): Promise<Array<{ title: string; body: string; category?: string }>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    // Deterministic fallback — one suggestion per non-empty field.
    const out: Array<{ title: string; body: string; category?: string }> = [];
    if (debrief.scored_well) out.push({ title: "What scored well", body: debrief.scored_well, category: "Lessons Learned" });
    if (debrief.missed) out.push({ title: "What missed", body: debrief.missed, category: "Lessons Learned" });
    if (debrief.lessons_learned) out.push({ title: "Lessons learned", body: debrief.lessons_learned, category: "Lessons Learned" });
    return out;
  }
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: 'You convert mission debriefs into 3-5 short, durable Canon items for Athena Strategy Group. Each item is a firm-wide rule, reference, or lesson worth memorizing. Return STRICT JSON: { "items": [{"title": string, "body": string, "category": "Lessons Learned" | "CMS Guidance" | "State Procurement" | "Win Themes"}] }. No prose outside JSON.' },
          { role: "user", content: JSON.stringify(debrief).slice(0, 12000) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 5) : [];
  } catch {
    return [];
  }
}
