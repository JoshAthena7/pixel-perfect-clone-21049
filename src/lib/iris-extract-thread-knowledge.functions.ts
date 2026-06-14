// Fire-and-forget: extract reusable knowledge from a resolved Q&A thread
// into public.oracle_knowledge_base. Never throws to caller.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  mission_id: z.string().uuid(),
  question_id: z.string().uuid(),
});

const asStrings = (v: unknown, max = 20): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x : x?.text ?? ""))
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

export const extractThreadKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    try {
      const supabase = (context as { supabase: any }).supabase;
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error("[iris-extract-knowledge] LOVABLE_API_KEY missing");
        return { ok: false };
      }

      // Skip if we already have an entry for this thread (idempotent).
      try {
        const { data: existing } = await supabase
          .from("oracle_knowledge_base")
          .select("id")
          .eq("thread_id", data.question_id)
          .limit(1);
        if (Array.isArray(existing) && existing.length > 0) {
          return { ok: true, skipped: true };
        }
      } catch (e) {
        console.error("[iris-extract-knowledge] dedupe check failed", e);
      }

      const { data: q } = await supabase
        .from("mission_questions")
        .select("question_number, question_text, section_id")
        .eq("id", data.question_id)
        .maybeSingle();

      const { data: messages } = await supabase
        .from("thread_messages")
        .select("sender_name, message_type, message_body, created_at")
        .eq("question_id", data.question_id)
        .order("created_at", { ascending: true });

      const msgs = (messages ?? []) as Array<{
        sender_name: string | null;
        message_type: string | null;
        message_body: string | null;
        created_at: string | null;
      }>;
      if (msgs.length === 0) return { ok: true, skipped: true };

      const transcript = msgs
        .map(
          (m) =>
            `${m.sender_name ?? "Member"}${m.message_type ? ` [${m.message_type}]` : ""}: ${m.message_body ?? ""}`,
        )
        .join("\n\n")
        .slice(0, 40_000);

      const questionLine = q
        ? `${(q as any).question_number ? `${(q as any).question_number} — ` : ""}${(q as any).question_text ?? ""}`
        : "";

      const system =
        "You are IRIS, the intelligence co-pilot for Athena Strategy Group. " +
        "You extract reusable knowledge from resolved Q&A threads in a government healthcare proposal system. " +
        "Return only valid JSON matching the requested schema.";

      const userMsg =
        "You are extracting reusable knowledge from a resolved Q&A thread in a government healthcare proposal system. " +
        "Extract the following and return as structured JSON:\n" +
        "- core_insight: string (the key answer or finding in 1-2 sentences)\n" +
        "- topic_tags: string[] (e.g. 'CSOC', 'workforce', 'compliance', 'pricing', 'staffing')\n" +
        "- applicable_mission_types: string[] (what types of procurements this knowledge applies to)\n" +
        "- confidence: 'high' | 'medium' | 'low' (how definitive the answer is)\n" +
        "- source_summary: string (who answered and their role/expertise)\n\n" +
        `Original question: ${questionLine || "(unspecified)"}\n\n` +
        `Thread transcript:\n${transcript}`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          response_format: { type: "json_object" },
          max_tokens: 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        console.error(
          "[iris-extract-knowledge] gateway error",
          res.status,
          await res.text().catch(() => ""),
        );
        return { ok: false };
      }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = j.choices?.[0]?.message?.content ?? "";
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) {
        console.error("[iris-extract-knowledge] no JSON in response");
        return { ok: false };
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(m[0]);
      } catch (e) {
        console.error("[iris-extract-knowledge] malformed JSON", e);
        return { ok: false };
      }

      const coreInsight = String(parsed.core_insight ?? "").trim();
      if (!coreInsight) return { ok: true, skipped: true };

      const rawConf = String(parsed.confidence ?? "").toLowerCase().trim();
      const confidence: "high" | "medium" | "low" | null =
        rawConf === "high" || rawConf === "medium" || rawConf === "low" ? rawConf : null;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: insErr } = await supabaseAdmin.from("oracle_knowledge_base").insert({
        mission_id: data.mission_id,
        thread_id: data.question_id,
        core_insight: coreInsight.slice(0, 4000),
        topic_tags: asStrings(parsed.topic_tags, 30),
        applicable_mission_types: asStrings(parsed.applicable_mission_types, 30),
        confidence,
        source_summary: String(parsed.source_summary ?? "").trim().slice(0, 2000) || null,
        extracted_by: "iris",
      });
      if (insErr) {
        console.error("[iris-extract-knowledge] insert failed", insErr);
        return { ok: false };
      }
      return { ok: true };
    } catch (e) {
      console.error("[iris-extract-knowledge] unexpected failure", e);
      return { ok: false };
    }
  });
