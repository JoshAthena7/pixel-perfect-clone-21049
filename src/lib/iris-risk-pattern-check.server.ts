// Server-only helper. Fire-and-forget IRIS pattern check for a newly
// generated mission_risks row. Compares the risk against the
// oracle_risk_patterns library, writes a one-line historical note on the
// risk if there's a match, and upserts the pattern library so it stays
// current with every IRIS risk generation.
//
// All failures are logged to the server console and silently swallowed.

type MatchResp = {
  matched?: unknown;
  matched_pattern?: unknown;
  times_seen?: unknown;
  times_materialized?: unknown;
  historical_note?: unknown;
};

export function triggerRiskPatternCheck(args: {
  missionId: string;
  riskId: string;
}): void {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: risk, error: riskErr } = await supabaseAdmin
        .from("mission_risks")
        .select("id, mission_id, title, description, severity")
        .eq("id", args.riskId)
        .maybeSingle();
      if (riskErr || !risk) {
        if (riskErr) console.error("[risk-pattern] fetch failed", riskErr.message);
        return;
      }

      const { data: patterns } = await supabaseAdmin
        .from("oracle_risk_patterns")
        .select("risk_title, times_seen, times_materialized")
        .order("times_seen", { ascending: false })
        .limit(10);

      const apiKey = process.env.LOVABLE_API_KEY;
      const title = (risk as { title: string }).title ?? "";
      const description = (risk as { description: string | null }).description ?? "";

      if (apiKey) {
        const patternBlock =
          (patterns ?? []).length === 0
            ? "(no historical patterns yet)"
            : (patterns as { risk_title: string; times_seen: number; times_materialized: number }[])
                .map(
                  (p, i) =>
                    `${i + 1}. ${p.risk_title} — seen ${p.times_seen}x, materialized ${p.times_materialized}x`,
                )
                .join("\n");

        const system =
          "You are IRIS, the intelligence co-pilot for a government healthcare proposal team. " +
          "Return ONLY valid JSON matching the requested schema.";
        const userMsg =
          "You are comparing a new mission risk against a library of historical risks from past procurements.\n\n" +
          `New risk: ${title} — ${(description ?? "").slice(0, 1500)}\n\n` +
          "Historical risk patterns:\n" +
          patternBlock +
          "\n\n" +
          "Does this new risk match any historical pattern? Return JSON:\n" +
          '{ "matched": boolean, "matched_pattern": string | null, "times_seen": number, "times_materialized": number, ' +
          '"historical_note": string (one sentence for the team, e.g. "Seen in 4 similar missions — materialized twice. Usually addressed by...") }';

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: 400,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
          }),
        });
        if (!res.ok) {
          console.error(
            "[risk-pattern] gateway error",
            res.status,
            await res.text().catch(() => ""),
          );
        } else {
          const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = j.choices?.[0]?.message?.content ?? "";
          const m = content.match(/\{[\s\S]*\}/);
          if (m) {
            let parsed: MatchResp = {};
            try {
              parsed = JSON.parse(m[0]);
            } catch (e) {
              console.error("[risk-pattern] malformed JSON", e);
            }
            if (parsed.matched === true) {
              const note =
                typeof parsed.historical_note === "string"
                  ? parsed.historical_note.slice(0, 400)
                  : null;
              const seen =
                typeof parsed.times_seen === "number" && Number.isFinite(parsed.times_seen)
                  ? Math.max(0, Math.floor(parsed.times_seen))
                  : null;
              const update: { historical_note?: string; times_seen_historically?: number } = {};
              if (note) update.historical_note = note;
              if (seen !== null) update.times_seen_historically = seen;
              if (Object.keys(update).length > 0) {
                const { error: upErr } = await supabaseAdmin
                  .from("mission_risks")
                  .update(update)
                  .eq("id", args.riskId);
                if (upErr) console.error("[risk-pattern] update risk failed", upErr.message);
              }
            }
          }
        }
      } else {
        console.error("[risk-pattern] LOVABLE_API_KEY missing");
      }

      // Upsert the pattern library so it reflects this newly generated risk
      // regardless of whether the AI matched it to an existing pattern.
      await upsertRiskPattern(args.missionId, title);
    } catch (e) {
      console.error("[risk-pattern] unexpected failure", e);
    }
  })();
}

async function upsertRiskPattern(missionId: string, title: string) {
  try {
    if (!title || !title.trim()) return;
    const normalized = title.trim().slice(0, 280);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("oracle_risk_patterns")
      .select("id, times_seen, example_missions")
      .ilike("risk_title", normalized)
      .maybeSingle();

    if (existing) {
      const row = existing as {
        id: string;
        times_seen: number;
        example_missions: string[] | null;
      };
      const missions = Array.isArray(row.example_missions) ? row.example_missions : [];
      const nextMissions = missions.includes(missionId)
        ? missions
        : [...missions, missionId].slice(-25);
      const { error } = await supabaseAdmin
        .from("oracle_risk_patterns")
        .update({
          times_seen: (row.times_seen ?? 0) + 1,
          example_missions: nextMissions,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) console.error("[risk-pattern] pattern update failed", error.message);
    } else {
      const { error } = await supabaseAdmin.from("oracle_risk_patterns").insert({
        risk_title: normalized,
        times_seen: 1,
        example_missions: [missionId],
      });
      if (error) console.error("[risk-pattern] pattern insert failed", error.message);
    }
  } catch (e) {
    console.error("[risk-pattern] upsert unexpected failure", e);
  }
}
