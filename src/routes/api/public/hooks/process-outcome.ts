// /api/public/hooks/process-outcome
// Triggered by db trigger after an engagement_outcome row is inserted.
// 1) Generates a postmortem summary via Lovable AI from engagement data.
// 2) Adjusts insight_type_weights accuracy based on unactioned vs actioned insights.

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-outcome")({
  server: {
    handlers: { POST: handler },
  },
});

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function handler({ request }: { request: Request }) {
  const body = await request.json().catch(() => ({}));
  const { engagement_id, outcome } = body as { engagement_id?: string; outcome?: string };
  if (!engagement_id || !outcome) {
    return Response.json({ error: "engagement_id and outcome required" }, { status: 400 });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const lovableKey = process.env.LOVABLE_API_KEY ?? "";

  // Gather engagement snapshot
  const [{ data: eng }, { data: huddles }, { data: risks }, { data: insights }, { data: heatmap }] = await Promise.all([
    supabase.from("engagements").select("name,client,state,submission_date,engagement_type,contract_value_estimate").eq("id", engagement_id).maybeSingle(),
    supabase.from("huddles").select("priority,risk,notes,needs_leadership,created_at").eq("engagement_id", engagement_id).order("created_at", { ascending: false }).limit(30),
    supabase.from("risks").select("title,severity,status,mitigation").eq("engagement_id", engagement_id),
    supabase.from("intelligence_insights").select("insight_type,title,actioned,confirmed_predictive,severity").eq("engagement_id", engagement_id),
    supabase.from("heatmap_sections").select("section_name,status,notes").eq("engagement_id", engagement_id),
  ]);

  // ---- Generate postmortem
  let summary = `Engagement ${eng?.name ?? engagement_id} closed as ${outcome}.`;
  let lessons: any = {};
  if (lovableKey) {
    try {
      const prompt = `You are Athena. Write a postmortem for this engagement that ended with outcome="${outcome}".
Engagement: ${JSON.stringify(eng)}
Heatmap (final): ${JSON.stringify(heatmap)}
Risks: ${JSON.stringify(risks)}
Recent huddles: ${JSON.stringify((huddles ?? []).slice(0, 15))}
Insights generated during the engagement: ${JSON.stringify(insights)}

Return JSON with: { "summary": string (3-4 sentences, plain English), "lessons_learned": { "what_worked": string[], "what_failed": string[], "do_differently": string[] } }`;
      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You return only valid JSON. No markdown fences." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const j: any = await res.json();
        const txt = (j?.choices?.[0]?.message?.content ?? "").replace(/```json|```/g, "").trim();
        try {
          const parsed = JSON.parse(txt);
          summary = parsed.summary ?? summary;
          lessons = parsed.lessons_learned ?? {};
        } catch { /* keep defaults */ }
      }
    } catch (e) { console.error("postmortem AI error", e); }
  }

  await supabase.from("engagement_postmortems").insert({
    engagement_id,
    outcome,
    summary,
    lessons_learned: lessons,
  });

  // Feed key lessons into content_library
  const lessonItems: string[] = [
    ...((lessons?.what_worked ?? []) as string[]).map((s) => `Worked: ${s}`),
    ...((lessons?.what_failed ?? []) as string[]).map((s) => `Failed: ${s}`),
    ...((lessons?.do_differently ?? []) as string[]).map((s) => `Next time: ${s}`),
  ];
  if (lessonItems.length) {
    await supabase.from("content_library").insert(
      lessonItems.slice(0, 12).map((body) => ({
        title: `${outcome} — ${eng?.name ?? "engagement"}`,
        body,
        category: outcome === "Won" ? "Winning Pattern" : "Lesson Learned",
        source_engagement_id: engagement_id,
        tags: [eng?.state, eng?.engagement_type].filter(Boolean) as string[],
      }))
    );
  }

  // ---- Update insight_type_weights based on actioned + outcome
  const byType = new Map<string, { total: number; correct: number }>();
  for (const i of insights ?? []) {
    const cur = byType.get(i.insight_type) ?? { total: 0, correct: 0 };
    cur.total++;
    // Consider insight "correct" if it was actioned OR confirmed_predictive,
    // and outcome reflects its prediction (warnings predict lost; positive predicts won).
    const wasWarning = ["trajectory_warning","section_risk","client_risk","below_win_curve","capacity_warning"].includes(i.insight_type);
    const predicted = wasWarning ? outcome !== "Won" : outcome === "Won";
    if ((i.actioned || i.confirmed_predictive) && predicted) cur.correct++;
    byType.set(i.insight_type, cur);
  }
  for (const [type, stats] of byType) {
    const { data: w } = await supabase
      .from("insight_type_weights")
      .select("*")
      .eq("insight_type", type)
      .maybeSingle();
    if (w) {
      const newTotal = (w.total_count ?? 0) + stats.total;
      const newCorrect = (w.correct_count ?? 0) + stats.correct;
      await supabase
        .from("insight_type_weights")
        .update({
          total_count: newTotal,
          correct_count: newCorrect,
          accuracy_rate: newTotal > 0 ? Number((newCorrect / newTotal).toFixed(3)) : 0.5,
          updated_at: new Date().toISOString(),
        })
        .eq("insight_type", type);
    }
  }

  return Response.json({ ok: true, lesson_count: lessonItems.length });
}
