import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionId: z.string().uuid(),
  text: z.string().trim().min(1).max(50_000),
});

type Candidate = {
  name: string;
  competitor_type: "incumbent" | "likely_bidder" | "possible_bidder" | "dark_horse";
  known_relationships?: string;
};

function normalizeType(s: string): Candidate["competitor_type"] {
  const v = (s ?? "").toLowerCase();
  if (v.includes("incumb")) return "incumbent";
  if (v.includes("dark")) return "dark_horse";
  if (v.includes("possible")) return "possible_bidder";
  return "likely_bidder";
}

async function extractCandidates(text: string): Promise<Candidate[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const system = `You extract a list of competitor organizations from messy free text (notes, lists, emails, web copy).
For each competitor produce JSON:
{
  "name": legal/common company name (≤120 chars),
  "competitor_type": one of "incumbent" | "likely_bidder" | "possible_bidder" | "dark_horse",
  "known_relationships": one short sentence summarizing any context the user provided about this firm (incumbency, partnerships, prior wins, weaknesses). Empty string if none.
}
Rules:
- Infer competitor_type from context (e.g. "current vendor" → incumbent, "rumored to bid" → possible_bidder, "wild card" → dark_horse, default → likely_bidder).
- Deduplicate by normalized name.
- Skip generic placeholders ("TBD", "various", "others").
- Return STRICT JSON: { "competitors": [...] }. No prose outside JSON.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 40_000) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { competitors: [] };
  }
  const list: any[] = Array.isArray(parsed.competitors) ? parsed.competitors : [];
  const seen = new Set<string>();
  return list
    .map((c) => ({
      name: String(c?.name ?? "").trim().slice(0, 120),
      competitor_type: normalizeType(String(c?.competitor_type ?? "")),
      known_relationships: c?.known_relationships
        ? String(c.known_relationships).trim().slice(0, 600)
        : undefined,
    }))
    .filter((c) => {
      if (!c.name) return false;
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

export const bulkAddCompetitorsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const candidates = await extractCandidates(data.text);
    if (candidates.length === 0) {
      return { inserted: 0, skipped: 0, insertedIds: [] as string[], competitors: [] as Candidate[] };
    }

    // Existing names to avoid duplicates
    const { data: existing } = await supabase
      .from("competitor_profiles")
      .select("organization_name")
      .eq("mission_id", data.missionId);
    const existingNames = new Set(
      ((existing ?? []) as Array<{ organization_name: string }>).map((r) =>
        r.organization_name.toLowerCase().trim(),
      ),
    );

    const toInsert = candidates.filter((c) => !existingNames.has(c.name.toLowerCase()));
    if (toInsert.length === 0) {
      return {
        inserted: 0,
        skipped: candidates.length,
        insertedIds: [] as string[],
        competitors: candidates,
      };
    }

    const rows = toInsert.map((c) => ({
      mission_id: data.missionId,
      organization_name: c.name,
      competitor_type: c.competitor_type,
      known_relationships: c.known_relationships ?? null,
      iris_confidence: "medium",
      is_manually_added: false,
    }));

    const { error, data: ins } = await supabase
      .from("competitor_profiles")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);

    return {
      inserted: ins?.length ?? rows.length,
      skipped: candidates.length - toInsert.length,
      insertedIds: (ins ?? []).map((r: { id: string }) => r.id),
      competitors: candidates,
    };
  });
