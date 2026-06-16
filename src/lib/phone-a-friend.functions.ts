/**
 * Phone a Friend — IRIS expertise matching wired to Oracle.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordSmeSession } from "./oracle-sme-session.server";
import { z } from "zod";

const SearchInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  query: z.string().min(1).max(500),
});

export type ExpertMatch = {
  user_id: string;
  name: string;
  initials: string;
  why_iris_recommends: string;
  top_expertise_match: string;
  consultation_suggestion: string;
};

const initialsOf = (first?: string | null, last?: string | null, email?: string | null) => {
  const a = (first || "").trim()[0];
  const b = (last || "").trim()[0];
  if (a || b) return `${a ?? ""}${b ?? ""}`.toUpperCase();
  return ((email || "?").trim()[0] ?? "?").toUpperCase();
};

export const findExperts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SearchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Question + section context
    let questionTitle = "";
    let questionNumber = "";
    let sectionName = "";
    if (data.questionId) {
      const { data: q } = await supabase
        .from("mission_questions")
        .select("question_number, question_text, section_id")
        .eq("id", data.questionId)
        .maybeSingle();
      if (q) {
        questionTitle = (q as any).question_text ?? "";
        questionNumber = (q as any).question_number ?? "";
        if ((q as any).section_id) {
          const { data: sec } = await supabase
            .from("mission_sections")
            .select("name")
            .eq("id", (q as any).section_id)
            .maybeSingle();
          sectionName = (sec as any)?.name ?? "";
        }
      }
    }

    // Team expertise pool
    const { data: teamRows } = await supabase
      .from("mission_team_members")
      .select(
        "mission_role, atlas_team_members!inner(id, first_name, last_name, email, job_title, skills, avatar_url)",
      )
      .eq("mission_id", data.missionId);

    const people = (teamRows ?? []).map((r: any) => {
      const m = r.atlas_team_members ?? {};
      const name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email || "Member";
      return {
        user_id: m.id as string,
        name,
        initials: initialsOf(m.first_name, m.last_name, m.email),
        title: (m.job_title as string | null) ?? null,
        skills: (Array.isArray(m.skills) ? m.skills : []) as string[],
        mission_role: r.mission_role as string | null,
        avatar_url: m.avatar_url as string | null,
      };
    });

    let matches: ExpertMatch[] = [];
    let irisMessage = "";

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || people.length === 0) {
      // Graceful degradation — return alphabetical with their skills
      matches = people.slice(0, 5).map((p) => ({
        user_id: p.user_id,
        name: p.name,
        initials: p.initials,
        why_iris_recommends: p.title
          ? `${p.title}${p.skills.length ? ` — works on ${p.skills.slice(0, 3).join(", ")}` : ""}`
          : p.skills.slice(0, 3).join(", ") || "Mission team member.",
        top_expertise_match: p.skills[0] ?? p.mission_role ?? "Mission team",
        consultation_suggestion: "Ask about their direct experience on this topic.",
      }));
      irisMessage = apiKey
        ? "No expertise data on this mission yet."
        : "AI matching is offline — showing the mission team.";
    } else {
      const system =
        "You are IRIS. A proposal writer needs an expert for a specific question. " +
        "You have access to the Athena team's expertise data. Search it and return the best matches ranked by relevance. " +
        "Be specific about WHY each person is recommended — based on their actual experience, not their job title. " +
        "Return only valid JSON.";

      const teamForPrompt = people.map((p) => ({
        user_id: p.user_id,
        name: p.name,
        title: p.title,
        mission_role: p.mission_role,
        skills: p.skills,
      }));

      const userMsg = [
        `Question: ${questionNumber ? `${questionNumber} — ` : ""}${questionTitle || "(unspecified)"}.`,
        `Section: ${sectionName || "(unspecified)"}.`,
        `Search query: ${data.query}.`,
        `Team expertise data: ${JSON.stringify(teamForPrompt)}.`,
        "",
        'Return JSON: { "matches": [{ "user_id": string, "name": string, "initials": string, "why_iris_recommends": string (max 120 chars, specific to their actual experience), "top_expertise_match": string, "consultation_suggestion": string (max 80 chars, what to ask them) }], "iris_message": string (max 150 chars) }',
        "Rank by relevance. Return at most 5 matches. Only include people from the team data above. Omit people with no relevant match.",
      ].join("\n");

      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: 900,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = j.choices?.[0]?.message?.content ?? "";
          const m = content.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]) as {
              matches?: ExpertMatch[];
              iris_message?: string;
            };
            const valid = new Set(people.map((p) => p.user_id));
            const byId = new Map(people.map((p) => [p.user_id, p]));
            matches = (parsed.matches ?? [])
              .filter((x) => x && valid.has(x.user_id))
              .slice(0, 5)
              .map((x) => {
                const p = byId.get(x.user_id)!;
                return {
                  user_id: x.user_id,
                  name: x.name || p.name,
                  initials: x.initials || p.initials,
                  why_iris_recommends: (x.why_iris_recommends || "").slice(0, 160),
                  top_expertise_match: x.top_expertise_match || p.skills[0] || "Mission team",
                  consultation_suggestion: (x.consultation_suggestion || "").slice(0, 120),
                };
              });
            irisMessage = (parsed.iris_message || "").slice(0, 200);
          }
        }
      } catch (e) {
        console.error("[phone-a-friend] gateway failed", e);
      }
    }

    // Log to Oracle expertise graph
    try {
      await (supabase as any).from("expertise_queries").insert({
        mission_id: data.missionId,
        question_id: data.questionId ?? null,
        user_id: userId,
        query_text: data.query,
        matched_user_ids: matches.map((m) => m.user_id),
        iris_message: irisMessage || null,
      });
    } catch (e) {
      console.error("[phone-a-friend] failed to log expertise query", e);
    }

    return { matches, iris_message: irisMessage, context: { questionNumber, questionTitle, sectionName } };
  });

const AddInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
  questionNumber: z.string().nullable().optional(),
  questionText: z.string().nullable().optional(),
  expertUserId: z.string().uuid(),
  expertName: z.string().min(1),
  expertTitle: z.string().nullable().optional(),
  whyIrisRecommends: z.string().min(1),
});

export const addExpertToThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AddInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve actor name
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();
    const actorName =
      (prof as any)?.display_name || (prof as any)?.email?.split("@")[0] || "A teammate";

    const body = `IRIS added ${data.expertName} to this Thread as a subject matter expert. ${data.expertName} — ${data.whyIrisRecommends}`;

    const { data: inserted, error } = await supabase
      .from("thread_messages")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        sender_id: null,
        sender_name: "IRIS",
        message_type: "iris",
        iris_action: "recommend_expert",
        message_body: body,
        metadata: { expert_user_id: data.expertUserId, expert_name: data.expertName },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      await supabase.from("atlas_notifications").insert({
        recipient_role: "specific_user",
        recipient_id: data.expertUserId,
        type: "expert_recommended",
        message: `You have been recommended as an expert on question ${data.questionNumber ?? ""}. ${actorName} may reach out.`.trim(),
        metadata: {
          mission_id: data.missionId,
          question_id: data.questionId,
          thread_message_id: (inserted as any)?.id ?? null,
          recommended_by: userId,
        },
      });
    } catch (e) {
      console.error("[phone-a-friend] notification failed", e);
    }

    // Fire-and-forget: record the SME session for Oracle profiles
    try {
      const sessionContent = [
        data.questionNumber ? `Q${data.questionNumber}` : null,
        data.questionText ?? null,
        `Why IRIS recommends ${data.expertName}: ${data.whyIrisRecommends}`,
      ]
        .filter(Boolean)
        .join(" — ");
      recordSmeSession({
        missionId: data.missionId,
        requestingUserId: userId,
        smeUserId: data.expertUserId,
        smeName: data.expertName,
        smeTitle: data.expertTitle ?? null,
        sessionContent,
      });
    } catch (e) {
      console.error("[phone-a-friend] sme session trigger failed", e);
    }

    return { ok: true, thread_message_id: (inserted as any)?.id ?? null };
  });

const ProfilesInput = z.object({ userIds: z.array(z.string().uuid()).max(50) });

export type SmeProfileSummary = {
  user_id: string;
  total_sessions: number;
  domain_tags: string[];
};

export const getSmeProfilesByUserIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProfilesInput.parse(d))
  .handler(async ({ data }) => {
    if (data.userIds.length === 0) return { profiles: [] as SmeProfileSummary[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("oracle_sme_profiles")
      .select("user_id, total_sessions, domain_tags")
      .in("user_id", data.userIds);
    if (error) {
      console.error("[phone-a-friend] sme profile fetch failed", error.message);
      return { profiles: [] as SmeProfileSummary[] };
    }
    const profiles: SmeProfileSummary[] = (rows ?? [])
      .filter((r) => r.user_id)
      .map((r) => ({
        user_id: r.user_id as string,
        total_sessions: (r.total_sessions as number | null) ?? 0,
        domain_tags: ((r.domain_tags as string[] | null) ?? []).filter(Boolean),
      }));
    return { profiles };
  });
