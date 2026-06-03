import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "@/lib/iris-prompts";

const MESSAGE_TYPES = ["decision", "guidance", "alert", "encouragement", "coach_note", "broadcast"] as const;

/* Send a Co-Pilot message to a specific writer (with question scope) or
   broadcast to all writers on the mission. */
export const sendCoPilotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid().nullable().optional(),
        toUserId: z.string().uuid().nullable().optional(),
        messageType: z.enum(MESSAGE_TYPES),
        body: z.string().min(1).max(600),
        isBroadcast: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles").select("display_name,email").eq("id", userId).maybeSingle();
    const fromName = prof?.display_name || prof?.email?.split("@")[0] || "Lead";

    const isBroadcast = !!data.isBroadcast || data.messageType === "broadcast";
    const { data: row, error } = await supabase
      .from("pilot_copilot_messages")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId ?? null,
        from_user_id: userId,
        from_name: fromName,
        to_user_id: isBroadcast ? null : data.toUserId ?? null,
        message_type: isBroadcast ? "broadcast" : data.messageType,
        body: data.body.trim(),
        is_broadcast: isBroadcast,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/* Mark a Co-Pilot message acknowledged. */
export const acknowledgeCoPilotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pilot_copilot_messages")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* Update writer confidence on a question (writer-self only via RLS). */
export const setWriterConfidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        questionId: z.string().uuid(),
        confidence: z.enum(["confident", "uncertain", "stuck"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("question_records")
      .update({
        writer_confidence: data.confidence,
        confidence_updated_at: new Date().toISOString(),
      })
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* IRIS Assist — draft a suggested guidance message for a writer/question. */
export const generateGuidanceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        questionId: z.string().uuid(),
        messageType: z.enum(MESSAGE_TYPES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [
      { data: q },
      { data: intel },
      { data: collabs },
    ] = await Promise.all([
      supabase
        .from("question_records")
        .select("question_number,title,question_text,health,pens_down_date,writer_confidence,assigned_writer_id,health_drivers,mission_id")
        .eq("id", data.questionId)
        .maybeSingle(),
      supabase
        .from("question_intelligence")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags")
        .eq("question_id", data.questionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("question_collaboration")
        .select("entry_type,body,author_name,created_at,resolved")
        .eq("question_id", data.questionId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    if (!q) throw new Error("Question not found");

    let writerName = "the writer";
    if (q.assigned_writer_id) {
      const { data: w } = await supabase
        .from("profiles").select("display_name,email").eq("id", q.assigned_writer_id).maybeSingle();
      writerName = (w?.display_name || w?.email?.split("@")[0] || "the writer").split(" ")[0];
    }

    const daysToPensDown = q.pens_down_date
      ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86_400_000)
      : null;

    const openRequests = (collabs ?? [])
      .filter((c) => !c.resolved && /needed|request/i.test(c.entry_type))
      .map((c) => `- ${c.entry_type}: ${c.body?.slice(0, 200)}`)
      .join("\n");
    const drivers = q.health_drivers && typeof q.health_drivers === "object"
      ? Object.values(q.health_drivers).filter((v) => typeof v === "string").join(" · ")
      : "";

    const typeGuide: Record<typeof data.messageType, string> = {
      decision: "Make a clear, specific decision. Single direction. No hedging.",
      guidance: "Give a concrete, actionable suggestion. Reference an evaluator behavior, a framework, or a prior win.",
      alert: "Flag a risk you see in their current direction. Be direct but supportive.",
      encouragement: "Short, personal acknowledgement. 1–2 sentences. Use their first name.",
      coach_note: "Share a piece of wisdom that helps them write better. Reference past experience.",
      broadcast: "Mission-wide message — speak to all pilots.",
    };

    const sys = `You are IRIS, drafting a co-pilot message that an engagement lead will send to ${writerName} on a specific proposal question. Output the message body only — no greeting, no signature, no preamble. 1–3 sentences, under 280 characters, direct and human. Sound like a senior strategist who has been there. Never generic. Use specifics from the context provided.

Message type: ${data.messageType} — ${typeGuide[data.messageType]}`;

    const user = `Writer: ${writerName}
Question: Q${q.question_number} — ${q.title}
Days to Pens Down: ${daysToPensDown ?? "?"}
Health: ${q.health ?? "unknown"}
Writer confidence: ${q.writer_confidence ?? "not set"}
Health drivers: ${drivers || "(none)"}

Open requests from writer:
${openRequests || "(none)"}

Writer's current IRIS brief (excerpt):
${(intel?.iris_brief ?? "").slice(0, 800)}

Compliance flags on this question:
${(intel?.compliance_flags ?? []).join(" · ") || "(none)"}

Draft the message body now.`;

    const draft = await callIris(sys, user);
    return { draft: (draft ?? "").trim().slice(0, 600) };
  });
