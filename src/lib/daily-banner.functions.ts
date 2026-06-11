/**
 * Daily Intelligence Banner — fetches today's key_intelligence_summary
 * for the current user. If a daily_intelligence_briefs row exists for
 * today (recipient_id + brief_date), returns its summary. Otherwise
 * generates a one-sentence summary inline via Lovable AI Gateway using
 * lightweight mission context. Does not persist generated text.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type BannerResult = {
  summary: string | null;
  fallback: boolean;
  hasAssignments: boolean;
  firstName: string | null;
};

const MAX_LEN = 140;

function truncate(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > MAX_LEN ? clean.slice(0, MAX_LEN - 1) + "…" : clean;
}

export const getDailyBannerSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BannerResult> => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    // Pull profile (first name) and existing brief in parallel.
    const [{ data: profile }, { data: brief }] = await Promise.all([
      supabase.from("profiles").select("first_name, full_name").eq("id", userId).maybeSingle(),
      supabase
        .from("daily_intelligence_briefs")
        .select("key_intelligence_summary")
        .eq("recipient_id", userId)
        .eq("brief_date", today)
        .maybeSingle(),
    ]);

    const firstName =
      (profile as { first_name?: string | null; full_name?: string | null } | null)?.first_name ??
      ((profile as { full_name?: string | null } | null)?.full_name?.split(" ")[0] ?? null);

    if (brief?.key_intelligence_summary) {
      return { summary: truncate(brief.key_intelligence_summary), fallback: false, hasAssignments: true, firstName };
    }

    // Resolve atlas team member id → assignments → mission with soonest deadline.
    const { data: memberRow } = await supabase.rpc("current_atlas_member_id");
    const memberId = memberRow as string | null;
    if (!memberId) {
      return { summary: null, fallback: true, hasAssignments: false, firstName };
    }

    const { data: asgs } = await supabase
      .from("mission_assignments")
      .select("mission_id, question_id")
      .eq("assigned_writer_id", memberId);
    const assignments = (asgs ?? []) as Array<{ mission_id: string; question_id: string }>;
    if (!assignments.length) {
      return { summary: null, fallback: true, hasAssignments: false, firstName };
    }

    const missionIds = Array.from(new Set(assignments.map((a) => a.mission_id)));
    const { data: missions } = await supabase
      .from("missions")
      .select("id, name, submission_deadline")
      .in("id", missionIds);
    const ms = (missions ?? []) as Array<{ id: string; name: string; submission_deadline: string | null }>;
    const soonest = ms
      .filter((m) => m.submission_deadline)
      .sort((a, b) => new Date(a.submission_deadline!).getTime() - new Date(b.submission_deadline!).getTime())[0] ?? ms[0];
    const daysToSubmission = soonest?.submission_deadline
      ? Math.max(0, Math.ceil((new Date(soonest.submission_deadline).getTime() - Date.now()) / 86_400_000))
      : null;

    // Count at-risk questions across this user's assignments.
    const questionIds = assignments.map((a) => a.question_id);
    let atRisk = 0;
    if (questionIds.length) {
      const { data: qs } = await supabase
        .from("mission_questions")
        .select("id, health_status")
        .in("id", questionIds);
      atRisk = ((qs ?? []) as Array<{ health_status: string }>).filter((q) => q.health_status === "at_risk").length;
    }

    // New feed items in last 24h across these missions.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    let newIntel = 0;
    if (missionIds.length) {
      const { count } = await supabase
        .from("intelligence_feed_items")
        .select("id", { count: "exact", head: true })
        .in("mission_id", missionIds)
        .gte("created_at", since);
      newIntel = count ?? 0;
    }

    // Generate one sentence via Lovable AI Gateway with a 3s budget.
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { summary: null, fallback: true, hasAssignments: true, firstName };
    }

    const prompt = `You are IRIS. Generate one sentence (maximum 120 characters) summarizing the most important thing this user should know today for their mission work. User: ${firstName ?? "writer"}, Mission: ${soonest?.name ?? "current mission"}, At-risk questions: ${atRisk}, New intel items: ${newIntel}, Days to submission: ${daysToSubmission ?? "unknown"}. Be specific. Be direct. Return only the sentence, no preamble.`;

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) return { summary: null, fallback: true, hasAssignments: true, firstName };
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) return { summary: null, fallback: true, hasAssignments: true, firstName };
      return { summary: truncate(text), fallback: false, hasAssignments: true, firstName };
    } catch {
      return { summary: null, fallback: true, hasAssignments: true, firstName };
    }
  });
