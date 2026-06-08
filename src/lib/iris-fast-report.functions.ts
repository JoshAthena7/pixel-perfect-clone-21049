import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReportType = z.enum([
  "mission_pulse",
  "writer_sitrep",
  "iris_coverage_gap",
  "deadline_radar",
  "win_theme_alignment",
]);

const Input = z.object({ report_type: ReportType });

const TITLES: Record<z.infer<typeof ReportType>, string> = {
  mission_pulse: "Mission Pulse",
  writer_sitrep: "Writer Situation Report",
  iris_coverage_gap: "IRIS Coverage Gap",
  deadline_radar: "Deadline Radar",
  win_theme_alignment: "Win Theme Alignment",
};

const PROMPTS: Record<z.infer<typeof ReportType>, string> = {
  mission_pulse: `You are IRIS™, the intelligence engine for Athena Strategy Command.
You are generating a Mission Pulse report for the platform administrator.
Below is live data on all active missions. Write a concise executive briefing — one paragraph per mission — covering: current status, days until submission, health signal, whether IRIS intelligence has been generated, and any open warning or critical signals.
Flag any mission that is within 30 days of submission and does not have IRIS intelligence generated as HIGH RISK.
End with a one-sentence overall platform health assessment.
Write in plain English. Be direct. No headers per mission — flowing narrative separated by paragraph breaks.`,

  writer_sitrep: `You are IRIS™, generating a Writer Situation Report for the platform administrator.
Below is live data on every assigned question/section across all active missions — writer name, section health, and deadline.
Write a briefing that:
1. Opens with a one-sentence overall writer activity summary
2. Flags any writer who has sections with poor health or imminent deadlines
3. Identifies any sections with no assigned writer
4. Calls out writers who appear overloaded (many sections, tight deadlines)
5. Ends with 2-3 recommended actions for the administrator
Be specific — name writers and sections. Write in plain English. No bullet lists — narrative paragraphs only.`,

  iris_coverage_gap: `You are IRIS™, generating an Intelligence Coverage Gap report.
Below is data showing which missions have IRIS-generated intelligence layers, Pre-Flight section briefs, and extracted requirements — and which do not.
Write a gap analysis that:
1. States how many missions are fully covered, partially covered, and have no IRIS coverage
2. For each mission, describe exactly what IRIS intelligence exists and what is missing
3. Ranks the gaps by risk — missions closest to submission with the least coverage are highest risk
4. Ends with a prioritized list of the top 3 IRIS actions the administrator should trigger next
Be specific and direct. This report is a call to action.`,

  deadline_radar: `You are IRIS™, generating a Deadline Radar for the next 60 days.
Below is data on all upcoming deadlines — review gates, pens-down dates, and submission dates — across all active missions.
Write a chronological briefing that walks through the next 60 days: what is due, for which mission, and what it means.
Flag anything in the next 14 days as URGENT.
Flag anything in days 15-30 as APPROACHING.
End with a sentence on whether the overall pipeline looks manageable or whether there are dangerous deadline clusters.
Write as a narrative. Be specific with dates.`,

  win_theme_alignment: `You are IRIS™, generating a Win Theme Alignment Check.
Below is data showing the declared win themes for each mission, and the writer answers and refined briefs from Pre-Flight sections.
Assess: are the win themes actually showing up in the section briefs and writer answers? Or has the writing drifted from the strategy?
For each mission that has both win themes and section brief data:
1. State the declared win themes
2. Assess how well they appear in the writing (Strong / Partial / Missing)
3. Call out specific sections where alignment is weakest
4. Give one concrete recommendation to strengthen alignment
If a mission has win themes but no Pre-Flight data yet, note that alignment cannot be assessed until Pre-Flight is complete.
Write in plain English. Be direct and specific.`,
};

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function gatherContext(
  reportType: z.infer<typeof ReportType>,
): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ctx: Record<string, unknown> = { generated_at: new Date().toISOString() };

  if (reportType === "mission_pulse") {
    const missions = await safe(
      supabaseAdmin
        .from("missions")
        .select("id, name, client, status, health, submission_date, question_count, created_at")
        .order("submission_date", { ascending: true })
        .then((r) => r.data ?? []),
    );
    const signals = await safe(
      supabaseAdmin
        .from("signals")
        .select("mission_id, severity, status")
        .eq("status", "open")
        .in("severity", ["warning", "critical"])
        .then((r) => r.data ?? []),
    );
    const intel = await safe(
      supabaseAdmin
        .from("mission_intelligence")
        .select("mission_id, layer, created_at")
        .order("created_at", { ascending: false })
        .then((r) => r.data ?? []),
    );
    const signalCounts: Record<string, number> = {};
    for (const s of signals ?? []) {
      const id = (s as any).mission_id as string;
      signalCounts[id] = (signalCounts[id] ?? 0) + 1;
    }
    ctx.missions = missions ?? [];
    ctx.open_warning_or_critical_signals_by_mission = signalCounts;
    ctx.mission_intelligence = intel ?? [];
  }

  if (reportType === "writer_sitrep") {
    const qrs = await safe(
      supabaseAdmin
        .from("question_records")
        .select("id, question_number, health, pens_down_date, assigned_writer_id, mission_id")
        .order("pens_down_date", { ascending: true })
        .then((r) => r.data ?? []),
    );
    const writerIds = Array.from(
      new Set(((qrs ?? []) as any[]).map((q) => q.assigned_writer_id).filter(Boolean)),
    );
    const missionIds = Array.from(
      new Set(((qrs ?? []) as any[]).map((q) => q.mission_id).filter(Boolean)),
    );
    const profiles = writerIds.length
      ? await safe(
          supabaseAdmin
            .from("profiles")
            .select("id, display_name")
            .in("id", writerIds)
            .then((r) => r.data ?? []),
        )
      : [];
    const missions = missionIds.length
      ? await safe(
          supabaseAdmin
            .from("missions")
            .select("id, name")
            .in("id", missionIds)
            .then((r) => r.data ?? []),
        )
      : [];
    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.display_name]));
    const missionMap = new Map(((missions ?? []) as any[]).map((m) => [m.id, m.name]));
    ctx.assigned_sections = ((qrs ?? []) as any[]).map((q) => ({
      question_id: q.id,
      question_number: q.question_number,
      health: q.health,
      pens_down_date: q.pens_down_date,
      writer_name: q.assigned_writer_id ? profileMap.get(q.assigned_writer_id) ?? "(unknown)" : null,
      mission_name: missionMap.get(q.mission_id) ?? null,
    }));
  }

  if (reportType === "iris_coverage_gap") {
    const missions = await safe(
      supabaseAdmin
        .from("missions")
        .select("id, name, client, status, submission_date")
        .then((r) => r.data ?? []),
    );
    const intel = await safe(
      supabaseAdmin
        .from("mission_intelligence")
        .select("mission_id, layer, created_at")
        .then((r) => r.data ?? []),
    );
    const briefs = await safe(
      supabaseAdmin.from("section_briefs").select("mission_id").then((r) => r.data ?? []),
    );
    const reqs = await safe(
      supabaseAdmin
        .from("compliance_requirements")
        .select("mission_id")
        .then((r) => r.data ?? []),
    );
    ctx.missions = missions ?? [];
    ctx.mission_intelligence = intel ?? [];
    ctx.missions_with_section_briefs = Array.from(
      new Set(((briefs ?? []) as any[]).map((b) => b.mission_id)),
    );
    ctx.missions_with_extracted_requirements = Array.from(
      new Set(((reqs ?? []) as any[]).map((r) => r.mission_id)),
    );
  }

  if (reportType === "deadline_radar") {
    const missions = await safe(
      supabaseAdmin
        .from("missions")
        .select("id, name, client, submission_date, status")
        .then((r) => r.data ?? []),
    );
    const gates = await safe(
      supabaseAdmin
        .from("mission_review_gates")
        .select("mission_id, gate_type, gate_date, status")
        .gte("gate_date", new Date().toISOString())
        .order("gate_date", { ascending: true })
        .then((r) => r.data ?? []),
    );
    const qrs = await safe(
      supabaseAdmin
        .from("question_records")
        .select("mission_id, pens_down_date")
        .gte("pens_down_date", new Date().toISOString().slice(0, 10))
        .then((r) => r.data ?? []),
    );
    const earliestByMission: Record<string, string> = {};
    for (const q of (qrs ?? []) as any[]) {
      const cur = earliestByMission[q.mission_id];
      if (!cur || (q.pens_down_date && q.pens_down_date < cur)) {
        earliestByMission[q.mission_id] = q.pens_down_date;
      }
    }
    ctx.missions = missions ?? [];
    ctx.review_gates = gates ?? [];
    ctx.earliest_pens_down_by_mission = earliestByMission;
    ctx.today = new Date().toISOString().slice(0, 10);
  }

  if (reportType === "win_theme_alignment") {
    const themes = await safe(
      supabaseAdmin
        .from("win_themes")
        .select("id, title, description, key_message, mission_id, question_ids")
        .then((r) => r.data ?? []),
    );
    const missionIds = Array.from(
      new Set(((themes ?? []) as any[]).map((t) => t.mission_id).filter(Boolean)),
    );
    const missions = missionIds.length
      ? await safe(
          supabaseAdmin
            .from("missions")
            .select("id, name")
            .in("id", missionIds)
            .then((r) => r.data ?? []),
        )
      : [];
    const missionMap = new Map(((missions ?? []) as any[]).map((m) => [m.id, m.name]));
    const briefs = await safe(
      supabaseAdmin
        .from("section_briefs")
        .select("mission_id, section_name, writer_answers, refined_brief")
        .then((r) => r.data ?? []),
    );
    ctx.win_themes = ((themes ?? []) as any[]).map((t) => ({
      ...t,
      mission_name: missionMap.get(t.mission_id) ?? null,
    }));
    ctx.section_briefs = briefs ?? [];
  }

  return ctx;
}

function truncate(value: string, max = 60_000): string {
  return value.length <= max ? value : value.slice(0, max) + "\n…[truncated]";
}

export const generateFastReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Admin-only
    const { supabase, userId } = context as any;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin only");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const title = TITLES[data.report_type];
    const system = PROMPTS[data.report_type];
    const ctx = await gatherContext(data.report_type);

    const userMessage = `Live data for ${title} (JSON):\n\n${truncate(
      JSON.stringify(ctx, null, 2),
    )}\n\nIf any field is empty or missing, explicitly note that data was unavailable for that dimension rather than fabricating content.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
    if (!res.ok) throw new Error(`IRIS gateway error (${res.status})`);
    const json = (await res.json()) as any;
    const content: string = json?.choices?.[0]?.message?.content ?? "";

    return {
      report_type: data.report_type,
      title,
      content,
      generated_at: new Date().toISOString(),
    };
  });
