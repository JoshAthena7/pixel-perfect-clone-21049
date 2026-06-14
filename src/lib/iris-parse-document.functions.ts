// Fire-and-forget IRIS parse of a Vault document into intel_events.
// Triggered after upload; never blocks UI, never surfaces errors.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeIntelEvents } from "@/lib/intel-events-writer";

const Input = z.object({
  mission_id: z.string().uuid(),
  document_id: z.string().uuid(),
  extra_text: z.string().max(200_000).optional(),
});

type Parsed = {
  key_requirements?: unknown;
  evaluation_criteria?: unknown;
  submission_dates?: unknown;
  incumbent_signals?: unknown;
  scope_summary?: unknown;
  red_flags?: unknown;
};

const asStrings = (v: unknown, max = 25): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x : x?.text ?? ""))
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

export const parseDocumentToIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Fully fire-and-forget: never throw to caller.
    try {
      const supabase = (context as { supabase: any }).supabase;
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error("[iris-parse-document] LOVABLE_API_KEY missing");
        return { ok: false };
      }

      const { data: doc, error } = await supabase
        .from("mission_documents")
        .select("id, title, document_type, content_summary, source_url, file_url")
        .eq("id", data.document_id)
        .maybeSingle();
      if (error || !doc) {
        console.error("[iris-parse-document] doc fetch failed", error);
        return { ok: false };
      }

      const body = [
        data.extra_text ?? "",
        (doc as any).content_summary ?? "",
      ]
        .map((s) => String(s).trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 60_000);

      if (body.length < 50) {
        // Nothing meaningful to analyze yet; bail silently.
        return { ok: true, skipped: true };
      }

      const system =
        "You are IRIS, the intelligence co-pilot for Athena Strategy Group. " +
        "You analyze RFP and procurement documents for government healthcare proposals. " +
        "Return only valid JSON matching the requested schema.";
      const userMsg =
        "You are analyzing an RFP or procurement document for a government healthcare proposal. " +
        "Extract the following and return as structured JSON:\n" +
        "- key_requirements: string[] (top evaluation criteria and must-haves)\n" +
        "- evaluation_criteria: string[] (how proposals will be scored)\n" +
        "- submission_dates: { label: string, date: string }[]\n" +
        "- incumbent_signals: string[] (any hints about current vendor)\n" +
        "- scope_summary: string (2-3 sentence summary of what is being procured)\n" +
        "- red_flags: string[] (anything unusual, restrictive, or risky)\n\n" +
        `Document title: ${(doc as any).title ?? ""}\n` +
        `Document type: ${(doc as any).document_type ?? ""}\n\n` +
        `Document content:\n${body}`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          max_tokens: 2000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        console.error("[iris-parse-document] gateway error", res.status, await res.text().catch(() => ""));
        return { ok: false };
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = j.choices?.[0]?.message?.content ?? "";
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) {
        console.error("[iris-parse-document] no JSON in response");
        return { ok: false };
      }
      let parsed: Parsed;
      try {
        parsed = JSON.parse(m[0]);
      } catch (e) {
        console.error("[iris-parse-document] malformed JSON", e);
        return { ok: false };
      }

      const rows: Array<{
        mission_id: string;
        event_type: string;
        title: string;
        content: string;
        confidence: "high";
        significance: "high";
        generated_by: "iris";
        tags: string[];
      }> = [];
      const push = (title: string, content: string, tag: string) => {
        const t = title.trim();
        const c = content.trim();
        if (!t || !c) return;
        rows.push({
          mission_id: data.mission_id,
          event_type: "rfp_parse",
          title: t.slice(0, 280),
          content: c.slice(0, 4000),
          confidence: "high",
          significance: "high",
          generated_by: "iris",
          tags: ["rfp_parse", tag, `doc_${data.document_id.slice(0, 8)}`],
        });
      };

      for (const r of asStrings(parsed.key_requirements)) {
        push(`RFP Requirement: ${r.slice(0, 120)}`, r, "key_requirement");
      }
      for (const r of asStrings(parsed.evaluation_criteria)) {
        push(`Evaluation Criterion: ${r.slice(0, 120)}`, r, "evaluation_criteria");
      }
      if (Array.isArray(parsed.submission_dates)) {
        for (const d of parsed.submission_dates) {
          const label = String((d as any)?.label ?? "").trim();
          const date = String((d as any)?.date ?? "").trim();
          if (!label && !date) continue;
          push(
            `Submission Date: ${label || date}`,
            [label, date].filter(Boolean).join(" — "),
            "submission_date",
          );
        }
      }
      for (const r of asStrings(parsed.incumbent_signals)) {
        push(`Incumbent Signal: ${r.slice(0, 120)}`, r, "incumbent_signal");
      }
      const scope = typeof parsed.scope_summary === "string" ? parsed.scope_summary.trim() : "";
      if (scope) push("RFP Scope Summary", scope, "scope_summary");
      for (const r of asStrings(parsed.red_flags)) {
        push(`Red Flag: ${r.slice(0, 120)}`, r, "red_flag");
      }

      if (rows.length) writeIntelEvents(rows);
      return { ok: true, count: rows.length };
    } catch (e) {
      console.error("[iris-parse-document] unexpected failure", e);
      return { ok: false };
    }
  });
