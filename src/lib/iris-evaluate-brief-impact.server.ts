// Server-only helper. Fire-and-forget evaluation of a high-significance
// intel_event against the current Mission Brief sections (North Star,
// Win Themes, Flight Risks). On a material hit, inserts a row into
// public.brief_update_signals so the Brief UI can surface an amber dot.
//
// All failures are logged to the server console and silently swallowed.

const SECTIONS = ["north_star", "win_themes", "flight_risks", "none"] as const;
type Section = (typeof SECTIONS)[number];

export function triggerBriefImpactEvaluation(args: {
  missionId: string;
  intelEventId: string;
  title: string;
  content: string;
}): void {
  void (async () => {
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error("[brief-impact] LOVABLE_API_KEY missing");
        return;
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [mRes, tRes, rRes] = await Promise.all([
        supabaseAdmin.from("missions").select("north_star").eq("id", args.missionId).maybeSingle(),
        supabaseAdmin
          .from("mission_win_themes")
          .select("title")
          .eq("mission_id", args.missionId)
          .limit(20),
        supabaseAdmin
          .from("mission_risks")
          .select("title")
          .eq("mission_id", args.missionId)
          .limit(20),
      ]);

      const northStar = (mRes.data as { north_star: string | null } | null)?.north_star ?? "not set";
      const winThemes = ((tRes.data ?? []) as { title: string }[]).map((t) => t.title).filter(Boolean).join(", ") || "none";
      const flightRisks = ((rRes.data ?? []) as { title: string }[]).map((r) => r.title).filter(Boolean).join(", ") || "none";

      const system =
        "You are IRIS, the intelligence co-pilot for a government healthcare proposal team. " +
        "Return ONLY valid JSON matching the requested schema.";
      const userMsg =
        "A new high-significance intelligence event has arrived for a government healthcare procurement mission.\n\n" +
        `Intel event: ${args.title} — ${(args.content ?? "").slice(0, 2000)}\n\n` +
        "Current Mission Brief sections:\n" +
        `- North Star: ${northStar}\n` +
        `- Win Themes: ${winThemes}\n` +
        `- Flight Risks: ${flightRisks}\n\n` +
        "Does this intel event materially impact any of these Brief sections? Return JSON:\n" +
        '{ "affected_sections": [] (array of: "north_star" | "win_themes" | "flight_risks" | "none"), ' +
        '"reason": string (one sentence why) }';

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
        console.error("[brief-impact] gateway error", res.status, await res.text().catch(() => ""));
        return;
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = j.choices?.[0]?.message?.content ?? "";
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return;
      let parsed: { affected_sections?: unknown; reason?: unknown };
      try {
        parsed = JSON.parse(m[0]);
      } catch (e) {
        console.error("[brief-impact] malformed JSON", e);
        return;
      }
      const sections = Array.isArray(parsed.affected_sections)
        ? (parsed.affected_sections.map(String).filter((s) => SECTIONS.includes(s as Section)) as Section[])
        : [];
      const real = sections.filter((s) => s !== "none");
      if (real.length === 0) return;
      const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 600) : null;

      const { error } = await supabaseAdmin.from("brief_update_signals").insert({
        mission_id: args.missionId,
        intel_event_id: args.intelEventId,
        affected_sections: real,
        reason,
      });
      if (error) console.error("[brief-impact] insert failed:", error.message);
    } catch (e) {
      console.error("[brief-impact] unexpected failure", e);
    }
  })();
}
