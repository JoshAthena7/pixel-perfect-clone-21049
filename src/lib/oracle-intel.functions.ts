/**
 * ORACLE intake server functions.
 *
 * - addOracleIntel: insert a typed intel row into oracle_signals (and optionally
 *   into oracle_quality_measures / oracle_sdoh_data), then log into intel_events
 *   so the Intelligence feed picks it up immediately.
 * - suggestOracleTaxonomy: ask Lovable AI to pick 3–5 oracle_taxonomy node_codes
 *   that best match a piece of intel based on its title/summary/category.
 * - listOracleTaxonomy / listMissionWinThemes: small reads used by the modal.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ============ shared ============ */

export type OracleCategoryKey =
  | "regulatory"
  | "quality"
  | "sdoh"
  | "policy_innovation"
  | "evidence"
  | "field"
  | "competitive"
  | "client_content";

/** Map our 8 UI categories to oracle_signals.signal_type CHECK values. */
const SIGNAL_TYPE_FROM_CATEGORY: Record<OracleCategoryKey, string> = {
  regulatory: "policy",
  quality: "operational",
  sdoh: "operational",
  policy_innovation: "policy",
  evidence: "operational",
  field: "market",
  competitive: "competitor",
  client_content: "operational",
};

/** Domain in oracle_taxonomy that "owns" this category — used as a fallback tag. */
const TAXONOMY_DOMAIN_FROM_CATEGORY: Record<OracleCategoryKey, string> = {
  regulatory: "REGULATORY_AUTHORITY",
  quality: "QUALITY_PERFORMANCE",
  sdoh: "HEALTH_OUTCOMES_SDOH",
  policy_innovation: "POLICY_INNOVATION",
  evidence: "EVIDENCE_BASE",
  field: "FIELD_INTELLIGENCE",
  competitive: "COMPETITIVE_LANDSCAPE",
  client_content: "CLIENT_CONTENT_MAP",
};

/* ============ list taxonomy ============ */

export const listOracleTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("oracle_taxonomy")
      .select("id, parent_id, domain, node_code, node_name, depth, is_leaf")
      .order("domain")
      .order("depth")
      .order("node_code");
    if (error) throw error;
    return data ?? [];
  });

/* ============ list win themes for a mission ============ */

export const listMissionWinThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cfg } = await context.supabase
      .from("oracle_engagement_config")
      .select("win_themes")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const raw = (cfg?.win_themes ?? []) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r) => {
        if (typeof r === "string") return { id: r, text: r };
        if (r && typeof r === "object") {
          const obj = r as Record<string, unknown>;
          const text = typeof obj.text === "string" ? obj.text : null;
          const id = typeof obj.id === "string" ? obj.id : text;
          return text && id ? { id, text } : null;
        }
        return null;
      })
      .filter((x): x is { id: string; text: string } => x !== null);
  });

/* ============ taxonomy suggestion via Lovable AI ============ */

const SuggestInput = z.object({
  title: z.string().min(1),
  summary: z.string().min(1).max(2000),
  category: z.enum([
    "regulatory",
    "quality",
    "sdoh",
    "policy_innovation",
    "evidence",
    "field",
    "competitive",
    "client_content",
  ]),
});

export const suggestOracleTaxonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuggestInput.parse(d))
  .handler(async ({ data, context }): Promise<{ codes: string[]; error?: string }> => {
    // Pull the taxonomy so the model only picks from real node_codes
    const { data: taxRows } = await context.supabase
      .from("oracle_taxonomy")
      .select("node_code, node_name, domain")
      .order("domain")
      .order("node_code");
    const taxonomy = (taxRows ?? []) as Array<{ node_code: string; node_name: string; domain: string }>;
    const valid = new Set(taxonomy.map((t) => t.node_code));

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { codes: [], error: "AI gateway not configured" };

    const taxonomyList = taxonomy
      .map((t) => `${t.node_code} — ${t.node_name} (${t.domain})`)
      .join("\n");

    const prompt = `Title: ${data.title}\nCategory: ${data.category}\nSummary: ${data.summary}\n\nReturn exactly 3 to 5 node_codes from the taxonomy that best classify this intel. Reply with ONLY a JSON array of node_code strings — no prose, no markdown.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "raw",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are ORACLE's taxonomy classifier. Pick 3–5 node_codes from this exact list. Respond with a JSON array of strings, nothing else.\n\nAvailable codes:\n${taxonomyList}`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return { codes: [], error: `AI gateway ${res.status}` };
      const j = await res.json();
      let txt: string = (j.choices?.[0]?.message?.content ?? "").trim();
      // strip ``` fences if model added them
      txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const parsed: unknown = JSON.parse(txt);
      if (!Array.isArray(parsed)) return { codes: [] };
      const codes = parsed
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => valid.has(s))
        .slice(0, 5);
      return { codes };
    } catch (e) {
      return { codes: [], error: e instanceof Error ? e.message : "fetch failed" };
    }
  });

/* ============ add intel ============ */

const QualityInput = z.object({
  measure_set: z.string().optional(),
  measure_code: z.string().optional(),
  measure_name: z.string().optional(),
  national_benchmark: z.number().nullable().optional(),
  state_benchmark: z.number().nullable().optional(),
  mco_rate: z.number().nullable().optional(),
  data_year: z.number().int().nullable().optional(),
});

const SdohInput = z.object({
  sdoh_domain: z.string().optional(),
  geography_type: z.string().optional(),
  geography_name: z.string().optional(),
  prevalence_rate: z.number().nullable().optional(),
  national_benchmark: z.number().nullable().optional(),
  data_year: z.number().int().nullable().optional(),
  data_source: z.string().optional(),
});

const AddIntelInput = z.object({
  missionId: z.string().uuid(),
  tier: z.enum(["platform", "state", "mission"]),
  state_code: z.string().length(2).optional().nullable(),
  category: z.enum([
    "regulatory",
    "quality",
    "sdoh",
    "policy_innovation",
    "evidence",
    "field",
    "competitive",
    "client_content",
  ]),
  // base fields
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(2000),
  source_name: z.string().min(1).max(200),
  source_url: z.string().url().optional().nullable().or(z.literal("")),
  published_at: z.string().optional().nullable(),
  topic_tags: z.array(z.string()).default([]),
  // classification
  taxonomy_node_codes: z.array(z.string()).default([]),
  win_theme_tags: z.array(z.string()).default([]),
  jpb_variable_tags: z.array(z.string()).default([]),
  // type-specific blobs (free-form, validated loosely)
  subcategory: z.string().optional().nullable(),
  authority: z.enum(["primary", "secondary", "tertiary"]).optional().default("tertiary"),
  effective_date: z.string().optional().nullable(),
  expiration_date: z.string().optional().nullable(),
  full_text: z.string().optional().nullable(),
  quality: QualityInput.optional(),
  sdoh: SdohInput.optional(),
  extra: z.record(z.string(), z.unknown()).optional(), // misc per-category fields
});

export const addOracleIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddIntelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve mission for state_code default + author display name
    const { data: mission } = await supabase
      .from("missions")
      .select("id, state_code, name")
      .eq("id", data.missionId)
      .maybeSingle();

    const stateCode =
      data.tier === "state"
        ? (data.state_code ?? mission?.state_code ?? null)
        : data.tier === "mission"
        ? (mission?.state_code ?? null)
        : null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();
    const authorName = profile?.display_name ?? profile?.email ?? "A team member";

    // Resolve taxonomy node_code → uuid
    let taxonomyIds: string[] = [];
    if (data.taxonomy_node_codes.length > 0) {
      const { data: nodes } = await supabase
        .from("oracle_taxonomy")
        .select("id, node_code")
        .in("node_code", data.taxonomy_node_codes);
      taxonomyIds = (nodes ?? []).map((n) => n.id as string);
    }

    const signal_type =
      ({
        regulatory: "policy",
        quality: "operational",
        sdoh: "operational",
        policy_innovation: "policy",
        evidence: "operational",
        field: "market",
        competitive: "competitor",
        client_content: "operational",
      } as Record<string, string>)[data.category] ?? "operational";

    const taxonomyDomain =
      ({
        regulatory: "REGULATORY_AUTHORITY",
        quality: "QUALITY_PERFORMANCE",
        sdoh: "HEALTH_OUTCOMES_SDOH",
        policy_innovation: "POLICY_INNOVATION",
        evidence: "EVIDENCE_BASE",
        field: "FIELD_INTELLIGENCE",
        competitive: "COMPETITIVE_LANDSCAPE",
        client_content: "CLIENT_CONTENT_MAP",
      } as Record<string, string>)[data.category] ?? null;

    const insertRow: Record<string, unknown> = {
      mission_id: data.tier === "mission" ? data.missionId : null,
      signal_type,
      title: data.title.trim(),
      summary: data.summary.trim(),
      what_happened: data.summary.trim(),
      why_it_matters: (data.extra?.why_it_matters as string | undefined) ?? null,
      recommended_action: (data.extra?.recommended_action as string | undefined) ?? null,
      source_name: data.source_name.trim(),
      tier: data.tier,
      scope_tier: data.tier,
      state_code: stateCode,
      authority: data.authority ?? "tertiary",
      taxonomy_node_ids: taxonomyIds,
      topic_tags: data.topic_tags,
      win_theme_tags: data.win_theme_tags,
      jpb_variable_tags: data.jpb_variable_tags,
      published_at: data.published_at || null,
      effective_date: data.effective_date || null,
      expiration_date: data.expiration_date || null,
      status: "needs_review",
      ingestion_source: "manual",
      metadata: {
        category: data.category,
        category_domain: taxonomyDomain,
        subcategory: data.subcategory ?? null,
        source_url: data.source_url || null,
        full_text: data.full_text ?? null,
        extra: data.extra ?? {},
        author_id: userId,
        author_name: authorName,
      },
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("oracle_signals")
      .insert(insertRow as never)
      .select("id")
      .single();
    if (insertErr) throw new Error(`Failed to add ORACLE intel: ${insertErr.message}`);
    const signalId = inserted!.id as string;

    // Quality measure linkage
    if (data.category === "quality" && data.quality) {
      await supabase.from("oracle_quality_measures").insert({
        mission_id: data.tier === "mission" ? data.missionId : null,
        state_code: stateCode,
        measurement_year: data.quality.data_year ?? null,
        measure_set: data.quality.measure_set ?? null,
        measure_code: data.quality.measure_code ?? null,
        measure_name: data.quality.measure_name ?? null,
        national_medicaid_benchmark: data.quality.national_benchmark ?? null,
        state_benchmark: data.quality.state_benchmark ?? null,
        mco_rate: data.quality.mco_rate ?? null,
        oracle_node_id: taxonomyIds[0] ?? null,
        source_document: data.source_name,
        source_url: data.source_url || null,
      } as never);
    }

    // SDOH linkage
    if (data.category === "sdoh" && data.sdoh) {
      await supabase.from("oracle_sdoh_data").insert({
        mission_id: data.tier === "mission" ? data.missionId : null,
        state_code: stateCode,
        sdoh_domain: data.sdoh.sdoh_domain ?? null,
        sdoh_measure: data.title,
        geography_type: data.sdoh.geography_type ?? null,
        geography_name: data.sdoh.geography_name ?? null,
        prevalence_rate: data.sdoh.prevalence_rate ?? null,
        national_benchmark: data.sdoh.national_benchmark ?? null,
        data_year: data.sdoh.data_year ?? null,
        data_source: data.sdoh.data_source ?? data.source_name,
        source_url: data.source_url || null,
      } as never);
    }

    // Activity stream (intel_events) so the Intelligence Feed shows it immediately
    const scopeLabel =
      data.tier === "platform" ? "platform" : data.tier === "state" ? `${stateCode ?? "state"}` : "mission";
    await supabase.from("intel_events").insert({
      mission_id: data.missionId,
      event_type: "manual",
      title: data.title.trim(),
      content: `${authorName} added ${data.category} intel to ORACLE: ${data.summary.trim()}`,
      source_type: "oracle",
      source_id: signalId as never,
      source_url: data.source_url || null,
      output_type: "signal",
      generated_by: "human",
      signal_category: data.category,
      confidence: "medium",
      tags: data.topic_tags,
      extracted_summary: `Added to ORACLE (${scopeLabel} scope)`,
    } as never);

    // Mission Radar event log (silent on failure — observability only)
    try {
      await supabase.from("mission_assist_events").insert({
        mission_id: data.missionId,
        question_id: null,
        user_id: userId,
        event_type: "oracle_intel_added",
        metadata: {
          summary: `${authorName} added ${data.category} intel: ${data.title.trim().slice(0, 80)}`,
          signal_id: signalId,
          category: data.category,
          scope: scopeLabel,
        },
      } as never);
    } catch (e) {
      console.warn("[oracle-intel] assist event insert failed", e);
    }

    return { ok: true, signalId, scope: scopeLabel };
  });

/* ============ list oracle_signals for a mission's feed ============ */

export const listOracleSignalsForMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mission } = await context.supabase
      .from("missions")
      .select("state_code")
      .eq("id", data.missionId)
      .maybeSingle();
    const stateCode = mission?.state_code ?? null;

    // We can't OR across three tier conditions cleanly in PostgREST without
    // .or() string; build it.
    const orParts = [`tier.eq.platform`, `and(tier.eq.mission,mission_id.eq.${data.missionId})`];
    if (stateCode) orParts.push(`and(tier.eq.state,state_code.eq.${stateCode})`);

    const { data: rows, error } = await context.supabase
      .from("oracle_signals")
      .select(
        "id, title, summary, what_happened, signal_type, status, tier, scope_tier, state_code, mission_id, topic_tags, win_theme_tags, taxonomy_node_ids, source_name, published_at, created_at, metadata",
      )
      .in("status", ["approved", "pushed", "needs_review"])
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });
