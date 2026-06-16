// Server-only helper. Fire-and-forget extraction & logging of SME
// Phone-a-Friend sessions. Writes oracle_sme_sessions and upserts
// oracle_sme_profiles. All errors are logged; never blocks the caller.

export function recordSmeSession(args: {
  missionId: string;
  requestingUserId: string;
  smeUserId: string;
  smeName: string;
  smeTitle?: string | null;
  smeOrganization?: string | null;
  sessionContent: string;
}): void {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Ensure SME profile row exists (we need its id for the session FK)
      let smeProfileId: string | null = null;
      {
        const existing = await supabaseAdmin
          .from("oracle_sme_profiles")
          .select("id")
          .eq("user_id", args.smeUserId)
          .maybeSingle();
        if (existing.data?.id) {
          smeProfileId = existing.data.id as string;
        } else {
          const created = await supabaseAdmin
            .from("oracle_sme_profiles")
            .insert({
              user_id: args.smeUserId,
              name: args.smeName,
              title: args.smeTitle ?? null,
              organization: args.smeOrganization ?? null,
              domain_tags: [],
              mission_types_supported: [],
              total_sessions: 0,
              total_questions_answered: 0,
            })
            .select("id")
            .single();
          if (created.error) {
            console.error("[sme-session] create profile failed", created.error.message);
            return;
          }
          smeProfileId = (created.data as { id: string }).id;
        }
      }
      if (!smeProfileId) return;

      // Get mission program_type for default mission_types fallback
      const { data: mission } = await supabaseAdmin
        .from("missions")
        .select("program_type")
        .eq("id", args.missionId)
        .maybeSingle();
      const missionProgramType = (mission as { program_type: string | null } | null)?.program_type ?? null;

      // Summarize via Lovable AI
      let topic = "SME consultation";
      let questionSummary = args.sessionContent.slice(0, 240);
      let answerSummary = "";
      let domainTags: string[] = [];
      let missionTypes: string[] = missionProgramType ? [missionProgramType] : [];

      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        try {
          const userMsg =
            "Summarize this SME interaction from a government healthcare procurement session.\n\n" +
            `Session content: ${args.sessionContent.slice(0, 4000)}\n` +
            `SME name: ${args.smeName}\n` +
            `SME role: ${args.smeTitle ?? "unspecified"}\n\n` +
            "Return JSON: { topic: string (brief topic label), question_summary: string (one sentence), " +
            "answer_summary: string (2-3 sentences — the core knowledge), domain_tags: string[] " +
            "(e.g. 'CSOC','workforce','compliance'), mission_types: string[] (procurement types this applies to) }";
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 500,
              messages: [
                {
                  role: "system",
                  content:
                    "You are IRIS. Extract SME knowledge from a Phone-a-Friend session. Return ONLY valid JSON.",
                },
                { role: "user", content: userMsg },
              ],
            }),
          });
          if (!res.ok) {
            console.error("[sme-session] gateway error", res.status, await res.text().catch(() => ""));
          } else {
            const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
            const content = j.choices?.[0]?.message?.content ?? "";
            const m = content.match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]) as {
                topic?: unknown;
                question_summary?: unknown;
                answer_summary?: unknown;
                domain_tags?: unknown;
                mission_types?: unknown;
              };
              if (typeof parsed.topic === "string") topic = parsed.topic.slice(0, 200);
              if (typeof parsed.question_summary === "string") questionSummary = parsed.question_summary.slice(0, 600);
              if (typeof parsed.answer_summary === "string") answerSummary = parsed.answer_summary.slice(0, 1200);
              if (Array.isArray(parsed.domain_tags)) {
                domainTags = parsed.domain_tags.map(String).filter(Boolean).slice(0, 10);
              }
              if (Array.isArray(parsed.mission_types)) {
                const tags = parsed.mission_types.map(String).filter(Boolean).slice(0, 10);
                if (tags.length) missionTypes = tags;
              }
            }
          }
        } catch (e) {
          console.error("[sme-session] AI summarize failed", e);
        }
      } else {
        console.error("[sme-session] LOVABLE_API_KEY missing — using fallback summary");
      }

      // Insert session
      const { error: sErr } = await supabaseAdmin.from("oracle_sme_sessions").insert({
        mission_id: args.missionId,
        sme_id: smeProfileId,
        requesting_user_id: args.requestingUserId,
        topic,
        question_summary: questionSummary,
        answer_summary: answerSummary,
        domain_tags: domainTags,
      });
      if (sErr) {
        console.error("[sme-session] session insert failed", sErr.message);
      }

      // Upsert profile counters & tag merges
      const { data: prof } = await supabaseAdmin
        .from("oracle_sme_profiles")
        .select("domain_tags, mission_types_supported, total_sessions, total_questions_answered")
        .eq("id", smeProfileId)
        .maybeSingle();
      const existingTags = new Set<string>(
        ((prof as { domain_tags: string[] | null } | null)?.domain_tags ?? []).filter(Boolean),
      );
      domainTags.forEach((t) => existingTags.add(t));
      const existingMt = new Set<string>(
        ((prof as { mission_types_supported: string[] | null } | null)?.mission_types_supported ?? []).filter(Boolean),
      );
      missionTypes.forEach((t) => existingMt.add(t));
      const total_sessions =
        ((prof as { total_sessions: number | null } | null)?.total_sessions ?? 0) + 1;
      const total_questions_answered =
        ((prof as { total_questions_answered: number | null } | null)?.total_questions_answered ?? 0) + 1;

      const { error: pErr } = await supabaseAdmin
        .from("oracle_sme_profiles")
        .update({
          domain_tags: Array.from(existingTags),
          mission_types_supported: Array.from(existingMt),
          total_sessions,
          total_questions_answered,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", smeProfileId);
      if (pErr) console.error("[sme-session] profile upsert failed", pErr.message);
    } catch (e) {
      console.error("[sme-session] unexpected failure", e);
    }
  })();
}
