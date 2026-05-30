// /api/public/hooks/weekly-brief
// Aggregates the week's intelligence into a single executive brief
// and stores it as an info-level insight at the firm level (engagement_id=null).

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/weekly-brief")({
  server: { handlers: { POST: handler, GET: handler } },
});

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const lovableKey = process.env.LOVABLE_API_KEY ?? "";
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: insights }, { data: market }, { data: outcomes }] = await Promise.all([
    supabase.from("intelligence_insights").select("insight_type,title,body,severity,created_at,engagement_id").gte("created_at", since),
    supabase.from("market_intelligence").select("source,title,summary,relevant_states,published_at").gte("ingested_at", since).order("ingested_at", { ascending: false }).limit(40),
    supabase.from("engagement_outcomes").select("engagement_id,outcome,recorded_at").gte("recorded_at", since),
  ]);

  let body = "Weekly intelligence digest";
  if (lovableKey) {
    const prompt = `You are Athena. Write a crisp executive weekly brief for a proposal firm. Sections: (1) Top 3 risks this week, (2) Notable wins/losses, (3) Market signals worth attention, (4) Suggested actions. Be terse — no fluff. Max 400 words.

Insights generated this week: ${JSON.stringify(insights)}
Market intel ingested this week: ${JSON.stringify((market ?? []).slice(0, 20))}
Outcomes this week: ${JSON.stringify(outcomes)}`;
    try {
      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const j: any = await res.json();
        body = (j?.choices?.[0]?.message?.content ?? body).trim();
      }
    } catch (e) { console.error("weekly brief ai err", e); }
  }

  await supabase.from("intelligence_insights").insert({
    engagement_id: null,
    insight_type: "systemic_issue",
    title: `Weekly brief — week of ${new Date().toISOString().slice(0,10)}`,
    body,
    severity: "info",
    confidence_score: 0.9,
    supporting_data: {
      insight_count: insights?.length ?? 0,
      market_count: market?.length ?? 0,
      outcome_count: outcomes?.length ?? 0,
    },
  });

  return Response.json({ ok: true });
}
