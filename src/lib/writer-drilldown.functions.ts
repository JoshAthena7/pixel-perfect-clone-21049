import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  writerId: z.string().uuid(),
});

export type WriterQuestionRow = {
  questionId: string;
  questionNumber: string | null;
  questionTitle: string;
  status: string | null;
  acceptanceStatus: string | null;
  writerConfidence: string | null;
  healthStatus: string | null;
  internalDueDate: string | null;
  lastActivityAt: string | null;
  lastCheckIn: { at: string; status: string | null; note: string | null } | null;
};

export type WriterDrillDown = {
  writer: { id: string; name: string; email: string | null; role: string | null };
  questions: WriterQuestionRow[];
  totals: { total: number; finalized: number; active: number; atRisk: number };
};

export const getWriterDrillDown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<WriterDrillDown> => {
    const { supabase } = context;

    const [profileRes, progressRes] = await Promise.all([
      supabase.from("profiles").select("id,display_name,email").eq("id", data.writerId).maybeSingle(),
      supabase
        .from("question_progress")
        .select("question_id,role,status,acceptance_status,writer_confidence,internal_due_date,last_activity_at")
        .eq("mission_id", data.missionId)
        .eq("assignee_id", data.writerId),
    ]);

    const progressRows = (progressRes.data ?? []) as any[];
    const qIds = progressRows.map((r) => r.question_id);

    const [questionsRes, checkInsRes] = await Promise.all([
      qIds.length
        ? supabase
            .from("mission_questions")
            .select("id,question_number,question_text,health_status")
            .in("id", qIds)
        : Promise.resolve({ data: [] as any[] }),
      qIds.length
        ? supabase
            .from("mission_assist_events")
            .select("id,question_id,created_at,metadata")
            .eq("mission_id", data.missionId)
            .eq("user_id", data.writerId)
            .eq("event_type", "check_in")
            .in("question_id", qIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const qMap = new Map<string, any>((questionsRes.data ?? []).map((q: any) => [q.id, q]));
    const lastCheckInByQ = new Map<string, any>();
    ((checkInsRes.data ?? []) as any[]).forEach((r) => {
      if (!lastCheckInByQ.has(r.question_id)) lastCheckInByQ.set(r.question_id, r);
    });

    const questions: WriterQuestionRow[] = progressRows.map((p) => {
      const q = qMap.get(p.question_id) ?? {};
      const checkIn = lastCheckInByQ.get(p.question_id);
      const meta = (checkIn?.metadata ?? {}) as any;
      return {
        questionId: p.question_id,
        questionNumber: q.question_number ?? null,
        questionTitle: (q.question_text ?? "").toString().slice(0, 240),
        status: p.status ?? null,
        acceptanceStatus: p.acceptance_status ?? null,
        writerConfidence: p.writer_confidence ?? null,
        healthStatus: q.health_status ?? null,
        internalDueDate: p.internal_due_date ?? null,
        lastActivityAt: p.last_activity_at ?? null,
        lastCheckIn: checkIn
          ? { at: checkIn.created_at, status: meta.status ?? null, note: (meta.note ?? "").toString().slice(0, 160) || null }
          : null,
      };
    });

    // Sort: at-risk first, then by status (not_started > active > finalized last), then by due date.
    questions.sort((a, b) => {
      const aRisk = a.healthStatus === "at_risk" ? 0 : 1;
      const bRisk = b.healthStatus === "at_risk" ? 0 : 1;
      if (aRisk !== bRisk) return aRisk - bRisk;
      const order = (s: string | null) =>
        s === "finalized" ? 4 : s === "in_review" ? 3 : s === "active" ? 2 : s === "not_started" ? 1 : 0;
      const od = order(a.status) - order(b.status);
      if (od !== 0) return od;
      return (a.questionNumber ?? "").localeCompare(b.questionNumber ?? "", undefined, { numeric: true });
    });

    const totals = {
      total: questions.length,
      finalized: questions.filter((q) => q.status === "finalized").length,
      active: questions.filter((q) => q.status === "active" || q.status === "in_review").length,
      atRisk: questions.filter((q) => q.healthStatus === "at_risk").length,
    };

    const profile = profileRes.data as any;
    return {
      writer: {
        id: data.writerId,
        name: profile?.display_name ?? profile?.email ?? "Writer",
        email: profile?.email ?? null,
        role: null,
      },
      questions,
      totals,
    };
  });

const IrisInput = z.object({
  missionId: z.string().uuid(),
  writerName: z.string(),
  total: z.number(),
  finalized: z.number(),
  active: z.number(),
  atRisk: z.number(),
  lastActivityRel: z.string(),
  daysToDeadline: z.number().nullable(),
});

export const getWriterIrisSentence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IrisInput.parse(d))
  .handler(async ({ data }): Promise<{ sentence: string | null; error?: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { sentence: null, error: "AI gateway not configured" };

    const deadlineLine = data.daysToDeadline != null
      ? `Mission deadline ${data.daysToDeadline} days away.`
      : "Mission deadline not set.";
    const userPrompt = `${data.writerName} owns ${data.total} questions. ${data.finalized} finalized, ${data.active} active, ${data.atRisk} at risk. Last activity ${data.lastActivityRel}. ${deadlineLine}`;

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
              content:
                "You are IRIS. One sentence only. Assess this writer's mission status based on their question data. Be direct and specific. No filler. No 'I noticed', no 'It appears'. Plain sentence, under 200 characters.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) return { sentence: null, error: `AI gateway ${res.status}` };
      const j = await res.json();
      const txt: string = (j.choices?.[0]?.message?.content ?? "").trim();
      return { sentence: txt.slice(0, 240) || null };
    } catch (e: any) {
      return { sentence: null, error: e?.message ?? "fetch failed" };
    }
  });
