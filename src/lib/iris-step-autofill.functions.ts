import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

/**
 * Generic per-step "Upload to autofill" for the Mission Setup Wizard.
 *
 * Accepts:
 *   - missionId  — for audit context
 *   - stepLabel  — human label for the prompt ("Mission Basics")
 *   - fields     — schema of fields on this step (key + label + type + optional description + current value)
 *   - fileData   — base64-encoded PDF (data URL or raw base64)
 *   - fileName   — for the prompt
 *   - mimeType   — defaults to application/pdf
 *
 * Returns: { suggestions: [{ key, value, confidence: high|medium|low, source: string }] }
 *
 * IRIS only fills fields that are currently empty; the model is instructed
 * NOT to overwrite values the user already entered.
 */

const FieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  type: z.enum(["string", "text", "number", "date", "array"]),
  description: z.string().max(240).optional(),
  currentValue: z.string().max(500).optional(),
});

const InputSchema = z.object({
  missionId: z.string().uuid(),
  stepLabel: z.string().min(1).max(80),
  fields: z.array(FieldSchema).min(1).max(40),
  fileData: z.string().min(20),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(120).optional(),
});

type Suggestion = {
  key: string;
  value: string | string[] | null;
  confidence: "high" | "medium" | "low";
  source: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          value: {
            anyOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          source: { type: "string" },
        },
        required: ["key", "value", "confidence", "source"],
      },
    },
  },
  required: ["suggestions"],
} as const;

function buildSystemPrompt(stepLabel: string): string {
  return [
    "You are IRIS, the intelligence layer for Athena's mission-setup workflow.",
    `You are extracting structured values for the wizard step: "${stepLabel}".`,
    "RULES:",
    "1. Only return values you can support from the uploaded document.",
    "2. If a field has a non-empty `current_value`, do NOT propose a value unless the document clearly contradicts it — and even then mark confidence: low.",
    "3. For type=date, return ISO 8601 (YYYY-MM-DD).",
    "4. For type=number, return the bare number as a string.",
    "5. For type=array, return an array of short strings (max 8 items).",
    "6. `source` MUST cite the document location — page number, section number, or short quote. Never fabricate.",
    "7. Confidence: high = explicit in doc, medium = inferable, low = best guess.",
    "8. Omit any field you cannot support. Do not invent values.",
  ].join("\n");
}

function buildUserPrompt(
  fileName: string,
  fields: z.infer<typeof FieldSchema>[],
): string {
  const lines: string[] = [];
  lines.push(`Document: ${fileName}`);
  lines.push("");
  lines.push("Fields to fill on this step:");
  fields.forEach((f) => {
    const current = (f.currentValue || "").trim();
    lines.push(
      `- key=${f.key} | label="${f.label}" | type=${f.type}${
        f.description ? ` | hint=${f.description}` : ""
      } | current_value=${current ? JSON.stringify(current) : "EMPTY"}`,
    );
  });
  lines.push("");
  lines.push(
    'Return JSON { "suggestions": [{ key, value, confidence, source }, ...] }',
  );
  lines.push("Only include keys you have evidence for. Skip the rest.");
  return lines.join("\n");
}

function normalizeFileData(fileData: string, mimeType: string): string {
  // Accept either raw base64 or a full data URL; return raw base64.
  if (fileData.startsWith("data:")) {
    const idx = fileData.indexOf(",");
    return idx >= 0 ? fileData.slice(idx + 1) : fileData;
  }
  return fileData;
}

export const irisAutofillStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing LOVABLE_API_KEY");
    }

    const mimeType = data.mimeType || "application/pdf";
    const base64 = normalizeFileData(data.fileData, mimeType);
    const allowedKeys = new Set(data.fields.map((f) => f.key));

    const system = buildSystemPrompt(data.stepLabel);
    const user = buildUserPrompt(data.fileName, data.fields);

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: user },
                {
                  type: "file",
                  file: {
                    filename: data.fileName,
                    file_data: `data:${mimeType};base64,${base64}`,
                  },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "step_autofill", schema: RESPONSE_SCHEMA },
          },
        }),
      });
      if (r.status === 429) throw new Error("Rate limited (429). Try again shortly.");
      if (r.status === 402) {
        throw new Error("AI credits exhausted (402). Add credits in Settings → Workspace → Usage.");
      }
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`AI gateway ${r.status}: ${txt.slice(0, 200)}`);
      }
      return r;
    });

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: { suggestions?: Suggestion[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const suggestions = (parsed.suggestions ?? []).filter((s) =>
      allowedKeys.has(s.key),
    );

    return { suggestions };
  });
