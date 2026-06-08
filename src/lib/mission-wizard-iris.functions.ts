import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({ missionId: z.string().uuid() });

export const runWizardIrisAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("name,client,program_type,state,engagement_type,submission_date")
      .eq("id", data.missionId)
      .maybeSingle();
    if (mErr || !mission) throw new Error("Mission not found");

    const { data: docs } = await supabase
      .from("mission_documents")
      .select("doc_type,file_url,notes")
      .eq("mission_id", data.missionId);

    const docLines = (docs ?? [])
      .map((d: { doc_type: string | null; file_url: string | null; notes: string | null }) => {
        const parts = [`### ${d.doc_type ?? "doc"}`];
        if (d.file_url) parts.push(`URL: ${d.file_url}`);
        if (d.notes) parts.push(d.notes);
        return parts.join("\n");
      })
      .join("\n\n");

    const prompt = `You are IRIS, the mission intelligence engine for ATLAS. Analyze the following source materials for a government proposal mission and produce a complete structured mission record as JSON.

Mission: ${mission.name ?? ""}
Client: ${mission.client ?? ""}
Program: ${mission.program_type ?? ""}
State: ${mission.state ?? ""}
Procurement: ${(mission as { engagement_type?: string | null }).engagement_type ?? ""}
Due: ${mission.submission_date ?? ""}

Source materials provided:
${docLines || "(none provided)"}

Return ONLY valid JSON with these exact keys — no markdown, no explanation:
{
  "mission_overview": "string — 3-4 sentence mission summary",
  "mission_briefing": "string — detailed briefing paragraph for the team",
  "key_dates": [{ "label": "string", "date": "string", "note": "string" }],
  "major_requirements": ["string"],
  "deliverables": ["string"],
  "compliance_items": ["string"],
  "suggested_sections": ["string"],
  "workstreams": ["string"],
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "key_risks": [{ "risk": "string", "mitigation": "string" }],
  "known_gaps": ["string"],
  "recommended_win_themes": ["string"],
  "suggested_staffing": [{ "role": "string", "reason": "string" }],
  "suggested_writing_assignments": [{ "section": "string", "role": "string", "notes": "string" }],
  "source_document_inventory": [{ "doc_type": "string", "status": "string", "notes": "string" }],
  "intelligence_notes": "string",
  "oracle_prompts": ["string"],
  "iris_briefing_notes": "string",
  "required_expertise": ["string"],
  "client_sensitivities": ["string"]
}`;

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are IRIS. Output strict JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (r.status === 429) throw new Error("Rate limited — please retry shortly.");
      if (r.status === 402) throw new Error("AI credits exhausted.");
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("IRIS returned invalid JSON");
    }

    const { error: insErr } = await supabase.from("mission_intelligence").upsert(
      {
        mission_id: data.missionId,
        layer: "wizard_analysis",
        content: parsed as never,
      } as never,
      { onConflict: "mission_id,layer" },
    );
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("missions")
      .update({ mission_status: "Ready for Review", wizard_step: 3 } as never)
      .eq("id", data.missionId);

    return { analysisJson: JSON.stringify(parsed) };
  });
