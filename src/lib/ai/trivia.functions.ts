import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Friendly state-name lookup. Falls back to the code if not in the map.
const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",
  SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

/**
 * Generate ~40 state-specific trivia questions via Lovable AI and insert into
 * state_trivia_bank. Idempotent: no-ops if the state already has >= minCount entries.
 * Uses the admin client (RLS bypassed) since auth users have read-only access.
 */
export const seedStateTrivia = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      state: z.string().min(2).max(3),
      count: z.number().min(10).max(60).default(40),
      minCount: z.number().min(0).max(60).default(20),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const stateCode = data.state.toUpperCase();
    const stateName = STATE_NAMES[stateCode] ?? stateCode;

    // Skip if already seeded enough
    const { count: existing } = await supabaseAdmin
      .from("state_trivia_bank")
      .select("id", { count: "exact", head: true })
      .eq("state", stateCode);
    if ((existing ?? 0) >= data.minCount) {
      return { ok: true, skipped: true, existing: existing ?? 0 };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    const system = `You generate fun, accurate, multiple-choice trivia questions about a US state for a workplace team contest.

Rules:
- Mix categories: geography, history, food, sports, music, famous people, landmarks, industry, fun facts.
- Each question has exactly 4 plausible choices. Only one is correct.
- correct_index is 0-3.
- Add a short, interesting explanation (1-2 sentences) for the correct answer.
- Keep questions PG-rated and politically neutral. No partisan content.
- Verify facts; do not invent statistics. Prefer well-known, easily verifiable trivia.
- Do not duplicate questions.

Return STRICT JSON: { "questions": [ { "question": string, "choices": [string,string,string,string], "correct_index": 0|1|2|3, "explanation": string } ] }`;

    const user = `Generate ${data.count} trivia questions about ${stateName} (${stateCode}). Return the JSON object now.`;

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`Trivia generation failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned malformed trivia.");
    }

    const items: any[] = Array.isArray(parsed.questions) ? parsed.questions : [];
    const rows = items
      .filter((q) =>
        typeof q?.question === "string" &&
        Array.isArray(q?.choices) &&
        q.choices.length === 4 &&
        q.choices.every((c: any) => typeof c === "string") &&
        Number.isInteger(q?.correct_index) &&
        q.correct_index >= 0 && q.correct_index < 4,
      )
      .map((q) => ({
        state: stateCode,
        question: q.question.trim().slice(0, 500),
        choices: q.choices.map((c: string) => c.trim().slice(0, 200)),
        correct_index: q.correct_index,
        explanation: typeof q.explanation === "string" ? q.explanation.trim().slice(0, 600) : null,
      }));

    if (!rows.length) throw new Error("AI returned no valid trivia questions.");

    const { error } = await supabaseAdmin.from("state_trivia_bank").insert(rows);
    if (error) throw new Error(error.message);

    return { ok: true, inserted: rows.length, state: stateCode };
  });
