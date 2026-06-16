/**
 * Evaluator Priorities — generates and persists the Evaluator Lens items
 * shown on the Briefing page from real mission context (oracle config +
 * mission RFP intelligence), not a hardcoded list.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EvaluatorPriority = { label: string; detail: string };

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function flatten(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(" | ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (o.title || o.name || o.theme || o.text)
      ? String(o.title ?? o.name ?? o.theme ?? o.text)
      : JSON.stringify(v);
  }
  return String(v);
}

export const getEvaluatorPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EvaluatorPriority[]> => {
    const { supabase } = context;
    const { data: cfg } = await supabase
      .from("oracle_engagement_config")
      .select("evaluator_priorities")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const raw = Array.isArray((cfg as any)?.evaluator_priorities)
      ? ((cfg as any).evaluator_priorities as any[])
      : [];
    return raw
      .map((it): EvaluatorPriority | null => {
        const label = String(it?.label ?? "").trim();
        if (!label) return null;
        return { label, detail: String(it?.detail ?? "").trim() };
      })
      .filter((x): x is EvaluatorPriority => !!x);
  });

export const generateEvaluatorPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EvaluatorPriority[]> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    const { supabase } = context;
    const { missionId } = data;

    const [mRes, oRes, docsRes] = await Promise.all([
      supabase.from("missions")
        .select("name, state, client_name, program_type, why_it_matters")
        .eq("id", missionId).maybeSingle(),
      supabase.from("oracle_engagement_config")
        .select("north_star, win_themes, top_risks, evaluator_priorities")
        .eq("mission_id", missionId).maybeSingle(),
      supabase.from("mission_documents")
        .select("extracted_text")
        .eq("mission_id", missionId)
        .not("extracted_text", "is", null)
        .limit(3),
    ]);

    // If already populated (e.g. another request beat us), return it.
    const existing = Array.isArray((oRes.data as any)?.evaluator_priorities)
      ? ((oRes.data as any).evaluator_priorities as any[])
      : [];
    if (existing.length > 0) {
      return existing
        .map((it): EvaluatorPriority | null => {
          const label = String(it?.label ?? "").trim();
          if (!label) return null;
          return { label, detail: String(it?.detail ?? "").trim() };
        })
        .filter((x): x is EvaluatorPriority => !!x);
    }

    const m: any = mRes.data ?? {};
    const o: any = oRes.data ?? {};
    const docText = (docsRes.data ?? [])
      .map((d: any) => String(d.extracted_text ?? ""))
      .join("\n\n");

    const winThemes = flatten(o.win_themes);
    const topRisks = flatten(o.top_risks);

    const userPrompt = [
      `Mission: ${m.name ?? "—"}`,
      `State: ${m.state ?? "—"}`,
      `Client: ${m.client_name ?? "—"}`,
      `Program type: ${m.program_type ?? "—"}`,
      `North star: ${o.north_star ?? "—"}`,
      `Win themes: ${truncate(winThemes, 800)}`,
      `Top risks: ${truncate(topRisks, 400)}`,
      `Why it matters: ${m.why_it_matters ?? "—"}`,
      `RFP excerpt: ${truncate(docText, 3000)}`,
      ``,
      `What are the 5-6 specific criteria evaluators will use to score this proposal?`,
      `Be specific to this procurement — NOT generic Medicaid procurement criteria.`,
      `Return JSON only in this exact shape:`,
      `{ "priorities": [{ "label": "short title (3-6 words)", "detail": "one sentence explaining why evaluators weight it" }] }`,
    ].join("\n");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are IRIS, intelligence co-pilot for Athena Strategy Group. Speak with the specificity of someone who has read this exact RFP. No generic checklist items." },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (r.status === 402) throw new Error("Out of AI credits.");
    if (r.status === 429) throw new Error("AI rate limited. Try again shortly.");
    if (!r.ok) throw new Error(`AI gateway returned ${r.status}.`);

    const j: any = await r.json();
    const raw = String(j?.choices?.[0]?.message?.content ?? "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
      }
    }

    const priorities: EvaluatorPriority[] = Array.isArray(parsed?.priorities)
      ? parsed.priorities
          .map((p: any): EvaluatorPriority | null => {
            const label = String(p?.label ?? "").trim();
            if (!label) return null;
            return { label, detail: String(p?.detail ?? "").trim() };
          })
          .filter((x: EvaluatorPriority | null): x is EvaluatorPriority => !!x)
          .slice(0, 6)
      : [];

    if (priorities.length === 0) {
      throw new Error("AI did not return any evaluator priorities.");
    }

    // Upsert into oracle_engagement_config — use admin to bypass any
    // restrictive RLS when the cfg row doesn't yet exist for this mission.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (oRes.data) {
      await supabaseAdmin
        .from("oracle_engagement_config")
        .update({ evaluator_priorities: priorities as any })
        .eq("mission_id", missionId);
    } else {
      await supabaseAdmin
        .from("oracle_engagement_config")
        .insert({ mission_id: missionId, evaluator_priorities: priorities as any } as any);
    }

    return priorities;
  });
