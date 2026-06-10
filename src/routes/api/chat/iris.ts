// IRIS Dock conversational endpoint. Streams the model response (SSE)
// back to the client. Auth required — the caller must be an authenticated
// user; mission membership / role gating happens via the data we look up
// based on the requesting user id.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  missionId: z.string().uuid().nullable(),
  sectionId: z.string().uuid().nullable().optional(),
  questionId: z.string().uuid().nullable().optional(),
  questionText: z.string().nullable().optional(),
  questionNumber: z.string().nullable().optional(),
  sectionName: z.string().nullable().optional(),
  pageLabel: z.string(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })).max(10),
});

export const Route = createFileRoute("/api/chat/iris")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        // Validate the caller, scoped via user JWT (RLS applies).
        const { createClient } = await import("@supabase/supabase-js");
        const supaUrl = process.env.SUPABASE_URL!;
        const supaPub = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
        const userClient = createClient(supaUrl, supaPub, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        // Build mission context (best-effort; missing context still streams).
        let missionCtx = "(no active mission)";
        let userRoleLine = "";
        if (body.missionId) {
          const [m, ws, sg, feed, comps, evol, atRisk] = await Promise.all([
            userClient.from("missions").select("name,client_name,state,agency_name,program_type,blast_off_at").eq("id", body.missionId).maybeSingle(),
            userClient.from("mission_win_strategy").select("central_claim,north_star_message,win_themes,discriminators").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("mission_style_guide").select("voice_and_tone,political_sensitivities,cultural_sensitivities").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("intelligence_feed_items").select("headline,iris_assessment").eq("mission_id", body.missionId).gte("iris_relevance_score", 60).order("created_at", { ascending: false }).limit(3),
            userClient.from("competitor_profiles").select("organization_name,competitor_type").eq("mission_id", body.missionId),
            userClient.from("procurement_evolution_records").select("iris_signals").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("questions").select("question_number,status").eq("mission_id", body.missionId).in("status", ["at_risk", "blocked", "overdue"]),
          ]);
          const tm = await userClient.from("mission_team_members").select("mission_role").eq("mission_id", body.missionId).eq("member_id", user.id).maybeSingle();
          const mm = m.data as { name?: string; client_name?: string; state?: string; agency_name?: string; program_type?: string; blast_off_at?: string | null } | null;
          const wt = Array.isArray(ws.data?.win_themes) ? (ws.data?.win_themes as unknown[]).map((x) => typeof x === "string" ? x : (x as { theme?: string; title?: string })?.theme ?? "").filter(Boolean) : [];
          const risks = (atRisk.data ?? []).map((q) => (q as { question_number: string | null; status: string }).question_number).filter(Boolean);
          missionCtx = [
            `Mission: ${mm?.name ?? "?"} | Client: ${mm?.client_name ?? "?"} | State: ${mm?.state ?? "?"} | Agency: ${mm?.agency_name ?? "?"} | Program: ${mm?.program_type ?? "?"}`,
            `Win Strategy — Central Claim: ${ws.data?.central_claim ?? "?"}`,
            `North Star: ${ws.data?.north_star_message ?? "?"}`,
            `Win Themes: ${wt.join(" | ") || "(none)"}`,
            `Discriminators: ${ws.data?.discriminators ?? "?"}`,
            `Style — Voice: ${sg.data?.voice_and_tone ?? "?"} | Political: ${sg.data?.political_sensitivities ?? "?"} | Cultural: ${sg.data?.cultural_sensitivities ?? "?"}`,
            `Active competitors: ${(comps.data ?? []).map((c) => `${(c as { organization_name: string }).organization_name} (${(c as { competitor_type: string }).competitor_type})`).join(", ") || "(none)"}`,
            `At-risk questions: ${risks.length} (${risks.slice(0, 8).join(", ")})`,
            `Procurement Evolution: ${evol.data?.iris_signals ?? "(none)"}`,
            `Recent intelligence:\n${(feed.data ?? []).map((i) => `- ${(i as { headline: string }).headline}: ${(i as { iris_assessment: string | null }).iris_assessment ?? ""}`).join("\n") || "(none)"}`,
          ].join("\n");
          userRoleLine = `User mission role: ${(tm.data as { mission_role: string | null } | null)?.mission_role ?? "(none)"}`;
        }

        const userContextLine = [
          `User: ${user.email ?? user.id}`,
          userRoleLine,
          `Current page: ${body.pageLabel}`,
          body.sectionName ? `Active section: ${body.sectionName}` : "",
          body.questionId ? `Active question: ${body.questionNumber ?? ""} — ${body.questionText ?? ""}` : "",
        ].filter(Boolean).join("\n");

        const systemPrompt = `You are IRIS — the AI co-pilot for the ATLAS platform, built by Athena Strategy Group. You are a Medicaid procurement intelligence expert with deep knowledge of this specific mission.

Personality: Confident but never arrogant. Direct — give specific answers, not hedged ones. Strategic — connect dots others miss. Speak plainly, like a trusted colleague. Occasionally push back when the user is missing something important. Never say "As an AI" or "I cannot" — either answer or explain what context you need. Keep responses concise — never more than 200 words unless asked for a draft.

Mission context:
${missionCtx}

Current user context:
${userContextLine}

Instructions:
- When drafting content: use the Style Guide voice. Check sensitivities. Connect to Win Themes.
- When asked about the mission: be specific — use the real data above, not generic statements.
- When asked about risks: be honest. Name what's at risk.
- When asked what to work on: prioritize by due dates, health status, and days to submission.
- When asked about research: reference specific items from the recent intelligence above.
- Never make up facts about the client, state, or procurement. If you don't have it, say so and suggest where to find it.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...body.messages,
        ];

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            stream: true,
            messages,
          }),
        });

        if (upstream.status === 402) return new Response("Workspace is out of AI credits.", { status: 402 });
        if (upstream.status === 429) return new Response("IRIS is rate limited.", { status: 429 });
        if (!upstream.ok || !upstream.body) {
          const txt = await upstream.text();
          return new Response(txt || `IRIS gateway returned ${upstream.status}`, { status: 502 });
        }

        // Re-emit OpenAI-style SSE chunks as plain-text token stream for the client.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buf = "";

        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") { controller.close(); return; }
              try {
                const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
                const tok = j.choices?.[0]?.delta?.content;
                if (tok) controller.enqueue(encoder.encode(tok));
              } catch {
                // ignore parse error on partial chunk
              }
            }
          },
          cancel() { reader.cancel(); },
        });

        return new Response(stream, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
