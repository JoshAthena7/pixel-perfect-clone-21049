/**
 * Fire-and-forget IRIS scan of newly-seeded intelligence network URLs.
 * Called from the wizard after URLs are inserted into intel_sources.
 * Writes one intel_events row per URL (event_type='extraction',
 * source_type='web_monitor').
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  missionId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(200),
});

export const scanSeededIntelSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Fire-and-forget on the server; return immediately.
    void (async () => {
      try {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          console.error("[intel-seed-scan] LOVABLE_API_KEY missing");
          return;
        }
        const { supabase, userId } = context;

        const { data: mission } = await supabase
          .from("missions")
          .select("name")
          .eq("id", data.missionId)
          .maybeSingle();
        const missionName = mission?.name ?? "this mission";

        const userMsg =
          `You are IRIS. The following URLs have just been seeded into the intelligence network for mission: ${missionName}.\n\n` +
          `URLs: ${data.urls.join(", ")}\n\n` +
          `For each URL, extract: organization name, primary focus area, key individuals mentioned, relevance to government healthcare procurement. ` +
          `Return a JSON array where each item is { "url": string, "organization": string, "focus": string, "people": string[], "summary": string }. ` +
          `Keep "summary" to 2-3 sentences. Return ONLY the JSON array, no commentary.`;

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You are IRIS, the intelligence co-pilot for a government healthcare proposal team. Respond with valid JSON only.",
              },
              { role: "user", content: userMsg },
            ],
          }),
        });
        if (!res.ok) {
          console.error("[intel-seed-scan] gateway error", res.status, await res.text().catch(() => ""));
          return;
        }
        const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = (j.choices?.[0]?.message?.content ?? "").trim();
        const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
        let parsed: Array<{ url: string; organization?: string; focus?: string; people?: string[]; summary?: string }>;
        try {
          parsed = JSON.parse(clean);
        } catch {
          console.error("[intel-seed-scan] invalid JSON from IRIS");
          return;
        }
        if (!Array.isArray(parsed)) return;

        for (const item of parsed) {
          if (!item?.url) continue;
          const title = item.organization?.trim() || item.url;
          const summary = (item.summary ?? "").trim();
          const focus = (item.focus ?? "").trim();
          const people = Array.isArray(item.people) ? item.people.filter(Boolean) : [];
          const content =
            (summary || "Initial scan completed.") +
            (focus ? `\n\nFocus: ${focus}` : "") +
            (people.length ? `\n\nKey people: ${people.join(", ")}` : "") +
            `\n\nSource: ${item.url}`;
          const { error } = await supabase.from("intel_events").insert({
            mission_id: data.missionId,
            event_type: "extraction",
            source_type: "web_monitor",
            title: `Initial scan: ${title}`,
            content,
            confidence: "low",
            generated_by: "iris",
            tags: ["initial_scan", "intel_network_seed"],
          });
          if (error) console.error("[intel-seed-scan] insert event failed", error.message);
        }
        void userId;
      } catch (e) {
        console.error("[intel-seed-scan] unexpected failure", e);
      }
    })();

    return { ok: true };
  });
