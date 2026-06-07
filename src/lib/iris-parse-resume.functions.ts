// Resume → expertise extraction via Lovable AI Gateway.
// The raw resume text is never persisted — this fn returns the structured
// fields to the client, which then writes only the parsed fields to profiles.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  resume_text: z.string().trim().min(50, "Resume text is too short to parse.").max(60_000),
});

export type ParsedExpertise = {
  areas_of_expertise: string[];
  expertise_summary: string;
  years_of_experience: number | null;
  certifications: string[];
};

const SYSTEM = `You are an expert resume analyst for a government proposal intelligence platform (Athena Strategy Group / ATLAS / IRIS). Your job is to extract structured expertise from a consultant's resume so the platform can route the right Subject Matter Expert to the right proposal question.

Return ONLY valid JSON matching this exact shape — no prose, no markdown, no code fences:
{
  "areas_of_expertise": string[],   // 5-10 SPECIFIC domain tags (e.g. "Medicaid Managed Care", "LTSS", "HCBS Waiver Administration", "Behavioral Health Integration", "HEDIS Quality Reporting", "Provider Network Adequacy", "IT Systems Integration", "Encounter Data", "Care Management Operations"). Be specific — never just "healthcare" or "IT".
  "expertise_summary": string,       // 2-3 sentence professional summary in third person.
  "years_of_experience": number|null,// total years in relevant field. null if unclear.
  "certifications": string[]         // licenses, certifications, credentials (e.g. "PMP", "RN", "LCSW", "CHC", "Six Sigma Black Belt"). Empty array if none found.
}

Focus on government contracting, healthcare, human services, IT modernization, and program management domains. If the resume is empty, irrelevant, or unparseable, return the JSON with empty arrays and null years.`;

function tryParseJSON(s: string): ParsedExpertise | null {
  // Strip code fences if the model added them despite instructions.
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const j = JSON.parse(cleaned);
    return {
      areas_of_expertise: Array.isArray(j.areas_of_expertise)
        ? j.areas_of_expertise.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 20)
        : [],
      expertise_summary: typeof j.expertise_summary === "string" ? j.expertise_summary.trim().slice(0, 1200) : "",
      years_of_experience:
        typeof j.years_of_experience === "number" && Number.isFinite(j.years_of_experience)
          ? Math.max(0, Math.min(75, Math.round(j.years_of_experience)))
          : null,
      certifications: Array.isArray(j.certifications)
        ? j.certifications.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 30)
        : [],
    };
  } catch {
    return null;
  }
}

export const parseResumeWithIris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<ParsedExpertise> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("IRIS is not configured yet — the built-in AI key is missing.");
    }

    // NOTE: data.resume_text is used only for the model call. It is NOT
    // written to any database table, log, or storage bucket.
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.resume_text },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });

    if (res.status === 402) {
      throw new Error("Workspace is out of AI credits. Add credits in Workspace Settings → Usage.");
    }
    if (res.status === 429) {
      throw new Error("IRIS is rate limited right now. Try again in a minute.");
    }
    if (!res.ok) {
      throw new Error(`IRIS gateway returned ${res.status}.`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = tryParseJSON(content);
    if (!parsed) {
      throw new Error("IRIS could not extract structured data from this resume.");
    }
    return parsed;
  });

// Persist the parsed (or user-edited) expertise to the caller's own profile.
// Whitelists exactly the 6 fields it writes; the raw resume text never
// touches this function.
const SaveInput = z.object({
  areas_of_expertise: z.array(z.string().trim().min(1).max(120)).max(40),
  expertise_summary: z.string().trim().max(2000).nullable().optional(),
  years_of_experience: z.number().int().min(0).max(75).nullable().optional(),
  certifications: z.array(z.string().trim().min(1).max(120)).max(40),
  source: z.enum(["resume_upload", "manual"]).default("resume_upload"),
});

export const saveResumeExpertise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        expertise_areas: data.areas_of_expertise,
        expert_bio: data.expertise_summary ?? null,
        years_of_experience: data.years_of_experience ?? null,
        certifications: data.certifications,
        expertise_source: data.source,
        expertise_updated_at: new Date().toISOString(),
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
