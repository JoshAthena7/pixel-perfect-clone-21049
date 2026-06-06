import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

export type StrategicFieldKey =
  | "mission_highlights"
  | "client_strengths"
  | "client_win_strategy"
  | "program_goals"
  | "key_contract_requirements";

const FIELD_GUIDANCE: Record<StrategicFieldKey, { label: string; kind: "prose" | "bullets"; instruction: string }> = {
  mission_highlights: {
    label: "Mission Highlights",
    kind: "prose",
    instruction:
      "Write 4–6 sentences that summarize what makes this opportunity significant: scope, contract value, visibility, strategic importance, and why our client is pursuing it. Lead with the headline facts grounded in the RFP.",
  },
  client_strengths: {
    label: "Client Strengths",
    kind: "prose",
    instruction:
      "Write 4–6 sentences capturing what the client brings to the table: their differentiators, relationships, incumbency or track record, and what evaluators will already believe about them. Be concrete; avoid generic praise.",
  },
  client_win_strategy: {
    label: "Client Win Strategy",
    kind: "prose",
    instruction:
      "Write 4–6 sentences describing the central argument of the proposal: why the evaluator should choose this client over all others. State the core claim plainly, then the 2–3 pillars that support it.",
  },
  program_goals: {
    label: "Program Goals / Future State",
    kind: "prose",
    instruction:
      "Write 4–6 sentences describing what the program is trying to achieve over the next 3–5 years and what success looks like for the people it serves. Ground this in the RFP's stated objectives.",
  },
  key_contract_requirements: {
    label: "Key Contract Requirements",
    kind: "bullets",
    instruction:
      "Extract 6–12 non-negotiable contract requirements directly called out in the RFP: mandatory certifications, registrations, specific deliverables, compliance items, staffing requirements, etc. One requirement per bullet, written as a short imperative phrase.",
  },
};

async function callGenerator(system: string, user: string, kind: "prose" | "bullets"): Promise<string | string[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const schema =
    kind === "prose"
      ? {
          type: "object",
          additionalProperties: false,
          properties: { text: { type: "string" } },
          required: ["text"],
        }
      : {
          type: "object",
          additionalProperties: false,
          properties: {
            items: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
          },
          required: ["items"],
        };

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "strategic_field", schema },
        },
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw);
    if (kind === "prose") return String(parsed.text ?? "").slice(0, 4000);
    return (parsed.items ?? [])
      .map((s: unknown) => String(s ?? "").trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 20);
  } catch {
    return null;
  }
}

export const generateStrategicField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        field: z.enum([
          "mission_highlights",
          "client_strengths",
          "client_win_strategy",
          "program_goals",
          "key_contract_requirements",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: mission } = await supabase
      .from("missions")
      .select(
        "name,client,state,state_agency,procurement_name,rfp_number,program_type,submission_date,win_themes,priority_topics,competitors,focus_areas,contract_value,contract_term,incumbent_name,mission_highlights,client_strengths,client_win_strategy,program_goals,key_requirements",
      )
      .eq("id", data.missionId)
      .maybeSingle();

    if (!mission) throw new Error("Mission not found");

    // Pull RFP / vault extracted text
    const { data: vaultRows } = await supabase
      .from("document_extractions")
      .select("extracted_text,summary,mission_library!inner(name,category,mission_id)")
      .eq("mission_id", data.missionId)
      .eq("status", "ready")
      .limit(10);

    const PER_DOC = 8000;
    const parts: string[] = [];
    for (const r of (vaultRows ?? []) as Array<{
      extracted_text: string | null;
      summary: string | null;
      mission_library: { name: string; category: string | null } | null;
    }>) {
      const name = r.mission_library?.name ?? "Document";
      const body = (r.extracted_text ?? r.summary ?? "").slice(0, PER_DOC);
      if (!body.trim()) continue;
      parts.push(`### ${name}\n${body}`);
    }
    const rfpText = parts.join("\n\n---\n\n").slice(0, 60000);

    const guide = FIELD_GUIDANCE[data.field];

    const system = `You are IRIS, the strategic intelligence engine for a proposal command center. You write tight, evaluator-aware strategic content grounded in real RFP language. Never invent facts. If the RFP does not support a detail, omit it. Match the requested format exactly.`;

    const existingValue =
      data.field === "key_contract_requirements"
        ? (mission.key_requirements ?? []).join("\n")
        : (mission as any)[data.field] ?? "";

    const user = [
      `# Mission`,
      `Name: ${mission.name}`,
      `Client: ${mission.client}`,
      mission.state ? `State: ${mission.state}` : "",
      mission.state_agency ? `Agency: ${mission.state_agency}` : "",
      mission.procurement_name ? `Procurement: ${mission.procurement_name}` : "",
      mission.rfp_number ? `RFP #: ${mission.rfp_number}` : "",
      mission.program_type ? `Program: ${mission.program_type}` : "",
      mission.contract_value ? `Contract value: ${mission.contract_value}` : "",
      mission.contract_term ? `Term: ${mission.contract_term}` : "",
      mission.incumbent_name ? `Incumbent: ${mission.incumbent_name}` : "",
      mission.win_themes?.length ? `Win themes: ${mission.win_themes.join("; ")}` : "",
      mission.competitors?.length ? `Competitors: ${mission.competitors.join("; ")}` : "",
      mission.focus_areas?.length ? `Focus areas: ${mission.focus_areas.join("; ")}` : "",
      "",
      `# Existing Strategic Foundation (for cross-reference, do not contradict)`,
      `Mission Highlights: ${mission.mission_highlights ?? "(empty)"}`,
      `Client Strengths: ${mission.client_strengths ?? "(empty)"}`,
      `Win Strategy: ${mission.client_win_strategy ?? "(empty)"}`,
      `Program Goals: ${mission.program_goals ?? "(empty)"}`,
      "",
      `# RFP / Vault Documents`,
      rfpText || "(no extracted RFP text available)",
      "",
      `# Your Task`,
      `Generate the **${guide.label}** field.`,
      guide.instruction,
      existingValue
        ? `\nThe current draft is below — improve, sharpen, and re-ground it in the RFP. Keep what is accurate; replace what is generic.\n---\n${existingValue}\n---`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callGenerator(system, user, guide.kind);
    if (result == null) {
      throw new Error("IRIS generation unavailable — check Lovable AI credits.");
    }

    return { field: data.field, value: result };
  });
