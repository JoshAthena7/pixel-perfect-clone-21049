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
If the document is a completed setup form, treat labels like "Agency Intelligence", "Key Contacts", "Stakeholders", "Decision Makers", "Relationship Owners", "Political Considerations", and "Meeting Cadence" as authoritative source fields and copy their entered values into the matching JSON fields.

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
  "key_contacts": string[],             // contracting officer / POC / "Name — Title" lines from cover page
  "agency_stakeholders": string[],      // named stakeholders on the agency side
  "decision_makers": string[],          // named decision makers on the agency side
  "relationship_owners": string[],      // anyone owning the relationship (often blank in an RFP)
  "political_considerations": string|null,
  "meeting_cadence": string|null,
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
  key_contacts: string[];
  agency_stakeholders: string[];
  decision_makers: string[];
  relationship_owners: string[];
  political_considerations: string | null;
  meeting_cadence: string | null;
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
function mergeList(a: string[], b: string[]) {
  const seen = new Set(a.map((x) => x.toLowerCase()));
  const out = [...a];
  for (const x of b) {
    const t = x.trim();
    if (t && !seen.has(t.toLowerCase())) {
      out.push(t);
      seen.add(t.toLowerCase());
    }
  }
  return out;
}
function extractAgencyIntelFromLabels(text: string): Pick<Parsed, "key_contacts" | "agency_stakeholders" | "decision_makers" | "relationship_owners" | "political_considerations" | "meeting_cadence"> {
  const empty = {
    key_contacts: [],
    agency_stakeholders: [],
    decision_makers: [],
    relationship_owners: [],
    political_considerations: null,
    meeting_cadence: null,
  };
  const start = text.search(/agency\s+intelligence|client\s+intelligence/i);
  const scoped = (start >= 0 ? text.slice(start) : text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, "\n")
    .slice(0, 30_000);
  const end = scoped.search(/\n\s*(?:deadlines?|timeline|question\s+setup|governance|conflict|ethics|financials?)\b/i);
  const section = end > 200 ? scoped.slice(0, end) : scoped;
  const specs = [
    { key: "key_contacts", re: /key\s+contacts?(?:\s*\([^)]*\))?/gi },
    { key: "agency_stakeholders", re: /stakeholders?/gi },
    { key: "decision_makers", re: /decision\s+makers?/gi },
    { key: "relationship_owners", re: /relationship\s+owners?/gi },
    { key: "political_considerations", re: /political\s+considerations?/gi },
    { key: "meeting_cadence", re: /meeting\s+cadence/gi },
  ] as const;
  const matches: Array<{ key: keyof typeof empty; index: number; end: number }> = [];
  for (const spec of specs) {
    for (const m of section.matchAll(spec.re)) matches.push({ key: spec.key, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  matches.sort((a, b) => a.index - b.index);
  const result = { ...empty };
  const clean = (value: string) => value.replace(/^\s*[:\-–—]+\s*/, "").replace(/\n{3,}/g, "\n\n").trim();
  const splitItems = (value: string) =>
    clean(value)
      .split(/\n|[•●▪▫]\s*/g)
      .map((x) => x.replace(/^\s*[-–—*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 20);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1]?.index ?? section.length;
    const value = clean(section.slice(m.end, next));
    if (!value) continue;
    if (m.key === "political_considerations" || m.key === "meeting_cadence") {
      result[m.key] = value.replace(/\s+/g, " ").slice(0, m.key === "meeting_cadence" ? 1000 : 4000);
    } else {
      result[m.key] = mergeList(result[m.key], splitItems(value));
    }
  }
  return result;
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
      key_contacts: arr(j.key_contacts),
      agency_stakeholders: arr(j.agency_stakeholders),
      decision_makers: arr(j.decision_makers),
      relationship_owners: arr(j.relationship_owners),
      political_considerations: s(j.political_considerations, 4000),
      meeting_cadence: s(j.meeting_cadence, 1000),
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

    const strategyGroups: Array<{ kind: string; labels: string[]; tag: string }> = [
      { kind: "competitor", labels: parsed.competitors, tag: "competitors" },
      { kind: "discriminator", labels: parsed.discriminators, tag: "discriminators" },
      { kind: "proof_point", labels: parsed.proof_points, tag: "proof_points" },
      { kind: "client_priority", labels: parsed.client_priorities, tag: "client_priorities" },
      { kind: "risk", labels: parsed.risks, tag: "risks" },
    ];
    for (const group of strategyGroups) {
      if (group.labels.length === 0) continue;
      const { data: existing, error: readError } = await supabaseAdmin
        .from("mission_strategy")
        .select("label")
        .eq("mission_id", data.mission_id)
        .eq("kind", group.kind);
      if (readError) throw new Error(readError.message);
      const seen = new Set((existing ?? []).map((r: any) => String(r.label ?? "").trim().toLowerCase()));
      const rows = group.labels
        .filter((label) => !seen.has(label.toLowerCase()))
        .map((label) => ({ mission_id: data.mission_id, kind: group.kind, label, created_by: userId }));
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from("mission_strategy").insert(rows as never);
        if (error) throw new Error(error.message);
        updatedFields.push(`strategy.${group.tag}`);
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

    // Agency Intelligence — merge into mission_client_intel without wiping
    // existing manual entries. PK is mission_id so we read → dedup → upsert.
    const intelStringArrays = {
      contacts: parsed.key_contacts,
      stakeholders: parsed.agency_stakeholders,
      decision_makers: parsed.decision_makers,
      relationship_owners: parsed.relationship_owners,
    };
    const hasIntel =
      Object.values(intelStringArrays).some((a) => a.length > 0) ||
      !!parsed.political_considerations ||
      !!parsed.meeting_cadence;
    if (hasIntel) {
      const { data: existing } = await supabaseAdmin
        .from("mission_client_intel")
        .select("contacts,stakeholders,decision_makers,relationship_owners,political_considerations,meeting_cadence,notes")
        .eq("mission_id", data.mission_id)
        .maybeSingle();
      const norm = (v: unknown): string[] => {
        if (!Array.isArray(v)) return [];
        return v
          .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? [(x as any).name, (x as any).role].filter(Boolean).join(" — ") : ""))
          .map((s) => s.trim())
          .filter(Boolean);
      };
      const merge = (a: string[], b: string[]) => {
        const seen = new Set(a.map((s) => s.toLowerCase()));
        const out = [...a];
        for (const x of b) if (!seen.has(x.toLowerCase())) { out.push(x); seen.add(x.toLowerCase()); }
        return out;
      };
      const merged = {
        mission_id: data.mission_id,
        contacts: merge(norm(existing?.contacts), intelStringArrays.contacts),
        stakeholders: merge(norm(existing?.stakeholders), intelStringArrays.stakeholders),
        decision_makers: merge(norm(existing?.decision_makers), intelStringArrays.decision_makers),
        relationship_owners: merge(norm(existing?.relationship_owners), intelStringArrays.relationship_owners),
        political_considerations: existing?.political_considerations || parsed.political_considerations || null,
        meeting_cadence: existing?.meeting_cadence || parsed.meeting_cadence || null,
        notes: existing?.notes ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from("mission_client_intel").upsert(merged as never, { onConflict: "mission_id" });
      if (error) throw new Error(`client_intel: ${error.message}`);
      updatedFields.push("client_intel");
    }

    return { ok: true as const, fieldsUpdated: updatedFields.length, fields: updatedFields };
  });

