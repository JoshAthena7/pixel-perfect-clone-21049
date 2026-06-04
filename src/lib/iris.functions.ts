import { createServerFn } from "@tanstack/react-start";
import { withPersonFirst } from "./person-first";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

/* ──────────────── iris-mission-pulse ────────────────
   Reads signals for a mission, groups by severity, returns top 5 attention
   items (critical + warning + info). */
export const irisMissionPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signals, error } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,signal_summary,severity,status,related_question_id,created_at")
      .eq("mission_id", data.missionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const all = signals ?? [];
    const groups = {
      critical: all.filter((s) => s.severity === "critical"),
      warning: all.filter((s) => s.severity === "warning"),
      info: all.filter((s) => s.severity === "info"),
    };
    const top = [...groups.critical, ...groups.warning, ...groups.info].slice(0, 5);
    return {
      counts: {
        critical: groups.critical.length,
        warning: groups.warning.length,
        info: groups.info.length,
        total: all.length,
      },
      top,
    };
  });

/* ──────────────── iris-leadership-attention ────────────────
   Aggregates across missions for the current user. Returns per-mission
   attention rollup + global counts. */
export const irisLeadershipAttention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: missions } = await supabase.from("missions").select("id,name,client");
    const ids = (missions ?? []).map((m) => m.id);

    if (ids.length === 0) {
      return { missions: [], totals: { escalations: 0, criticalSignals: 0, lowScores: 0, conflicts: 0, atRiskAssumptions: 0, highRisks: 0 } };
    }

    const [escRes, sigRes, qRes, confRes, asmRes, riskRes] = await Promise.all([
      supabase.from("escalations").select("id,mission_id,severity,status").eq("status", "Open"),
      supabase.from("signals").select("id,mission_id,severity").eq("severity", "critical").eq("status", "open"),
      supabase.from("question_records").select("id,mission_id,current_score").lt("current_score", 3.0),
      supabase.from("alignment_conflicts").select("id,mission_id").is("resolved_at", null),
      supabase.from("mission_assumptions").select("id,mission_id,status").eq("status", "at_risk"),
      supabase.from("mission_risks").select("id,mission_id,severity,status").eq("severity", "High").neq("status", "Closed"),
    ]);

    const count = <T extends { mission_id: string }>(rows: T[] | null, mid: string) =>
      (rows ?? []).filter((r) => r.mission_id === mid).length;

    const perMission = (missions ?? []).map((m) => {
      const esc = count(escRes.data as { mission_id: string }[] | null, m.id);
      const crit = count(sigRes.data as { mission_id: string }[] | null, m.id);
      const low = count(qRes.data as { mission_id: string }[] | null, m.id);
      const conf = count(confRes.data as { mission_id: string }[] | null, m.id);
      const atRisk = count(asmRes.data as { mission_id: string }[] | null, m.id);
      const highRisk = count(riskRes.data as { mission_id: string }[] | null, m.id);
      const score = esc * 25 + crit * 10 + low * 5 + conf * 8 + atRisk * 6 + highRisk * 7;
      return {
        mission_id: m.id,
        name: m.name,
        client: m.client,
        attention_score: score,
        breakdown: { escalations: esc, criticalSignals: crit, lowScores: low, conflicts: conf, atRiskAssumptions: atRisk, highRisks: highRisk },
      };
    });

    perMission.sort((a, b) => b.attention_score - a.attention_score);

    return {
      missions: perMission,
      totals: {
        escalations: escRes.data?.length ?? 0,
        criticalSignals: sigRes.data?.length ?? 0,
        lowScores: qRes.data?.length ?? 0,
        conflicts: confRes.data?.length ?? 0,
        atRiskAssumptions: asmRes.data?.length ?? 0,
        highRisks: riskRes.data?.length ?? 0,
      },
    };
  });

/* ──────────────── iris-decision-memory ────────────────
   Returns mission_decisions with the signal history surrounding each. */
export const irisDecisionMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: decisions } = await supabase
      .from("mission_decisions")
      .select("id,title,status,owner,rationale,decided_at,question_id,created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    const decs = decisions ?? [];
    if (decs.length === 0) return { decisions: [] };

    const ids = decs.map((d) => d.id);
    const { data: sigs } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,severity,created_at,related_decision_id,related_question_id")
      .eq("mission_id", data.missionId)
      .or(`related_decision_id.in.(${ids.join(",")}),signal_type.eq.decision_logged`);

    return {
      decisions: decs.map((d) => ({
        ...d,
        signals: (sigs ?? []).filter(
          (s) => s.related_decision_id === d.id || (s.related_question_id && s.related_question_id === d.question_id),
        ),
      })),
    };
  });

/* ──────────────── iris-assumption-registry ────────────────
   Returns mission_assumptions with a simple confidence trend derived from
   created vs last_validated dates and current status. */
export const irisAssumptionRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: asm } = await supabase
      .from("mission_assumptions")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    const rows = asm ?? [];

    const withTrend = rows.map((a) => {
      const trend =
        a.status === "validated" ? "up" :
        a.status === "invalidated" || a.status === "at_risk" ? "down" :
        a.last_validated_date ? "stable" : "unknown";
      return { ...a, trend };
    });

    return {
      assumptions: withTrend,
      summary: {
        total: rows.length,
        at_risk: rows.filter((a) => a.status === "at_risk").length,
        invalidated: rows.filter((a) => a.status === "invalidated").length,
        validated: rows.filter((a) => a.status === "validated").length,
      },
    };
  });

/* Question-scoped recent signals — used by Question Workspace panel. */
export const irisQuestionSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid(), limit: z.number().min(1).max(20).default(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sigs, error } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,signal_summary,severity,created_at")
      .eq("related_question_id", data.questionId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { signals: sigs ?? [] };
  });

/* ──────────────── iris-generate-briefing-section ────────────────
   Generates external intelligence text for one Briefing Book section
   using Lovable AI Gateway. Upserts into briefing_book_sections. */
const SECTION_PROMPTS: Record<string, { title: string; prompt: string }> = {
  political_landscape: {
    title: "Political Landscape",
    prompt: "Summarize the current political landscape for Medicaid policy in this state: governor stance, legislature priorities, recent reform efforts. Be concrete and concise (4-6 bullets).",
  },
  state_priorities: {
    title: "State Priorities",
    prompt: "List what the state has publicly prioritized for this Medicaid procurement (member outcomes, equity, cost containment, innovation, etc.). 4-6 bullets.",
  },
  procurement_landscape: {
    title: "Procurement Landscape",
    prompt: "Summarize the state's procurement history for Medicaid managed care: prior awards, evaluation patterns, scoring tendencies, common red flags. 4-6 bullets.",
  },
  incumbent_analysis: {
    title: "Incumbent Analysis",
    prompt: "Identify the likely incumbent MCO(s) for this contract and analyze their strengths, weaknesses, and known performance issues. 4-6 bullets.",
  },
  provider_landscape: {
    title: "Provider Landscape",
    prompt: "Describe the provider and MCO market dynamics in this state: network adequacy, provider consolidation, access gaps. 4-6 bullets.",
  },
  advocacy_landscape: {
    title: "Advocacy Landscape",
    prompt: "Identify the most influential advocacy groups, community organizations, and vocal stakeholders shaping Medicaid policy in this state. 4-6 bullets.",
  },
  policy_regulatory: {
    title: "Policy & Regulatory Climate",
    prompt: "Summarize recent CMS guidance, federal rule changes, and state regulatory developments affecting this procurement. 4-6 bullets.",
  },
  hot_issues: {
    title: "Hot Issues",
    prompt: "List emerging issues, recent news, and topics evaluators are likely to scrutinize right now (e.g. redetermination, mental health parity, SDOH). 4-6 bullets.",
  },
  stakeholder_concerns: {
    title: "Stakeholder Concerns",
    prompt: "Identify known pain points and agency leadership priorities the response must address. 4-6 bullets.",
  },
  innovation_opportunities: {
    title: "Innovation Opportunities",
    prompt: "Identify what would differentiate a winning response: novel programs, technology, partnership models, outcomes commitments. 4-6 bullets.",
  },
  recommended_positioning: {
    title: "Recommended Positioning",
    prompt: "Recommend the overall positioning and 2-3 win themes for this proposal. Be specific and persuasive.",
  },
  risks_opportunities: {
    title: "Risks & Opportunities",
    prompt: "List the top competitive risks and strategic opportunities for this bid. 4-6 bullets, paired.",
  },
};

export const BRIEFING_SECTION_KEYS = Object.keys(SECTION_PROMPTS);
export const BRIEFING_SECTION_TITLES = Object.fromEntries(
  Object.entries(SECTION_PROMPTS).map(([k, v]) => [k, v.title]),
) as Record<string, string>;

export const irisGenerateBriefingSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      sectionKey: z.string().min(1).max(64),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cfg = SECTION_PROMPTS[data.sectionKey];
    if (!cfg) throw new Error("Unknown section key");

    const { data: existing } = await supabase
      .from("briefing_book_sections")
      .select("id,content,sources,version_number,generated_at,mission_id,section_key")
      .eq("mission_id", data.missionId)
      .eq("section_key", data.sectionKey)
      .maybeSingle();


    const { data: m } = await supabase
      .from("missions")
      .select("name,client,state,description,submission_date")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!m) throw new Error("Mission not found");

    const apiKey = process.env.LOVABLE_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    let content = "";
    type SourceRef = { type: "web"; url: string; title?: string; source?: string; date?: string };
    const grounded: SourceRef[] = [];
    let groundingText = "";

    if (firecrawlKey) {
      try {
        const q = `${cfg.title} ${m.state ?? ""} Medicaid ${m.client ?? ""}`.trim();
        const fcRes = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
        });
        if (fcRes.ok) {
          const j = (await fcRes.json()) as { data?: Array<{ url?: string; title?: string; markdown?: string; description?: string }> };
          const hits = j.data ?? [];
          for (const h of hits) {
            if (h.url) grounded.push({ type: "web", url: h.url, title: h.title, source: h.title });
          }
          groundingText = hits
            .slice(0, 5)
            .map((h, i) => `[${i + 1}] ${h.title ?? h.url}\n${(h.markdown ?? h.description ?? "").slice(0, 1200)}`)
            .join("\n\n---\n\n");
        }
      } catch { /* non-fatal */ }
    }

    if (apiKey) {
      const sys = `You are IRIS, an intelligence analyst for Medicaid procurement consultants. Generate concise, specific, defensible external intelligence for one briefing book section. Use markdown bullets. Do not hedge. Do not preface with "Here is" — output the content directly.${groundingText ? " When you use a fact from the provided SOURCES, cite it inline like [1], [2]." : ""}`;
      const user = `Mission: ${m.name}\nClient: ${m.client}\nState: ${m.state ?? "Unknown"}\nSubmission: ${m.submission_date ?? "TBD"}\n${m.description ? `Context: ${m.description}\n` : ""}\nSection: ${cfg.title}\n\nTask: ${cfg.prompt}${groundingText ? `\n\nSOURCES:\n${groundingText}` : ""}`;
      try {
        const res = await withAICircuit(async () => {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: withPersonFirst(sys) },
                { role: "user", content: user },
              ],
            }),
          });
          if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
          return r;
        });
        if (res.ok) {
          const json: any = await res.json();
          content = json?.choices?.[0]?.message?.content ?? "";
        } else {
          content = `_IRIS gateway returned ${res.status}. Section content unavailable._`;
        }
      } catch (e: any) {
        content = `_IRIS error: ${e?.message ?? "unknown"}._`;
      }
    } else {
      content = `_IRIS is not yet configured (missing LOVABLE_API_KEY). Once enabled, this section will be auto-generated._`;
    }

    const now = new Date().toISOString();
    const nextVersion = (existing?.version_number ?? 0) + 1;

    // ARCH-2: snapshot prior content to history, prune to last 5
    if (existing?.id && existing.content) {
      await supabase.from("briefing_book_section_history").insert({
        section_id: existing.id,
        mission_id: existing.mission_id,
        section_key: existing.section_key,
        content: existing.content,
        sources: (existing.sources as any) ?? [],
        version_number: existing.version_number ?? 1,
        generated_by: "IRIS",
      });
      const { data: keep } = await supabase
        .from("briefing_book_section_history")
        .select("id")
        .eq("section_id", existing.id)
        .order("version_number", { ascending: false })
        .limit(5);
      const keepIds = (keep ?? []).map((r) => r.id);
      if (keepIds.length) {
        await supabase
          .from("briefing_book_section_history")
          .delete()
          .eq("section_id", existing.id)
          .not("id", "in", `(${keepIds.join(",")})`);
      }
    }

    const { error } = await supabase
      .from("briefing_book_sections")
      .upsert(
        {
          mission_id: data.missionId,
          section_key: data.sectionKey,
          content,
          sources: grounded as unknown as never,
          status: "ready",
          generated_at: now,
          updated_at: now,
          version_number: nextVersion,
        },
        { onConflict: "mission_id,section_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, content, generated_at: now, version_number: nextVersion, sources: grounded.length };
  });
