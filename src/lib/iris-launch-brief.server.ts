// Server-only helper. Fire-and-forget generation of a historical IRIS
// launch brief when a mission becomes 'active' for the first time.
// Writes one row to public.mission_launch_briefs. All errors are logged.

export function triggerMissionLaunchBrief(args: { missionId: string }): void {
  void (async () => {
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error("[launch-brief] LOVABLE_API_KEY missing");
        return;
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Skip if already exists (one-time)
      const existing = await supabaseAdmin
        .from("mission_launch_briefs")
        .select("id")
        .eq("mission_id", args.missionId)
        .maybeSingle();
      if (existing.data) return;

      const mRes = await supabaseAdmin
        .from("missions")
        .select("name, client_name, contract_value, why_it_matters, program_type")
        .eq("id", args.missionId)
        .maybeSingle();
      const mission = mRes.data as {
        name: string | null;
        client_name: string | null;
        contract_value: number | null;
        why_it_matters: string | null;
        program_type: string | null;
      } | null;
      if (!mission) {
        console.error("[launch-brief] mission not found", args.missionId);
        return;
      }

      const [outcomesRes, patternsRes, kbRes] = await Promise.all([
        supabaseAdmin
          .from("oracle_mission_outcomes")
          .select("outcome, outcome_factor, top_lesson")
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("oracle_risk_patterns")
          .select("risk_title, risk_category, times_seen, times_materialized")
          .order("times_seen", { ascending: false })
          .limit(10),
        mission.program_type
          ? supabaseAdmin
              .from("oracle_knowledge_base")
              .select("core_insight, source_summary, topic_tags, applicable_mission_types")
              .overlaps("applicable_mission_types", [mission.program_type])
              .limit(5)
          : Promise.resolve({ data: [] as Array<{ core_insight: string; source_summary: string | null }> }),
      ]);

      const outcomes = (outcomesRes.data ?? []) as Array<{
        outcome: string | null;
        outcome_factor: string | null;
        top_lesson: string | null;
      }>;
      const patterns = (patternsRes.data ?? []) as Array<{
        risk_title: string;
        risk_category: string | null;
        times_seen: number | null;
        times_materialized: number | null;
      }>;
      const kb = (kbRes.data ?? []) as Array<{
        core_insight: string;
        source_summary: string | null;
      }>;

      const outcomesText =
        outcomes.length === 0
          ? "none"
          : outcomes
              .map(
                (o, i) =>
                  `${i + 1}. outcome=${o.outcome ?? "?"}; factor=${o.outcome_factor ?? "—"}; lesson=${o.top_lesson ?? "—"}`,
              )
              .join("\n");
      const patternsText =
        patterns.length === 0
          ? "none"
          : patterns
              .slice(0, 5)
              .map(
                (p, i) =>
                  `${i + 1}. ${p.risk_title} (seen ${p.times_seen ?? 0}x, materialized ${p.times_materialized ?? 0}x)`,
              )
              .join("\n");
      const kbText =
        kb.length === 0
          ? "none"
          : kb
              .slice(0, 5)
              .map((k, i) => `${i + 1}. ${k.core_insight}${k.source_summary ? ` — ${k.source_summary}` : ""}`)
              .join("\n");

      const userMsg =
        "You are briefing a proposal team that is launching a new government healthcare procurement mission.\n\n" +
        "New mission context:\n" +
        `- Name: ${mission.name ?? "—"}\n` +
        `- Client: ${mission.client_name ?? "—"}\n` +
        `- Contract value: ${mission.contract_value ?? "—"}\n` +
        `- Why it matters: ${mission.why_it_matters ?? "—"}\n\n` +
        "Historical intelligence from past missions:\n" +
        `- Recent outcomes:\n${outcomesText}\n` +
        `- Most common risks:\n${patternsText}\n` +
        `- Relevant knowledge:\n${kbText}\n\n` +
        "Generate a concise launch brief (max 200 words) covering:\n" +
        "1. What has worked on similar missions\n" +
        "2. The top 3 risks to watch based on history\n" +
        "3. One key lesson the team should know going in\n\n" +
        "Return as plain text, written directly to the team.";

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content:
                "You are IRIS, the intelligence co-pilot for a government healthcare proposal team. Write a concise, useful briefing for a launching team.",
            },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        console.error("[launch-brief] gateway error", res.status, await res.text().catch(() => ""));
        return;
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const briefText = (j.choices?.[0]?.message?.content ?? "").trim();
      if (!briefText) {
        console.error("[launch-brief] empty content from gateway");
        return;
      }

      const { error } = await supabaseAdmin.from("mission_launch_briefs").insert({
        mission_id: args.missionId,
        brief_text: briefText,
        generated_by: "iris",
      });
      if (error) console.error("[launch-brief] insert failed:", error.message);
    } catch (e) {
      console.error("[launch-brief] unexpected failure", e);
    }
  })();
}
