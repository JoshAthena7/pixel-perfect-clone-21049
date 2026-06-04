import { createServerFn } from "@tanstack/react-start";
import { withPersonFirst } from "./person-first";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadRfpText, findLatestRfp } from "@/lib/rfp-text.server";
import { assertNoPHI } from "@/lib/phi-detection";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  documentId: z.string().uuid(),
  amendmentType: z.enum([
    "formal_amendment",
    "qa_response",
    "scope_change",
    "deadline_extension",
    "clarification",
  ]),
});

const CHANGE_TYPES = [
  "requirement_added",
  "requirement_modified",
  "requirement_removed",
  "page_limit_changed",
  "deadline_changed",
  "evaluation_criteria_changed",
  "clarification",
  "scope_change",
  "qa_response",
] as const;

const SEVERITIES = ["critical", "significant", "administrative"] as const;

type Change = {
  change_type: typeof CHANGE_TYPES[number];
  severity: typeof SEVERITIES[number];
  description: string;
  affected_sections: string[];
  affected_section_questions: string[]; // question numbers like "Q4.3" or "4.3"
  writer_action_required: string;
};

type AmendmentAnalysis = {
  summary: string;
  changes: Change[];
};

const MAX_DOC_CHARS = 60_000;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n…[truncated]" : s;
}

async function callGeminiPro(
  originalText: string,
  amendmentText: string,
  amendmentType: string,
  missionName: string,
  programType: string | null,
  state: string | null,
): Promise<AmendmentAnalysis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const system = `You are IRIS — a senior proposal strategist for Athena Strategy Group.
You compare an original RFP against an amendment document and identify every meaningful change.

Return ONLY a JSON object: { "summary": string, "changes": Array<{
  "change_type": "requirement_added" | "requirement_modified" | "requirement_removed" | "page_limit_changed" | "deadline_changed" | "evaluation_criteria_changed" | "clarification" | "scope_change" | "qa_response",
  "severity": "critical" | "significant" | "administrative",
  "description": string (2-3 sentences, plain language, write as briefing a writer who is heads-down drafting),
  "affected_sections": string[] (RFP section numbers like "4.3", "5.1.2"),
  "affected_section_questions": string[] (question numbers like "Q4.3" or "4.3" that the change touches),
  "writer_action_required": string (specific concrete action)
}> }

Severity rules:
- "critical": changes what must be written or how it will be scored
- "significant": changes context/requirements writers need to know
- "administrative": deadline, format, or process only

Return [] for changes if the amendment introduces nothing of substance.`;

  const user = `Mission: ${missionName}
Program type: ${programType ?? "Unknown"}
State: ${state ?? "Unknown"}
Amendment type: ${amendmentType}

=== ORIGINAL RFP ===
${truncate(originalText, MAX_DOC_CHARS)}

=== AMENDMENT DOCUMENT ===
${truncate(amendmentText, MAX_DOC_CHARS)}

Identify every change the amendment introduces vs the original RFP. Be exhaustive but precise.`;

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: withPersonFirst(system) },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });

  if (res.status === 402) {
    throw new Error("Lovable AI credits exhausted — add credits in Settings → Workspace → Usage.");
  }
  if (res.status === 429) {
    throw new Error("Rate limit hit — try again in a minute.");
  }
  if (!res.ok) {
    throw new Error(`Lovable AI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart < 0 || objEnd <= objStart) {
    return { summary: "IRIS returned no parsable output.", changes: [] };
  }
  const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
  const changes: Change[] = Array.isArray(parsed.changes)
    ? parsed.changes
        .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c: Record<string, unknown>) => ({
          change_type: (CHANGE_TYPES as readonly string[]).includes(String(c.change_type))
            ? (c.change_type as Change["change_type"])
            : "clarification",
          severity: (SEVERITIES as readonly string[]).includes(String(c.severity))
            ? (c.severity as Change["severity"])
            : "significant",
          description: String(c.description ?? "").slice(0, 2000),
          affected_sections: Array.isArray(c.affected_sections)
            ? c.affected_sections.map(String).slice(0, 20)
            : [],
          affected_section_questions: Array.isArray(c.affected_section_questions)
            ? c.affected_section_questions.map(String).slice(0, 30)
            : [],
          writer_action_required: String(c.writer_action_required ?? "").slice(0, 1000),
        }))
    : [];
  return {
    summary: String(parsed.summary ?? "").slice(0, 2000),
    changes,
  };
}

export const analyzeAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Load amendment doc + mission
    const { data: amendDoc, error: amendErr } = await supabase
      .from("mission_library")
      .select("id, mission_id, name")
      .eq("id", data.documentId)
      .maybeSingle();
    if (amendErr || !amendDoc) throw new Error("Amendment document not found");

    const { data: mission } = await supabase
      .from("missions")
      .select("id, name, program_type, state")
      .eq("id", amendDoc.mission_id)
      .maybeSingle();
    if (!mission) throw new Error("Mission not found");

    // 2. Find base RFP (most recent RFP doc that isn't the amendment itself)
    const { data: rfpDocs } = await supabase
      .from("mission_library")
      .select("id, created_at, is_rfp, category, name")
      .eq("mission_id", amendDoc.mission_id)
      .order("created_at", { ascending: true });
    const baseRfp = (rfpDocs ?? []).find(
      (d) => d.id !== amendDoc.id && (d.is_rfp || d.category === "RFP" || d.category === "RFP & Amendments"),
    );
    if (!baseRfp) throw new Error("No base RFP found. Upload the original RFP before analyzing an amendment.");

    // 3. Create amendment row (analyzing)
    const { data: amendRow, error: insErr } = await supabase
      .from("rfp_amendments")
      .insert({
        mission_id: amendDoc.mission_id,
        document_id: amendDoc.id,
        base_rfp_document_id: baseRfp.id,
        amendment_type: data.amendmentType,
        status: "analyzing",
        analyzed_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !amendRow) throw new Error(`Could not create amendment record: ${insErr?.message}`);

    try {
      // 4. Extract both documents' text
      const [original, amendment] = await Promise.all([
        loadRfpText(supabase, baseRfp.id),
        loadRfpText(supabase, amendDoc.id),
      ]);

      // C2: PHI scrub on parsed text BEFORE further processing or storage.
      await assertNoPHI({
        text: original.text,
        surface: "rfp_parser",
        actorUserId: userId,
        engagementId: amendDoc.mission_id,
      });
      await assertNoPHI({
        text: amendment.text,
        surface: "rfp_parser",
        actorUserId: userId,
        engagementId: amendDoc.mission_id,
      });



      // 5. Call Gemini 2.5 Pro
      const analysis = await callGeminiPro(
        original.text,
        amendment.text,
        data.amendmentType,
        mission.name,
        mission.program_type,
        mission.state,
      );

      // 6. Match affected_section_questions to actual question_records
      const { data: questions } = await supabase
        .from("question_records")
        .select("id, question_number, section_number, title")
        .eq("mission_id", amendDoc.mission_id);
      const qList = questions ?? [];

      const matchQuestionIds = (refs: string[], sections: string[]): string[] => {
        const ids = new Set<string>();
        const normalize = (s: string) => s.replace(/^Q\.?\s*/i, "").trim().toLowerCase();
        const refSet = new Set(refs.map(normalize));
        const secSet = new Set(sections.map((s) => s.trim().toLowerCase()));
        for (const q of qList) {
          const qn = normalize(q.question_number ?? "");
          const sn = (q.section_number ?? "").trim().toLowerCase();
          if (refSet.has(qn) || (sn && secSet.has(sn))) ids.add(q.id);
        }
        return [...ids];
      };

      // 7. Insert change rows
      let critical = 0;
      const changeRows = analysis.changes.map((c) => {
        if (c.severity === "critical") critical += 1;
        return {
          amendment_id: amendRow.id,
          mission_id: amendDoc.mission_id,
          change_type: c.change_type,
          severity: c.severity,
          description: c.description,
          affected_sections: c.affected_sections,
          affected_question_ids: matchQuestionIds(c.affected_section_questions, c.affected_sections),
          writer_action_required: c.writer_action_required,
        };
      });

      if (changeRows.length > 0) {
        const { error: chErr } = await supabase.from("amendment_changes").insert(changeRows);
        if (chErr) throw new Error(`Insert changes failed: ${chErr.message}`);
      }

      // 8. Emit signals for critical changes
      const criticalRows = changeRows.filter((r) => r.severity === "critical");
      for (const cr of criticalRows) {
        const targets = cr.affected_question_ids.length > 0 ? cr.affected_question_ids : [null];
        for (const qid of targets) {
          await supabase.from("signals").insert({
            mission_id: amendDoc.mission_id,
            user_id: userId,
            source_module: "rfp_amendment",
            signal_type: "amendment_change_critical",
            signal_title: `Amendment: ${cr.change_type.replace(/_/g, " ")}`,
            signal_summary: cr.description.slice(0, 500),
            severity: "critical",
            related_question_id: qid,
            related_document_id: amendDoc.id,
            recommended_action: cr.writer_action_required,
            created_by_system: true,
          });
        }
      }

      // 9. Mark amendment analyzed
      await supabase
        .from("rfp_amendments")
        .update({
          status: "analyzed",
          summary: analysis.summary,
          total_changes: changeRows.length,
          critical_changes: critical,
          analyzed_at: new Date().toISOString(),
        })
        .eq("id", amendRow.id);

      await supabase.from("olympus_audit_log").insert({
        mission_id: amendDoc.mission_id,
        user_id: userId,
        action_type: "rfp_amendment_analyzed",
        action_summary: `IRIS analyzed amendment "${amendDoc.name}" → ${changeRows.length} changes (${critical} critical)`,
        target_table: "rfp_amendments",
        target_id: amendRow.id,
      });

      return {
        amendmentId: amendRow.id,
        totalChanges: changeRows.length,
        criticalChanges: critical,
        summary: analysis.summary,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("rfp_amendments")
        .update({ status: "failed", error_message: msg.slice(0, 1000) })
        .eq("id", amendRow.id);
      throw err;
    }
  });
