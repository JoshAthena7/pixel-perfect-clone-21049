// Parse an uploaded Mission Setup Record (.docx text) with IRIS™ and write
// the extracted fields onto the missions row. Admin-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  doc_text: z.string().trim().min(200).max(120_000),
});

const SYSTEM = `You are IRIS, the intelligence engine for ATLAS. You are reading a "Mission Setup Record" document for a government RFP capture and must extract structured fields.

Return ONLY valid JSON matching this exact shape — no prose, no markdown, no code fences. Use null for missing scalar fields and [] for missing arrays. Do not invent data.

{
  "name": string|null,                  // Mission name
  "client": string|null,                // Client / prime contractor
  "state_agency": string|null,          // Issuing agency
  "program_type": string|null,
  "incumbent_name": string|null,
  "contract_value": string|null,
  "submission_date": string|null,       // ISO date YYYY-MM-DD if a clear submission/due date appears
  "mission_highlights": string|null,    // 1-3 short paragraphs summarising mission overview/significance
  "client_strengths": string|null,      // paragraph or bulletized text of client strengths
  "client_win_strategy": string|null,   // central claim / win strategy paragraph
  "program_goals": string|null,         // program outcomes / goals paragraph
  "key_requirements": string[],         // requirement list (short phrases)
  "win_themes": string[],               // win theme list (short phrases)
  "competitors": string[],              // known competitor names only
  "discriminators": string[],           // our differentiators / what sets us apart (short phrases)
  "proof_points": string[],             // evidence, case studies, metrics that back our claims (short phrases)
  "client_priorities": string[],        // what the client/agency cares about most (short phrases)
  "risks": string[],                    // capture/competitive risks (short phrases)
  "focus_areas": string[],              // sensitivities / focus areas (short phrases)
  "sensitivities_note": string|null,    // free-text: topics/terms IRIS should treat carefully
  "language_guidance": string|null,     // free-text: tone, voice, phrasing rules
  "things_to_avoid": string|null,       // free-text: words/positions/claims to avoid
  "things_to_reinforce": string|null    // free-text: themes/messages to reinforce
}`;


type Parsed = {
  name: string | null;
  client: string | null;
  state_agency: string | null;
  program_type: string | null;
  incumbent_name: string | null;
  contract_value: string | null;
  submission_date: string | null;
  mission_highlights: string | null;
  client_strengths: string | null;
  client_win_strategy: string | null;
  program_goals: string | null;
  key_requirements: string[];
  win_themes: string[];
  competitors: string[];
  discriminators: string[];
  proof_points: string[];
  client_priorities: string[];
  risks: string[];
  focus_areas: string[];
  sensitivities_note: string | null;
  language_guidance: string | null;
  things_to_avoid: string | null;
  things_to_reinforce: string | null;
};


function s(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function arr(v: unknown, max = 40): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);
}
function tryParse(raw: string): Parsed | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const j = JSON.parse(cleaned);
    return {
      name: s(j.name, 200),
      client: s(j.client, 300),
      state_agency: s(j.state_agency, 300),
      program_type: s(j.program_type, 200),
      incumbent_name: s(j.incumbent_name, 300),
      contract_value: s(j.contract_value, 100),
      submission_date: s(j.submission_date, 20),
      mission_highlights: s(j.mission_highlights, 6000),
      client_strengths: s(j.client_strengths, 6000),
      client_win_strategy: s(j.client_win_strategy, 6000),
      program_goals: s(j.program_goals, 6000),
      key_requirements: arr(j.key_requirements),
      win_themes: arr(j.win_themes),
      competitors: arr(j.competitors),
      discriminators: arr(j.discriminators),
      proof_points: arr(j.proof_points),
      client_priorities: arr(j.client_priorities),
      risks: arr(j.risks),
      focus_areas: arr(j.focus_areas),
      sensitivities_note: s(j.sensitivities_note, 4000),
      language_guidance: s(j.language_guidance, 4000),
      things_to_avoid: s(j.things_to_avoid, 4000),
      things_to_reinforce: s(j.things_to_reinforce, 4000),
    };
  } catch {
    return null;
  }
}


export const importSetupRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Admin-only.
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Admin access required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.doc_text },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });

    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
    if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = tryParse(content);
    if (!parsed) throw new Error("IRIS could not extract structured fields from the document.");

    // Build patch (skip nulls / empty arrays so we never wipe existing data).
    const patch: Record<string, unknown> = {};
    const setIf = (k: string, v: unknown) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v) && v.length === 0) return;
      patch[k] = v;
    };
    setIf("name", parsed.name);
    setIf("client", parsed.client);
    setIf("state_agency", parsed.state_agency);
    setIf("program_type", parsed.program_type);
    setIf("incumbent_name", parsed.incumbent_name);
    setIf("contract_value", parsed.contract_value);
    if (parsed.submission_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.submission_date)) {
      patch.submission_date = parsed.submission_date;
    }
    setIf("mission_highlights", parsed.mission_highlights);
    setIf("client_strengths", parsed.client_strengths);
    setIf("client_win_strategy", parsed.client_win_strategy);
    setIf("program_goals", parsed.program_goals);
    setIf("key_requirements", parsed.key_requirements);
    setIf("win_themes", parsed.win_themes);
    setIf("competitors", parsed.competitors);
    setIf("focus_areas", parsed.focus_areas);

    const updatedFields = Object.keys(patch);
    const fieldsUpdated = updatedFields.length;
    if (fieldsUpdated > 0) {
      const { error } = await supabaseAdmin.from("missions").update(patch as never).eq("id", data.mission_id);
      if (error) throw new Error(error.message);
    }

    if (parsed.submission_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.submission_date)) {
      const { error } = await supabaseAdmin.from("mission_timeline").upsert({
        mission_id: data.mission_id,
        submission: parsed.submission_date,
        updated_at: new Date().toISOString(),
      } as never);
      if (error) throw new Error(error.message);
      updatedFields.push("timeline.submission");
    }

    if (parsed.competitors.length > 0) {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("mission_strategy")
        .select("label")
        .eq("mission_id", data.mission_id)
        .eq("kind", "competitor");
      if (readError) throw new Error(readError.message);
      const seen = new Set((existing ?? []).map((r: any) => String(r.label ?? "").trim().toLowerCase()));
      const rows = parsed.competitors
        .filter((label) => !seen.has(label.toLowerCase()))
        .map((label) => ({ mission_id: data.mission_id, kind: "competitor", label, created_by: userId }));
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from("mission_strategy").insert(rows as never);
        if (error) throw new Error(error.message);
        updatedFields.push("strategy.competitors");
      }
    }

    const sensRows = [
      { category: "sensitivity", note: parsed.sensitivities_note },
      { category: "language", note: parsed.language_guidance },
      { category: "avoid", note: parsed.things_to_avoid },
      { category: "reinforce", note: parsed.things_to_reinforce },
    ].filter((r) => r.note && r.note.trim().length > 0);
    if (sensRows.length > 0) {
      const cats = sensRows.map((r) => r.category);
      const { error: delErr } = await supabaseAdmin
        .from("mission_sensitivities")
        .delete()
        .eq("mission_id", data.mission_id)
        .in("category", cats);
      if (delErr) throw new Error(delErr.message);
      const insertRows = sensRows.map((r) => ({
        mission_id: data.mission_id,
        category: r.category,
        note: (r.note as string).trim(),
        created_by: userId,
      }));
      const { error } = await supabaseAdmin.from("mission_sensitivities").insert(insertRows as never);
      if (error) throw new Error(error.message);
      updatedFields.push(`sensitivities(${cats.join(",")})`);
    }

    return { ok: true as const, fieldsUpdated: updatedFields.length, fields: updatedFields };
  });

