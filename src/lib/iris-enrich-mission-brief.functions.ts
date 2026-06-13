// IRIS — Customer Intelligence enrichment for the Mission Brief.
// Pulls stakeholder_intelligence + executive_intelligence (JSONB), the
// per-mission experts table, and stakeholder-tagged insights/signals into
// one structured payload the Mission Brief generator (and UI) can consume.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type CustomerIntelligence = {
  stakeholders: Array<{ name: string; title?: string; org?: string; priorities?: string[]; concerns?: string[]; source: string }>;
  executives: Array<{ name?: string; role?: string; priorities?: string[]; political_context?: string; preferences?: string[] }>;
  experts: Array<{ id: string; name: string; role?: string | null; focus_areas: string[]; key_insights: string[]; source?: string | null }>;
  signals: Array<{ id: string; signal_type: string; title: string; summary: string; created_at: string }>;
  insights: Array<{ id: string; content: string; confidence: string | null; source: string | null; created_at: string }>;
  freshness: { generated_at: string };
};

function safeParseJson(v: unknown): any {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

function toStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : x?.text ?? x?.title ?? "")).filter(Boolean).map((s: string) => s.trim());
  }
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  return [];
}

function normalizeStakeholders(intel: any): CustomerIntelligence["stakeholders"] {
  const out: CustomerIntelligence["stakeholders"] = [];
  if (!intel || typeof intel !== "object") return out;
  const rows: any[] = Array.isArray(intel)
    ? intel
    : Array.isArray(intel?.contacts)
      ? intel.contacts
      : Array.isArray(intel?.stakeholders)
        ? intel.stakeholders
        : Array.isArray(intel?.people)
          ? intel.people
          : [];
  for (const r of rows) {
    if (!r) continue;
    const name = (r.name ?? r.full_name ?? r.contact ?? "").toString().trim();
    if (!name) continue;
    out.push({
      name,
      title: (r.title ?? r.role ?? r.position ?? undefined)?.toString().trim() || undefined,
      org: (r.organization ?? r.org ?? r.agency ?? undefined)?.toString().trim() || undefined,
      priorities: toStringArray(r.priorities ?? r.public_priorities),
      concerns: toStringArray(r.concerns ?? r.known_concerns),
      source: "stakeholder_intelligence",
    });
  }
  return out;
}

function normalizeExecutives(intel: any): CustomerIntelligence["executives"] {
  const out: CustomerIntelligence["executives"] = [];
  if (!intel || typeof intel !== "object") return out;
  const rows: any[] = Array.isArray(intel)
    ? intel
    : Array.isArray(intel?.executives)
      ? intel.executives
      : intel?.priorities || intel?.political_context || intel?.preferences
        ? [intel]
        : [];
  for (const r of rows) {
    if (!r) continue;
    out.push({
      name: (r.name ?? undefined)?.toString().trim() || undefined,
      role: (r.role ?? r.title ?? undefined)?.toString().trim() || undefined,
      priorities: toStringArray(r.priorities),
      political_context: (r.political_context ?? r.context ?? undefined)?.toString().trim() || undefined,
      preferences: toStringArray(r.preferences ?? r.known_preferences),
    });
  }
  return out;
}

const MissionIdInput = z.object({ mission_id: z.string().uuid() });

export const getMissionCustomerIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }): Promise<CustomerIntelligence> => {
    const supabase = context.supabase as Supa;
    return loadCustomerIntelligence(supabase, data.mission_id);
  });

export async function loadCustomerIntelligence(
  supabase: Supa,
  missionId: string,
): Promise<CustomerIntelligence> {
  const [missionRes, expertsRes, insightsRes, signalsRes] = await Promise.all([
    supabase
      .from("missions")
      .select("stakeholder_intelligence, executive_intelligence")
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("experts")
      .select("id, name, role, focus_areas, key_insights, source")
      .eq("mission_id", missionId)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("insights")
      .select("id, content, confidence, source, created_at, tags")
      .eq("mission_id", missionId)
      .contains("tags", ["stakeholder"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("signals")
      .select("id, signal_type, signal_title, signal_summary, created_at")
      .eq("mission_id", missionId)
      .in("signal_type", ["stakeholder", "expert", "relationship"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const mission = (missionRes?.data ?? null) as { stakeholder_intelligence?: unknown; executive_intelligence?: unknown } | null;
  const stakeholders = normalizeStakeholders(safeParseJson(mission?.stakeholder_intelligence));
  const executives = normalizeExecutives(safeParseJson(mission?.executive_intelligence));

  const experts = ((expertsRes?.data ?? []) as any[]).map((e) => ({
    id: e.id as string,
    name: (e.name ?? "Unnamed") as string,
    role: (e.role ?? null) as string | null,
    focus_areas: toStringArray(e.focus_areas),
    key_insights: toStringArray(e.key_insights),
    source: (e.source ?? null) as string | null,
  }));

  const insights = ((insightsRes?.data ?? []) as any[]).map((i) => ({
    id: i.id as string,
    content: String(i.content ?? ""),
    confidence: (i.confidence ?? null) as string | null,
    source: (i.source ?? null) as string | null,
    created_at: i.created_at as string,
  }));

  const signals = ((signalsRes?.data ?? []) as any[]).map((s) => ({
    id: s.id as string,
    signal_type: s.signal_type as string,
    title: String(s.signal_title ?? ""),
    summary: String(s.signal_summary ?? ""),
    created_at: s.created_at as string,
  }));

  return {
    stakeholders,
    executives,
    experts,
    signals,
    insights,
    freshness: { generated_at: new Date().toISOString() },
  };
}

/** Render a "CUSTOMER INTELLIGENCE" block for prompt context. */
export function renderCustomerIntelligenceBlock(ci: CustomerIntelligence): string {
  const has =
    ci.stakeholders.length || ci.executives.length || ci.experts.length || ci.insights.length || ci.signals.length;
  if (!has) return "";

  const stakeholderLines = [
    ...ci.stakeholders.map((s) =>
      `- ${s.name}${s.title ? `, ${s.title}` : ""}${s.org ? ` (${s.org})` : ""}${s.priorities?.length ? ` | priorities: ${s.priorities.join("; ")}` : ""}${s.concerns?.length ? ` | concerns: ${s.concerns.join("; ")}` : ""}`,
    ),
    ...ci.experts.map((e) =>
      `- ${e.name}${e.role ? `, ${e.role}` : ""}${e.focus_areas.length ? ` | focus: ${e.focus_areas.join("/")}` : ""}${e.key_insights.length ? ` | notes: ${e.key_insights.slice(0, 2).join(" / ")}` : ""}${e.source ? ` [src: ${e.source}]` : ""}`,
    ),
  ];

  const execLines = ci.executives.map((e) =>
    `- ${e.name ?? "(unnamed)"}${e.role ? `, ${e.role}` : ""}${e.priorities?.length ? ` | priorities: ${e.priorities.join("; ")}` : ""}${e.political_context ? ` | context: ${e.political_context}` : ""}${e.preferences?.length ? ` | preferences: ${e.preferences.join("; ")}` : ""}`,
  );

  const insightLines = ci.insights.map((i) => `- [${i.confidence ?? "?"}] ${i.content}${i.source ? ` (src: ${i.source})` : ""}`);
  const signalLines = ci.signals.map((s) => `- [${s.signal_type}] ${s.title}${s.summary ? ` — ${s.summary.slice(0, 200)}` : ""}`);

  return `=== CUSTOMER INTELLIGENCE (who decides, what they care about) ===
Key Stakeholders:
${stakeholderLines.length ? stakeholderLines.join("\n") : "(none)"}

Executive Priorities:
${execLines.length ? execLines.join("\n") : "(none)"}

Known Relationships / Stakeholder Signals (recent insights):
${insightLines.length ? insightLines.join("\n") : "(none)"}

Recent Intelligence Signals:
${signalLines.length ? signalLines.join("\n") : "(none)"}

`;
}

// ---- Thread → Expert capture ----

const AddExpertInput = z.object({
  mission_id: z.string().uuid(),
  question_id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  role: z.string().max(200).optional(),
  excerpt: z.string().max(2000).optional(),
});

export const addExpertFromThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AddExpertInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;

    // Dedupe: skip if same mission+name already exists.
    const { data: existing } = await supabase
      .from("experts")
      .select("id")
      .eq("mission_id", data.mission_id)
      .ilike("name", data.name.trim())
      .maybeSingle();
    if (existing?.id) return { ok: true, id: existing.id as string, skipped: true };

    const { data: inserted, error } = await supabase
      .from("experts")
      .insert({
        mission_id: data.mission_id,
        name: data.name.trim(),
        role: data.role?.trim() || null,
        source: "thread_mention",
        key_insights: data.excerpt ? [data.excerpt.slice(0, 800)] : [],
        focus_areas: [],
        notes: data.excerpt ? data.excerpt.slice(0, 1500) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as any).id as string, skipped: false };
  });

/**
 * Lightweight regex-based stakeholder detection. Returns candidate names
 * with optional roles. Pure function — safe for client use too.
 */
export function detectStakeholderCandidates(text: string): Array<{ name: string; role?: string }> {
  if (!text || text.length < 8) return [];
  const found: Array<{ name: string; role?: string }> = [];
  const seen = new Set<string>();
  const pushIf = (name: string, role?: string) => {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ name, role });
    }
  };
  const NAME = "[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}";
  // "spoke with Jane Doe, Director of …"
  const re1 = new RegExp(`\\b(?:spoke|met|talked|met with|spoke with|call(?:ed)? with)\\s+(?:to\\s+)?(${NAME})(?:\\s*,\\s*([^.,\\n]{3,80}))?`, "g");
  // "Jane Doe from Agency"
  const re2 = new RegExp(`\\b(${NAME})\\s+(?:from|at|of)\\s+([A-Z][\\w&.\\- ]{2,60})`, "g");
  // "Jane Doe, Director"
  const re3 = new RegExp(`\\b(${NAME})\\s*,\\s*((?:Director|Deputy|Commissioner|Secretary|Administrator|Manager|Chief|Lead|Officer|Coordinator|VP|President|CEO|CFO|CIO|CTO)[^.,\\n]{0,60})`, "g");

  for (const re of [re1, re2, re3]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      pushIf(m[1].trim(), (m[2] ?? "").trim() || undefined);
      if (found.length >= 5) return found;
    }
  }
  return found;
}
