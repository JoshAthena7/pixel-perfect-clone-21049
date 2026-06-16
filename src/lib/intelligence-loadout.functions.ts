// Sprint 14 — Intelligence Loadout server functions.
// Prior-RFP comparison, competitor profiling, and competitor suggestions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function tryParseJSON<T = any>(s: string): T | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

async function callAI(system: string, user: string, jsonMode = true): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      ...(jsonMode ? {} : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (res.status === 402) throw new Error("Workspace is out of AI credits.");
  if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (jsonMode) {
    const parsed = tryParseJSON(content);
    if (!parsed) throw new Error("IRIS returned an invalid response.");
    return parsed;
  }
  return content;
}

/* Compare prior RFP text to current RFP text and write a procurement_evolution_records row. */
export const comparePriorRfp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        priorDocumentId: z.string().uuid(),
        priorText: z.string().min(50).max(60_000),
        currentText: z.string().min(50).max(60_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const system = `You are a Medicaid procurement analyst. Compare two RFPs (prior vs current) and identify what changed. Return ONLY valid JSON with this shape: { "material_changes": [{"change_type":"string","description":"string","prior_version":"string","current_version":"string","significance":"string"}], "new_sections":[{"section_name":"string","description":"string","likely_signal":"string"}], "removed_sections":[{"section_name":"string","likely_reason":"string"}], "tightened_requirements":[{"requirement":"string","description":"string","likely_signal":"string"}], "relaxed_requirements":[{"requirement":"string","description":"string"}], "scoring_changes":[{"section":"string","old_weight":"string","new_weight":"string","significance":"string"}], "iris_summary":"string", "iris_signals":"string", "iris_recommendations":"string" }`;
    const userMsg = `Prior RFP text:\n${data.priorText.slice(0, 8000)}\n\nCurrent RFP text:\n${data.currentText.slice(0, 8000)}`;

    const parsed = await callAI(system, userMsg);

    // current RFP document id (primary_rfp)
    const { data: currentDoc } = await supabase
      .from("mission_documents")
      .select("id")
      .eq("mission_id", data.missionId)
      .eq("document_type", "primary_rfp")
      .limit(1)
      .maybeSingle();

    const payload = {
      mission_id: data.missionId,
      prior_rfp_document_id: data.priorDocumentId,
      current_rfp_document_id: currentDoc?.id ?? null,
      material_changes: parsed.material_changes ?? [],
      new_sections: parsed.new_sections ?? [],
      removed_sections: parsed.removed_sections ?? [],
      tightened_requirements: parsed.tightened_requirements ?? [],
      relaxed_requirements: parsed.relaxed_requirements ?? [],
      scoring_changes: parsed.scoring_changes ?? [],
      iris_summary: parsed.iris_summary ?? null,
      iris_signals: parsed.iris_signals ?? null,
      iris_recommendations: parsed.iris_recommendations ?? null,
      analysis_completed_at: new Date().toISOString(),
    };

    // Upsert (mission_id is unique)
    const { error: upErr } = await supabase
      .from("procurement_evolution_records")
      .upsert(payload, { onConflict: "mission_id" });
    if (upErr) throw new Error(upErr.message);

    if (parsed.iris_summary) {
      await supabase
        .from("missions")
        .update({ procurement_evolution_analysis: parsed.iris_summary })
        .eq("id", data.missionId);
    }

    return { ok: true, summary: parsed.iris_summary ?? "" };
  });

/* Generate AI competitive profile for a competitor row. */
export const generateCompetitorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ competitorId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: comp, error: cErr } = await supabase
      .from("competitor_profiles")
      .select("*")
      .eq("id", data.competitorId)
      .single();
    if (cErr || !comp) throw new Error("Competitor not found.");

    const { data: mission } = await supabase
      .from("missions")
      .select("name, state, agency_name, program_type")
      .eq("id", comp.mission_id)
      .single();
    const { data: strat } = await supabase
      .from("mission_win_strategy")
      .select("central_claim")
      .eq("mission_id", comp.mission_id)
      .maybeSingle();

    const system = `You are a Medicaid procurement competitive intelligence analyst. Build a preliminary competitive profile. Return ONLY valid JSON: { "likely_narrative":"string","known_strengths":"string","known_weaknesses":"string","differentiation_strategy":"string","vulnerability_flags":[{"flag":"string","description":"string"}] }`;
    const userMsg = `Competitor: ${comp.organization_name}\nType: ${comp.competitor_type}\nKnown relationships: ${comp.known_relationships ?? "unknown"}\nNotes: ${(comp as any).notes ?? "none"}\n\nMission context: state=${mission?.state ?? "?"} agency=${mission?.agency_name ?? "?"} program_type=${mission?.program_type ?? "?"} name=${mission?.name ?? "?"}\nWin Strategy central claim: ${strat?.central_claim ?? "unknown"}`;

    const parsed = await callAI(system, userMsg);

    const { error: upErr } = await supabase
      .from("competitor_profiles")
      .update({
        likely_narrative: parsed.likely_narrative ?? null,
        known_strengths: parsed.known_strengths ?? null,
        known_weaknesses: parsed.known_weaknesses ?? null,
        differentiation_strategy: parsed.differentiation_strategy ?? null,
        vulnerability_flags: parsed.vulnerability_flags ?? [],
        iris_confidence: "medium",
      })
      .eq("id", data.competitorId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });

/* Suggest likely competitors for the mission. */
export const suggestCompetitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mission } = await context.supabase
      .from("missions")
      .select("name, state, agency_name, program_type")
      .eq("id", data.missionId)
      .single();
    const system = `You are a Medicaid procurement competitive intelligence analyst. List 3-5 likely bidders based on known Medicaid contractors active in this state and program type. Return ONLY valid JSON: { "suggested_competitors":[{"name":"string","rationale":"string","competitor_type":"string"}] }`;
    const userMsg = `Procurement context: state=${mission?.state ?? "?"} agency=${mission?.agency_name ?? "?"} program_type=${mission?.program_type ?? "?"} mission=${mission?.name ?? "?"}`;
    const parsed = await callAI(system, userMsg);
    return { suggestions: parsed.suggested_competitors ?? [] };
  });

/* Lightweight URL summarizer used for client-website slot. */
export const summarizeClientUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), url: z.string().url(), label: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let pageText = "";
    try {
      const r = await fetch(data.url, { redirect: "follow" });
      if (r.ok) {
        const html = await r.text();
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 8000);
      }
    } catch {
      /* ignore — IRIS will still record the URL */
    }
    let summary = "";
    if (pageText.length > 200) {
      try {
        summary = await callAI(
          "You are an analyst. Summarize this agency web page in 4-6 bullet sentences covering mission, priorities, recent initiatives, and leadership signals.",
          pageText,
          false,
        );
      } catch {
        /* ignore */
      }
    }
    const { data: row, error } = await supabase
      .from("mission_documents")
      .insert({
        mission_id: data.missionId,
        document_type: "media_url",
        source_url: data.url,
        title: data.label,
        content_summary: summary || null,
        uploaded_by: userId,
        metadata: { intelligence_tier: "client", slot: "client_website" },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, summary };
  });
