// Cron: daily 06:30 EST (11:30 UTC). Generates personalized daily intelligence
// briefs for every active mission team member. Required env: LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

type Json = Record<string, unknown>;

async function callIris(apiKey: string, system: string, user: string): Promise<Json | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) {
      console.error("daily-briefs ai gateway failed", r.status, await r.text().catch(() => ""));
      return null;
    }
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    try { return JSON.parse(content) as Json; } catch { return null; }
  } catch (e) {
    console.error("daily-briefs ai gateway threw", e);
    return null;
  }
}

const ADMIN_SYSTEM = `You are IRIS generating a daily mission intelligence brief for a mission administrator or engagement lead. Be specific, direct, and actionable. Return ONLY valid JSON in this exact format:
{
  "greeting": string,
  "mission_status": string,
  "new_intelligence": [{"headline": string, "why_it_matters": string, "affected_sections": [string], "action": string}],
  "questions_needing_attention": [{"question_number": string, "issue": string, "recommended_action": string}],
  "todays_priority": string,
  "one_risk_to_watch": string,
  "key_intelligence_summary": string
}`;

const CONSULTANT_SYSTEM = `You are IRIS generating a daily mission intelligence brief for a proposal writer or subject matter expert. Focus on their specific assignments. Return ONLY valid JSON:
{
  "greeting": string,
  "your_assignments": [{"question_number": string, "section": string, "health": string, "due_date": string, "days_remaining": number, "confidence": string, "recommended_focus": string}],
  "new_intelligence_for_your_sections": [{"headline": string, "why_it_matters": string, "section": string}],
  "todays_priority": string,
  "one_thing_to_read": string,
  "key_intelligence_summary": string
}`;

function isAdminRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return /admin|engagement|lead|principal|founder/.test(r);
}

export const Route = createFileRoute("/api/public/hooks/generate-daily-briefs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const apiKey = process.env.LOVABLE_API_KEY ?? "";

        const today = new Date().toISOString().slice(0, 10);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: missions } = await supabaseAdmin
          .from("missions")
          .select("id,name,client_name,state,submission_deadline,status")
          .eq("status", "active");

        let createdCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const m of (missions ?? []) as Array<{ id: string; name: string; client_name: string | null; state: string | null; submission_deadline: string | null }>) {
          try {
            const missionId = m.id;
            const daysToSubmission = m.submission_deadline
              ? Math.ceil((new Date(m.submission_deadline).getTime() - Date.now()) / 86400000)
              : null;

            const [membersRes, feedRes, atRiskRes, watchRes] = await Promise.all([
              supabaseAdmin.from("mission_team_members").select("id,member_id,mission_role").eq("mission_id", missionId),
              supabaseAdmin
                .from("intelligence_feed_items")
                .select("headline,iris_assessment,iris_relevance_score,affected_section_ids,source_url")
                .eq("mission_id", missionId)
                .gte("iris_relevance_score", 60)
                .gte("created_at", since)
                .order("iris_relevance_score", { ascending: false })
                .limit(20),
              supabaseAdmin.from("mission_questions").select("question_number,health_status,status").eq("mission_id", missionId).eq("health_status", "red"),
              supabaseAdmin.from("mission_questions").select("question_number,health_status").eq("mission_id", missionId).eq("health_status", "yellow"),
            ]);

            const memberRows = (membersRes.data ?? []) as Array<{ id: string; member_id: string | null; mission_role: string | null }>;
            const feedRows = (feedRes.data ?? []) as Array<{ headline: string; iris_assessment: string | null; affected_section_ids: string[] | null; source_url: string | null }>;
            const atRiskRows = (atRiskRes.data ?? []) as Array<{ question_number: string | null; status: string | null }>;
            const watchRows = (watchRes.data ?? []) as Array<{ question_number: string | null }>;

            for (const member of memberRows) {
              const recipientId = member.member_id;
              if (!recipientId) { skippedCount++; continue; }

              const { data: existing } = await supabaseAdmin
                .from("daily_intelligence_briefs")
                .select("id")
                .eq("recipient_id", recipientId)
                .eq("mission_id", missionId)
                .eq("brief_date", today)
                .maybeSingle();
              if (existing) { skippedCount++; continue; }

              const adminBrief = isAdminRole(member.mission_role);
              const briefType = adminBrief ? "admin_brief" : "consultant_brief";

              const { data: prof } = await supabaseAdmin
                .from("profiles")
                .select("display_name,first_name")
                .eq("id", recipientId)
                .maybeSingle();
              const name = (prof as { display_name?: string; first_name?: string } | null)?.first_name
                ?? (prof as { display_name?: string } | null)?.display_name
                ?? "there";

              const userPrompt = adminBrief
                ? [
                    `Mission: ${m.name}`,
                    `Client: ${m.client_name ?? "—"}`,
                    `State: ${m.state ?? "—"}`,
                    `Days to submission: ${daysToSubmission ?? "—"}`,
                    `At-risk questions (${atRiskRows.length}): ${atRiskRows.map((q) => q.question_number).filter(Boolean).join(", ") || "none"}`,
                    `Watch questions: ${watchRows.length}`,
                    `New feed items last 24h:`,
                    ...feedRows.map((f) => `- ${f.headline} :: ${f.iris_assessment ?? ""}`),
                  ].join("\n")
                : [
                    `User name: ${name}`,
                    `Role: ${member.mission_role ?? "—"}`,
                    `Mission: ${m.name}`,
                    `Mission days to submission: ${daysToSubmission ?? "—"}`,
                    `New feed items last 24h:`,
                    ...feedRows.slice(0, 10).map((f) => `- ${f.headline} :: ${f.iris_assessment ?? ""}`),
                  ].join("\n");

              let aiContent = apiKey
                ? await callIris(apiKey, adminBrief ? ADMIN_SYSTEM : CONSULTANT_SYSTEM, userPrompt)
                : null;

              // Fallback: simplified record without AI synthesis
              if (!aiContent) {
                aiContent = adminBrief
                  ? {
                      greeting: `Good morning, ${name}.`,
                      mission_status: `${m.name} — ${daysToSubmission ?? "?"} days to submission.`,
                      new_intelligence: feedRows.slice(0, 3).map((f) => ({
                        headline: f.headline,
                        why_it_matters: f.iris_assessment ?? "Recent intelligence signal.",
                        affected_sections: [],
                        action: "Review in the Oracle feed.",
                      })),
                      questions_needing_attention: atRiskRows.slice(0, 5).map((q) => ({
                        question_number: q.question_number,
                        issue: `Status ${q.status ?? "at risk"}.`,
                        recommended_action: "Review and reassign if needed.",
                      })),
                      todays_priority: atRiskRows.length ? `Stabilize at-risk questions (${atRiskRows.length}).` : "Maintain momentum on active questions.",
                      one_risk_to_watch: feedRows[0]?.headline ?? "No new intelligence detected.",
                      key_intelligence_summary: `${feedRows.length} new intelligence items, ${atRiskRows.length} at-risk questions.`,
                    }
                  : {
                      greeting: `Good morning, ${name}.`,
                      your_assignments: [],
                      new_intelligence_for_your_sections: feedRows.slice(0, 3).map((f) => ({ headline: f.headline, why_it_matters: f.iris_assessment ?? "", section: "" })),
                      todays_priority: "Continue work on your assigned questions.",
                      one_thing_to_read: feedRows[0]?.headline ?? "No new intelligence today.",
                      key_intelligence_summary: `${feedRows.length} new intelligence items relevant to your sections.`,
                    };
              }

              const summary = String((aiContent as Json).key_intelligence_summary ?? "Your daily intelligence brief is ready.");

              const { data: inserted, error: insertErr } = await supabaseAdmin
                .from("daily_intelligence_briefs")
                .insert({
                  mission_id: missionId,
                  recipient_id: recipientId,
                  brief_date: today,
                  brief_type: briefType,
                  content: aiContent as unknown as never,
                  key_intelligence_summary: summary,
                  new_feed_items_count: feedRows.length,
                  at_risk_questions_count: atRiskRows.length,
                  is_delivered: true,
                  delivered_at: new Date().toISOString(),
                })
                .select("id")
                .single();

              if (insertErr) { failedCount++; console.error("brief insert failed", insertErr); continue; }
              createdCount++;

              await supabaseAdmin.from("atlas_notifications").insert({
                recipient_id: recipientId,
                recipient_role: member.mission_role ?? "team_member",
                type: "iris_alert",
                message: `Your daily intelligence brief is ready. ${summary}`,
                metadata: { mission_id: missionId, brief_id: (inserted as { id: string } | null)?.id ?? null },
              }).then(undefined, (e) => console.error("notification insert failed", e));
            }

            // Fire daily Athena Insight generation (do not block on it)
            try {
              const { buildAthenaInsight } = await import("@/lib/athena-insights.functions");
              (buildAthenaInsight as any)({ data: { missionId, type: "daily" } })
                .catch((e: unknown) => console.error("daily athena insight failed", missionId, e));
            } catch (e) {
              console.error("daily athena insight import failed", e);
            }
          } catch (err) {
            failedCount++;
            console.error("generate-daily-briefs mission failed", m.id, err);
          }
        }

        const result = { ok: true, created: createdCount, skipped: skippedCount, failed: failedCount, missions: (missions ?? []).length, since, in7days };
        console.log("generate-daily-briefs", result);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
