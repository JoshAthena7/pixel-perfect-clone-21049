import { createFileRoute } from "@tanstack/react-router";

const MISSION_ID = "739ddd6b-d536-4c61-a914-5e782bc0a928"; // NJ CSOC

type TestUser = {
  email: string;
  appRole: "admin" | "writer" | "executive";
  missionRole: "engagement_lead" | "writer" | null; // null = no mission_team_members row
  firstName: string;
  lastName: string;
};

const USERS: TestUser[] = [
  { email: "admin@atlas.test", appRole: "admin", missionRole: "engagement_lead", firstName: "Test", lastName: "Admin" },
  { email: "writer@atlas.test", appRole: "writer", missionRole: "writer", firstName: "Test", lastName: "Writer" },
  { email: "exec@atlas.test", appRole: "executive", missionRole: null, firstName: "Test", lastName: "Executive" },
];

export const Route = createFileRoute("/api/public/dev/seed-test-env")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-dev-seed-token");
        const expected = process.env.DEV_SEED_TOKEN;
        const password = process.env.ATLAS_TEST_USER_PASSWORD;
        if (!expected || !password) return new Response("env not configured", { status: 500 });
        if (!token || token !== expected) return new Response("forbidden", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const report: Record<string, unknown> = {};

        // 1. Create or fetch auth users
        const userIds: Record<string, string> = {};
        for (const u of USERS) {
          // Try to find existing first via listUsers (paginated)
          let existingId: string | null = null;
          let page = 1;
          while (page < 20) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
            if (error) return new Response(`listUsers: ${error.message}`, { status: 500 });
            const hit = data.users.find((x) => x.email?.toLowerCase() === u.email);
            if (hit) { existingId = hit.id; break; }
            if (data.users.length < 200) break;
            page++;
          }
          if (existingId) {
            userIds[u.email] = existingId;
          } else {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
              email: u.email,
              password,
              email_confirm: true,
              user_metadata: { first_name: u.firstName, last_name: u.lastName },
            });
            if (error || !data.user) return new Response(`createUser ${u.email}: ${error?.message}`, { status: 500 });
            userIds[u.email] = data.user.id;
          }
        }
        report.userIds = userIds;

        // 2. profiles row (upsert)
        for (const u of USERS) {
          await supabaseAdmin.from("profiles").upsert({
            id: userIds[u.email],
            email: u.email,
            display_name: `${u.firstName} ${u.lastName}`,
          }, { onConflict: "id" });
        }

        // 3. user_roles
        for (const u of USERS) {
          await supabaseAdmin.from("user_roles").upsert({
            user_id: userIds[u.email],
            role: u.appRole,
          }, { onConflict: "user_id,role" });
        }

        // 4. atlas_team_members (email-keyed)
        const atmIds: Record<string, string> = {};
        for (const u of USERS) {
          const { data: existing } = await supabaseAdmin
            .from("atlas_team_members")
            .select("id")
            .ilike("email", u.email)
            .maybeSingle();
          if (existing?.id) {
            atmIds[u.email] = existing.id;
          } else {
            const { data, error } = await supabaseAdmin
              .from("atlas_team_members")
              .insert({
                email: u.email,
                first_name: u.firstName,
                last_name: u.lastName,
                atlas_role: u.appRole === "executive" ? "unassigned" : u.appRole,
                atlas_invite_status: "active",
              })
              .select("id")
              .single();
            if (error || !data) return new Response(`atm ${u.email}: ${error?.message}`, { status: 500 });
            atmIds[u.email] = data.id;
          }
        }
        report.atmIds = atmIds;

        // 5. mission_team_members (admin + writer only — exec lacks a valid mission_role)
        for (const u of USERS) {
          if (!u.missionRole) continue;
          const { data: existing } = await supabaseAdmin
            .from("mission_team_members")
            .select("id")
            .eq("mission_id", MISSION_ID)
            .eq("member_id", atmIds[u.email])
            .maybeSingle();
          if (!existing) {
            const { error } = await supabaseAdmin.from("mission_team_members").insert({
              mission_id: MISSION_ID,
              member_id: atmIds[u.email],
              mission_role: u.missionRole,
            });
            if (error) return new Response(`mtm ${u.email}: ${error.message}`, { status: 500 });
          }
        }

        // 6. mission_questions (5 — one at_risk, varied statuses)
        const { count: existingQCount } = await supabaseAdmin
          .from("mission_questions")
          .select("*", { count: "exact", head: true })
          .eq("mission_id", MISSION_ID);
        if (!existingQCount) {
          const rows = [
            { question_number: "Q1", question_text: "Describe the proposed 24x7 SOC operations model.", health_status: "healthy",  status: "in_progress", word_limit: 500 },
            { question_number: "Q2", question_text: "Detail your SIEM/SOAR platform and integration approach.", health_status: "healthy", status: "not_started", word_limit: 750 },
            { question_number: "Q3", question_text: "Provide your incident response procedure and SLAs.", health_status: "watch", status: "in_progress", word_limit: 600 },
            { question_number: "Q4", question_text: "Outline your threat intelligence sources and analyst tradecraft.", health_status: "at_risk", status: "not_started", word_limit: 1000, iris_confidence: "low" },
            { question_number: "Q5", question_text: "Describe your transition-in plan and milestones.", health_status: "healthy", status: "complete", word_limit: 400 },
          ].map(r => ({ ...r, mission_id: MISSION_ID }));
          const { error } = await supabaseAdmin.from("mission_questions").insert(rows);
          if (error) return new Response(`mission_questions: ${error.message}`, { status: 500 });
        }

        // 7. athena_insight (1 daily)
        const { count: athenaCount } = await supabaseAdmin
          .from("athena_insights")
          .select("*", { count: "exact", head: true })
          .eq("mission_id", MISSION_ID);
        if (!athenaCount) {
          await supabaseAdmin.from("athena_insights").insert({
            mission_id: MISSION_ID,
            is_daily_insight: true,
            quote: "NJ CSOC values demonstrated, repeatable analyst tradecraft over tool-list breadth — evaluators have flagged 'tool soup' responses in prior cycles.",
            writers_note: "Lead with two named playbooks and the analyst certification cadence before naming any platform.",
          });
        }

        // 8. competitor_profile (1)
        const { count: compCount } = await supabaseAdmin
          .from("competitor_profiles")
          .select("*", { count: "exact", head: true })
          .eq("mission_id", MISSION_ID);
        if (!compCount) {
          await supabaseAdmin.from("competitor_profiles").insert({
            mission_id: MISSION_ID,
            organization_name: "Sentinel Cyber Partners",
            competitor_type: "incumbent",
            likely_narrative: "Continuity, in-state staffing, deep NJOHSP relationships.",
            known_strengths: "Existing badge access at Trenton, 14 analysts already cleared.",
            known_weaknesses: "Two reported SLA misses in FY25; high analyst turnover.",
            iris_confidence: "medium",
          });
        }

        return Response.json({ ok: true, ...report });
      },
    },
  },
});
