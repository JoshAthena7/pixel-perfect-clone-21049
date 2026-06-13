/**
 * IRIS Mission Analysis — orchestrates cross-document extraction for the
 * 8-step wizard. Reads every mission_document for the mission, asks Gemini
 * (via the Lovable AI gateway) to extract structured fields for a specific
 * wizard step, and writes results to mission_iris_extractions.
 *
 * Called per-step (lazy extraction) by the new wizard. Step 1 (upload) is
 * not extracted. Step 2 (basics) runs first. Steps 3-7 run when the user
 * lands on that step.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const StepFieldsSchema = z.object({
  missionId: z.string().uuid(),
  wizardStep: z.number().int().min(2).max(8),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        hint: z.string().max(400).optional(),
      }),
    )
    .min(1)
    .max(40),
});

type Extraction = {
  field_key: string;
  value: string;
  confidence: number;
  source_file_id: string | null;
  source_file_name: string | null;
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    extractions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field_key: { type: "string" },
          value: { type: "string" },
          confidence: { type: "number" },
          source: { type: "string" },
        },
        required: ["field_key", "value", "confidence", "source"],
      },
    },
  },
  required: ["extractions"],
} as const;

export const analyzeMissionStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StepFieldsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const supabase = context.supabase;

    // Load uploaded mission documents (content_summary populated by upload pipeline)
    const { data: docs } = await supabase
      .from("mission_documents")
      .select("id, title, file_url, document_type, content_summary")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: true });

    if (!docs || docs.length === 0) {
      return { extractions: [], message: "No documents uploaded yet." };
    }

    // Build a corpus of document text. Cap each doc text to keep prompt reasonable.
    const corpus = docs
      .map((d) => {
        const txt = (d.content_summary as string | null) ?? "";
        return `=== Document: ${d.title ?? "Untitled"} (id=${d.id}, type=${d.document_type ?? "other"}) ===\n${txt.slice(0, 20000)}`;
      })
      .join("\n\n");

    const fieldList = data.fields
      .map((f) => `- key=${f.key} | label="${f.label}"${f.hint ? ` | hint=${f.hint}` : ""}`)
      .join("\n");

    const system = [
      "You are IRIS, the intelligence layer for the Athena mission setup wizard.",
      "Extract structured field values for the wizard step from the supplied document corpus.",
      "Rules:",
      "1. Only return field_key values from the provided list.",
      "2. Only return values supported by the corpus. Do NOT fabricate.",
      "3. confidence is 0.00–1.00. Use 0.90+ when the value is explicit, 0.60–0.89 when inferred, below 0.60 when speculative.",
      '4. `source` must cite the document title and a short quote or section reference, e.g. "RFP.pdf §3.2".',
      "5. Omit fields you cannot support.",
      "6. For list-style fields, return a single newline-separated string.",
      "7. Return ISO YYYY-MM-DD for date fields.",
    ].join("\n");

    const user = [
      `Wizard step: ${data.wizardStep}`,
      "",
      "Fields to extract:",
      fieldList,
      "",
      "Document corpus:",
      corpus,
      "",
      'Return JSON: { "extractions": [{ field_key, value, confidence, source }] }',
    ].join("\n");

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "mission_step_extraction", schema: RESPONSE_SCHEMA },
          },
        }),
      });
      if (r.status === 429) throw new Error("Rate limited. Try again in a moment.");
      if (r.status === 402)
        throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`AI gateway ${r.status}: ${txt.slice(0, 200)}`);
      }
      return r;
    });

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { extractions?: Array<{ field_key: string; value: string; confidence: number; source: string }> } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const allowedKeys = new Set(data.fields.map((f) => f.key));
    const extractions = (parsed.extractions ?? []).filter((e) => allowedKeys.has(e.field_key));

    // Persist to mission_iris_extractions — upsert on (mission_id, extracted_field)
    // where source_file_id is null (one row per field).
    const docsById = new Map(docs.map((d) => [d.id as string, d]));

    for (const e of extractions) {
      const { data: humanRow } = await supabase
        .from("mission_iris_extractions")
        .select("id")
        .eq("mission_id", data.missionId)
        .eq("extracted_field", e.field_key)
        .or("confirmed_by_user.eq.true,overridden_by_user.eq.true")
        .limit(1)
        .maybeSingle();

      if (humanRow?.id) continue;

      // Try to match source mention to a document
      let sourceFileId: string | null = null;
      let sourceFileName: string | null = null;
      const sourceMatch = e.source?.match(/^([^§:,]+)/);
      const titleHint = sourceMatch?.[1]?.trim().toLowerCase();
      if (titleHint) {
        for (const [id, d] of docsById) {
          const t = (d.title as string | null)?.toLowerCase() ?? "";
          if (t && titleHint.includes(t.slice(0, 12))) {
            sourceFileId = id;
            sourceFileName = d.title as string;
            break;
          }
        }
      }

      // Delete any existing unconfirmed extraction for this field, then insert
      await supabase
        .from("mission_iris_extractions")
        .delete()
        .eq("mission_id", data.missionId)
        .eq("extracted_field", e.field_key)
        .eq("confirmed_by_user", false)
        .eq("overridden_by_user", false);

      await supabase.from("mission_iris_extractions").insert({
        mission_id: data.missionId,
        source_file_id: sourceFileId,
        source_file_name: sourceFileName ?? e.source ?? null,
        extracted_field: e.field_key,
        extracted_value: e.value,
        confidence_score: Math.max(0, Math.min(1, Number(e.confidence) || 0)),
        wizard_step: data.wizardStep,
      });
    }

    return {
      extractions: extractions.map((e) => ({
        field_key: e.field_key,
        value: e.value,
        confidence: e.confidence,
        source: e.source,
      })) as Array<Pick<Extraction, "field_key" | "value" | "confidence"> & { source: string }>,
      document_count: docs.length,
    };
  });
