// Server-only helper. Fire-and-forget logging of SOS escalations to
// oracle_escalation_log + IRIS pattern check. All errors are logged.

export function logEscalationAndCheckPattern(args: {
  missionId: string;
  submittedBy: string;
  escalationType: string | null;
  contextSummary: string;
  sosUpdateId: string;
}): void {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Mission phase = current in_progress milestone type, if any
      let missionPhase: string | null = null;
      try {
        const { data: ms } = await supabaseAdmin
          .from("mission_milestones")
          .select("milestone_type")
          .eq("mission_id", args.missionId)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        missionPhase = (ms as { milestone_type: string | null } | null)?.milestone_type ?? null;
      } catch (e) {
        console.error("[escalation-log] phase lookup failed", e);
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("oracle_escalation_log")
        .insert({
          mission_id: args.missionId,
          submitted_by: args.submittedBy,
          escalation_type: args.escalationType,
          context_summary: args.contextSummary,
          mission_phase: missionPhase,
          sos_update_id: args.sosUpdateId,
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("[escalation-log] insert failed", insErr.message);
        return;
      }
      const logId = (inserted as { id: string }).id;

      // Pattern check
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error("[escalation-log] LOVABLE_API_KEY missing — skipping pattern check");
        return;
      }

      let history: Array<{ context_summary: string | null; resolution: string | null }> = [];
      if (args.escalationType) {
        const { data } = await supabaseAdmin
          .from("oracle_escalation_log")
          .select("context_summary, resolution")
          .eq("escalation_type", args.escalationType)
          .neq("id", logId)
          .order("created_at", { ascending: false })
          .limit(5);
        history = (data ?? []) as typeof history;
      }
      const historyText =
        history.length === 0
          ? "none"
          : history
              .map(
                (h, i) =>
                  `${i + 1}. context=${(h.context_summary ?? "").slice(0, 200)}; resolution=${(h.resolution ?? "—").slice(0, 200)}`,
              )
              .join("\n");

      const userMsg =
        "A team has submitted an SOS escalation on a government healthcare procurement mission.\n\n" +
        `Escalation type: ${args.escalationType ?? "unspecified"}\n` +
        `Context: ${args.contextSummary}\n` +
        `Mission phase: ${missionPhase ?? "unknown"}\n\n` +
        `Historical escalations of this type:\n${historyText}\n\n` +
        "In one sentence, is there a pattern here the team should know about? Return JSON:\n" +
        '{ "pattern_detected": boolean, "note": string | null }';

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini"
          max_tokens: 200,
          messages: [
            {
              role: "system",
              content:
                "You are IRIS, the intelligence co-pilot for a government healthcare proposal team. Return ONLY valid JSON.",
            },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        console.error("[escalation-log] gateway error", res.status, await res.text().catch(() => ""));
        return;
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = j.choices?.[0]?.message?.content ?? "";
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return;
      let parsed: { pattern_detected?: unknown; note?: unknown };
      try {
        parsed = JSON.parse(m[0]);
      } catch (e) {
        console.error("[escalation-log] malformed JSON", e);
        return;
      }
      if (parsed.pattern_detected !== true) return;
      const note = typeof parsed.note === "string" ? parsed.note.slice(0, 600) : null;
      if (!note) return;

      const { error: upErr } = await supabaseAdmin
        .from("oracle_escalation_log")
        .update({ pattern_note: note })
        .eq("id", logId);
      if (upErr) console.error("[escalation-log] pattern update failed", upErr.message);
    } catch (e) {
      console.error("[escalation-log] unexpected failure", e);
    }
  })();
}
