// IRIS Competitor Intelligence — generates per-competitor profile cards plus
// an overall competitive-landscape summary, drawing only from IRIS Memory.
// Persists to public.mission_iris_extractions with wizard_step = 4.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

export type CompetitorCard = {
  competitor_name: string;
  incumbent_status: string;
  how_they_win: string;
  known_weaknesses: string;
  win_loss_history: string;
  likely_teaming: string;
  pricing_posture: string;
  key_personnel: string[];
  recent_signals: string[];
  how_we_beat_them: string;
  confidence_level: "low" | "medium" | "high";
  source_count: number;
  threat_level: "LOW" | "MEDIUM" | "HIGH";
};

const Input = z.object({
  mission_id: z.string().uuid(),
  competitors: z.array(z.string().trim().min(1)).min(0).max(20).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const generateCompetitorIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");

    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("id, state, program_type, known_competitors")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (mErr || !mission) throw new Error("Mission not found or access denied.");

    let competitors: string[] = Array.isArray(data.competitors) ? data.competitors : [];
    if (competitors.length === 0 && Array.isArray(mission.known_competitors)) {
      competitors = mission.known_competitors as string[];
    }
    if (competitors.length === 0) {
      const { data: ext } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_value, user_override_value")
        .eq("mission_id", data.mission_id)
        .eq("extracted_field", "known_competitors")
        .maybeSingle();
      const raw = ((ext?.user_override_value ?? ext?.extracted_value ?? "") as string).trim();
      if (raw) {
        competitors = raw
          .split(/[\n,;]+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    competitors = Array.from(new Set(competitors.map((c) => c.trim()).filter(Boolean))).slice(0, 20);
    if (competitors.length === 0) {
      throw new Error("No confirmed competitors to research. Add competitors first.");
    }

    await supabase
      .from("missions")
      .update({ known_competitors: competitors })
      .eq("id", data.mission_id);

    const stateName: string | null = mission.state ?? null;
    const programName: string | null = mission.program_type ?? null;

    const cards: CompetitorCard[] = [];
    for (const name of competitors) {
      const card = await generateOneCard({
        supabase,
        apiKey,
        competitorName: name,
        stateName,
        programName,
      });
      cards.push(card);
      await upsertExtraction(supabase, {
        missionId: data.mission_id,
        field: `competitor_card_${slug(name)}`,
        value: JSON.stringify(card),
        confidence:
          card.confidence_level === "high" ? 0.9 : card.confidence_level === "medium" ? 0.6 : 0.3,
        sourceFileName: name,
      });
    }

    const summary = await generateLandscapeSummary({ apiKey, cards, stateName, programName });
    await upsertExtraction(supabase, {
      missionId: data.mission_id,
      field: "competitive_landscape_summary",
      value: summary,
      confidence: 0.7,
    });

    return { ok: true, cards, summary, competitors };
  });

// -------- helpers --------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

async function upsertExtraction(
  supabase: Supa,
  args: {
    missionId: string;
    field: string;
    value: string;
    confidence: number;
    sourceFileName?: string;
  },
) {
  // Re-run is idempotent: overwrite extracted_value but never touch
  // user_override_value so manual edits survive regeneration.
  const { data: existing } = await supabase
    .from("mission_iris_extractions")
    .select("id")
    .eq("mission_id", args.missionId)
    .eq("extracted_field", args.field)
    .maybeSingle();

  const row = {
    mission_id: args.missionId,
    extracted_field: args.field,
    extracted_value: args.value,
    confidence_score: args.confidence,
    wizard_step: 4,
    source_file_name: args.sourceFileName ?? null,
  };

  if (existing?.id) {
    await supabase.from("mission_iris_extractions").update(row).eq("id", existing.id);
  } else {
    await supabase.from("mission_iris_extractions").insert(row);
  }
}

async function generateOneCard(args: {
  supabase: Supa;
  apiKey: string;
  competitorName: string;
  stateName: string | null;
  programName: string | null;
}): Promise<CompetitorCard> {
  const { supabase, apiKey, competitorName, stateName, programName } = args;
  const like = `%${competitorName}%`;

  const [insightsRes, stateDnaRes, programDnaRes, signalsRes, historyRes, expertsRes] =
    await Promise.all([
      supabase
        .from("insights")
        .select("content, source, confidence, tags")
        .eq("insight_type", "competitive_intel")
        .or(`content.ilike.${like},tags.cs.{${competitorName}}`)
        .limit(50),
      stateName
        ? supabase
            .from("state_dna")
            .select("category, attribute, value, source")
            .eq("state", stateName)
            .ilike("value", like)
            .limit(30)
        : Promise.resolve({ data: [] }),
      programName
        ? supabase
            .from("program_dna")
            .select("category, attribute, value, source")
            .eq("program", programName)
            .ilike("value", like)
            .limit(30)
        : Promise.resolve({ data: [] }),
      supabase
        .from("signals")
        .select("signal_title, signal_summary, severity, created_at, tags")
        .or(`signal_title.ilike.${like},signal_summary.ilike.${like},tags.cs.{${competitorName}}`)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("missions")
        .select("name, state, program_type, status")
        .contains("known_competitors", [competitorName])
        .limit(50),
      supabase
        .from("experts")
        .select("name, role, notes, tags")
        .or(`notes.ilike.${like},tags.cs.{${competitorName}}`)
        .limit(30),
    ]);

  const insights = (insightsRes?.data ?? []) as Array<{
    content: string; source: string | null; confidence: string | null; tags: string[] | null;
  }>;
  const stateDna = (stateDnaRes?.data ?? []) as Array<{
    category: string; attribute: string; value: string; source: string | null;
  }>;
  const programDna = (programDnaRes?.data ?? []) as Array<{
    category: string; attribute: string; value: string; source: string | null;
  }>;
  const signals = (signalsRes?.data ?? []) as Array<{
    signal_title: string; signal_summary: string | null; severity: string | null;
    created_at: string; tags: string[] | null;
  }>;
  const history = (historyRes?.data ?? []) as Array<{
    name: string; state: string | null; program_type: string | null; status: string | null;
  }>;
  const experts = (expertsRes?.data ?? []) as Array<{
    name: string; role: string | null; notes: string | null; tags: string[] | null;
  }>;

  const sourceCount =
    insights.length + stateDna.length + programDna.length + signals.length + history.length + experts.length;

  const wonByThemInState = history.filter(
    (m) =>
      m.status === "awarded" &&
      (stateName ? m.state === stateName : true) &&
      (programName ? m.program_type === programName : true),
  ).length;
  const recentWins = history.filter((m) => m.status === "awarded").length;
  const threat: CompetitorCard["threat_level"] =
    wonByThemInState >= 1 || recentWins >= 2
      ? "HIGH"
      : recentWins === 1 || sourceCount >= 5
        ? "MEDIUM"
        : "LOW";

  const sourceBlock = `
INSIGHTS (competitive_intel) — ${insights.length} record(s):
${insights.map((r) => `- [${r.confidence ?? "?"}] ${r.content}${r.source ? ` (src: ${r.source})` : ""}`).join("\n") || "(none)"}

STATE DNA for ${stateName ?? "(unknown state)"} — ${stateDna.length} record(s):
${stateDna.map((r) => `- ${r.category}/${r.attribute}: ${r.value}`).join("\n") || "(none)"}

PROGRAM DNA for ${programName ?? "(unknown program)"} — ${programDna.length} record(s):
${programDna.map((r) => `- ${r.category}/${r.attribute}: ${r.value}`).join("\n") || "(none)"}

RECENT SIGNALS — ${signals.length} record(s):
${signals.map((r) => `- [${r.created_at.slice(0, 10)}] ${r.signal_title}${r.signal_summary ? `: ${r.signal_summary}` : ""}`).join("\n") || "(none)"}

HISTORICAL MISSIONS where we encountered ${competitorName} — ${history.length} record(s):
${history.map((m) => `- ${m.name} | state=${m.state ?? "?"} | program=${m.program_type ?? "?"} | status=${m.status ?? "?"}`).join("\n") || "(none)"}

KNOWN PERSONNEL — ${experts.length} record(s):
${experts.map((e) => `- ${e.name}${e.role ? ` (${e.role})` : ""}${e.notes ? `: ${e.notes}` : ""}`).join("\n") || "(none)"}
`.trim();

  const system = `You are IRIS, an intelligence officer for a proposal management team. Using only the source intelligence provided, generate a structured competitor profile. Do not invent facts. If a section has no supporting data, write exactly: "No intelligence on file — add via competitor card below."

If overall source intelligence is sparse (fewer than 3 records total), open the incumbent_status with: "Limited intelligence available for ${competitorName}. The profile below is based on ${sourceCount} source records. Add intelligence manually to improve future analysis."

Return ONLY a valid JSON object with these exact keys:
{
  "incumbent_status": string (2-3 sentences),
  "how_they_win": string (3-4 sentences),
  "known_weaknesses": string (3-4 sentences),
  "win_loss_history": string (2-3 sentences),
  "likely_teaming": string (2-3 sentences),
  "pricing_posture": string (2-3 sentences),
  "key_personnel": string[] (names + roles),
  "recent_signals": string[] (most recent first, bullet-style strings),
  "how_we_beat_them": string (one specific counter-strategy paragraph for this mission, shown directly to writers),
  "confidence_level": "low" | "medium" | "high"
}`;

  const user = `COMPETITOR: ${competitorName}
PURSUIT CONTEXT: state=${stateName ?? "(unknown)"}, program=${programName ?? "(unknown)"}
TOTAL SOURCE RECORDS: ${sourceCount}

SOURCES:
${sourceBlock}`;

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 2000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (res.status === 402) throw new Error("Workspace is out of AI credits.");
  if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = j.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = (match ? safeJson(match[0]) : null) ?? {};

  const empty = "No intelligence on file — add via competitor card below.";
  return {
    competitor_name: competitorName,
    incumbent_status: str(parsed.incumbent_status, empty),
    how_they_win: str(parsed.how_they_win, empty),
    known_weaknesses: str(parsed.known_weaknesses, empty),
    win_loss_history: str(parsed.win_loss_history, empty),
    likely_teaming: str(parsed.likely_teaming, empty),
    pricing_posture: str(parsed.pricing_posture, empty),
    key_personnel: strArr(parsed.key_personnel),
    recent_signals: strArr(parsed.recent_signals),
    how_we_beat_them: str(
      parsed.how_we_beat_them,
      `Limited intelligence on ${competitorName}. Add competitive intel to unlock a specific counter-strategy.`,
    ),
    confidence_level: confLevel(parsed.confidence_level, sourceCount),
    source_count: sourceCount,
    threat_level: threat,
  };
}

async function generateLandscapeSummary(args: {
  apiKey: string;
  cards: CompetitorCard[];
  stateName: string | null;
  programName: string | null;
}): Promise<string> {
  const { apiKey, cards, stateName, programName } = args;
  const block = cards
    .map(
      (c) =>
        `- ${c.competitor_name} (threat=${c.threat_level}, conf=${c.confidence_level}): ${c.how_they_win}\n  weaknesses: ${c.known_weaknesses}`,
    )
    .join("\n");
  const system = `You are IRIS. In ONE tight paragraph (4-6 sentences), summarize the overall competitive landscape: who the real threats are, the competitive dynamic, and what it means for our positioning. No bullets, no preamble.`;
  const user = `Mission context: state=${stateName ?? "(unknown)"}, program=${programName ?? "(unknown)"}.

Competitor cards:
${block || "(no competitors)"}`;

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (!res.ok) return "IRIS could not generate a landscape summary at this time.";
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}
function str(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}
function confLevel(v: unknown, sourceCount: number): "low" | "medium" | "high" {
  if (v === "high" || v === "medium" || v === "low") return v;
  if (sourceCount >= 8) return "high";
  if (sourceCount >= 3) return "medium";
  return "low";
}
