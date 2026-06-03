import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CONTENT_TYPES = [
  "mission_brief",
  "question_brief",
  "oracle_section",
  "ask_iris",
  "morning_brief",
  "onboarding",
  "other",
] as const;

const CRITICALITY = ["critical", "minor", "small"] as const;
const SCOPE = ["response", "mission", "global"] as const;

function critToImportance(c: (typeof CRITICALITY)[number]) {
  if (c === "critical") return "critical" as const;
  if (c === "minor") return "preferred" as const;
  return "reference" as const;
}

function scopeToMemoryScope(s: (typeof SCOPE)[number]) {
  return s === "global" ? ("global" as const) : ("mission" as const);
}

/* Submit a correction. Creates an iris_corrections row and an
   accompanying iris_memories entry IRIS uses going forward. */
export const submitIrisCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid().nullable().optional(),
        contentType: z.enum(CONTENT_TYPES),
        contentBlock: z.string().min(1).max(8000),
        incorrectText: z.string().min(1).max(4000),
        correctText: z.string().min(1).max(4000),
        criticality: z.enum(CRITICALITY),
        scope: z.enum(SCOPE),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Look up mission + user name for memory copy
    const [{ data: mission }, { data: profile }] = await Promise.all([
      supabase.from("missions").select("name").eq("id", data.missionId).maybeSingle(),
      supabase.from("profiles").select("display_name,email").eq("id", userId).maybeSingle(),
    ]);
    const missionName = mission?.name ?? "this mission";
    const userName =
      profile?.display_name || profile?.email?.split("@")[0] || "A team member";

    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const importance = critToImportance(data.criticality);
    const memoryScope = scopeToMemoryScope(data.scope);

    // 1) Create iris_memories entry (skip for response-only scope — that
    //    correction stays local to the flagged block, no future learning).
    let memoryId: string | null = null;
    if (data.scope !== "response") {
      const title = `IRIS Correction — ${data.correctText.slice(0, 60)}`;
      const content = [
        `IRIS incorrectly stated: ${data.incorrectText}`,
        ``,
        `The correct information is: ${data.correctText}`,
        ``,
        `Flagged by ${userName} on ${today} on ${missionName}.`,
      ].join("\n");
      const summary = `${data.correctText.slice(0, 240)}`;

      const tags = Array.from(
        new Set(
          (data.correctText + " " + data.incorrectText)
            .toLowerCase()
            .match(/\b[a-z][a-z0-9-]{3,}\b/g)
            ?.slice(0, 6) ?? [],
        ),
      );

      const { data: mem, error: memErr } = await supabase
        .from("iris_memories")
        .insert({
          title,
          content,
          summary,
          category: "IRIS Corrections",
          tags,
          importance,
          scope: memoryScope,
          mission_id: memoryScope === "mission" ? data.missionId : null,
          source: `Manual correction by ${userName}`,
          iris_reasoning:
            "Auto-created from an inline correction flag. Importance and scope reflect the user's selection at flag time.",
          created_by: userId,
        })
        .select("id")
        .single();
      if (memErr) throw new Error(memErr.message);
      memoryId = mem.id;
    }

    // 2) Insert correction row
    const { data: row, error } = await supabase
      .from("iris_corrections")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId ?? null,
        iris_content_type: data.contentType,
        iris_content_block: data.contentBlock.slice(0, 8000),
        incorrect_text: data.incorrectText,
        correct_text: data.correctText,
        criticality: data.criticality,
        scope: data.scope,
        flagged_by: userId,
        memory_id: memoryId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // 3) Audit log entry (best-effort, never blocks)
    try {
      await supabase.from("olympus_audit_log").insert({
        user_id: userId,
        user_name: userName,
        mission_id: data.missionId,
        action_type: "iris_correction_submitted",
        action_summary: `Flagged IRIS error: "${data.incorrectText.slice(0, 80)}" → "${data.correctText.slice(0, 80)}"`,
        target_table: "iris_corrections",
        target_id: row.id,
        metadata: {
          criticality: data.criticality,
          scope: data.scope,
          content_type: data.contentType,
          memory_id: memoryId,
        },
      });
    } catch {
      /* ignore */
    }

    return { id: row.id, memoryId };
  });

/* List corrections for Olympus tab */
export const listIrisCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("iris_corrections")
      .select(
        "id,mission_id,question_id,iris_content_type,incorrect_text,correct_text,criticality,scope,flagged_by,flagged_at,memory_id,resolved",
      )
      .order("flagged_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
