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
        let memoryCtx = "";
        let conversationCtx = "";
        if (body.missionId) {
          const [m, ws, sg, feed, comps, evol, atRisk, sigs, allQs, irisCfg] = await Promise.all([
            userClient.from("missions").select("name,client_name,state,agency_name,program_type,blast_off_at").eq("id", body.missionId).maybeSingle(),
            userClient.from("mission_win_strategy").select("central_claim,north_star_message,win_themes,discriminators").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("mission_style_guide").select("voice_and_tone,political_sensitivities,cultural_sensitivities").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("intelligence_feed_items").select("headline,iris_assessment").eq("mission_id", body.missionId).gte("iris_relevance_score", 60).order("created_at", { ascending: false }).limit(3),
            userClient.from("competitor_profiles").select("organization_name,competitor_type").eq("mission_id", body.missionId),
            userClient.from("procurement_evolution_records").select("iris_signals").eq("mission_id", body.missionId).maybeSingle(),
            userClient.from("questions").select("question_number,status").eq("mission_id", body.missionId).in("status", ["at_risk", "blocked", "overdue"]),
            userClient.from("oracle_signals").select("id", { count: "exact", head: true }).eq("mission_id", body.missionId).in("status", ["approved", "pushed"]),
            userClient.from("questions").select("status").eq("mission_id", body.missionId),
            userClient.from("mission_iris_config").select("evaluator_name,evaluator_persona_name,evaluator_lens,evaluator_priorities,win_theme_keywords,known_competitors").eq("mission_id", body.missionId).maybeSingle(),
          ]);
          const tm = await userClient.from("mission_team_members").select("mission_role").eq("mission_id", body.missionId).eq("member_id", user.id).maybeSingle();
          const mm = m.data as { name?: string; client_name?: string; state?: string; agency_name?: string; program_type?: string; blast_off_at?: string | null } | null;
          const wt = Array.isArray(ws.data?.win_themes) ? (ws.data?.win_themes as unknown[]).map((x) => typeof x === "string" ? x : (x as { theme?: string; title?: string })?.theme ?? "").filter(Boolean) : [];
          const risks = (atRisk.data ?? []).map((q) => (q as { question_number: string | null; status: string }).question_number).filter(Boolean);
          // Computed mission identity for the stamp.
          const fullName = mm?.name ?? "Unknown Mission";
          const shortCode = (fullName.split(/[-—:]/)[0] ?? fullName).trim().slice(0, 24) || "Mission";
          const stateCode = (mm?.state ?? "—").toString().slice(0, 6).toUpperCase();
          const days = mm?.blast_off_at ? Math.ceil((new Date(mm.blast_off_at).getTime() - Date.now()) / 86_400_000) : null;
          const qsAll = (allQs.data ?? []) as Array<{ status: string | null }>;
          const totalQ = qsAll.length;
          const finalQ = qsAll.filter((q) => q.status === "finalized" || q.status === "submitted").length;
          const sigCount = sigs.count ?? 0;
          const cfg = irisCfg.data as { evaluator_name?: string | null; evaluator_persona_name?: string | null; evaluator_lens?: string | null; evaluator_priorities?: string[] | null; win_theme_keywords?: string[] | null; known_competitors?: unknown } | null;
          const evaluatorName = cfg?.evaluator_name ?? cfg?.evaluator_persona_name ?? "the evaluation committee";
          const winKw = (cfg?.win_theme_keywords ?? []).filter(Boolean);
          const knownComps = Array.isArray(cfg?.known_competitors) ? cfg!.known_competitors as Array<Record<string, unknown>> : [];
          missionCtx = [
            `Mission: ${fullName} | Short code: ${shortCode} | Client: ${mm?.client_name ?? "?"} | State: ${stateCode} | Agency: ${mm?.agency_name ?? "?"} | Program: ${mm?.program_type ?? "?"}`,
            `Submission: ${mm?.blast_off_at ?? "(not set)"} (${days ?? "?"} days remaining)`,
            `ORACLE intelligence: ${sigCount} approved signals available`,
            `Progress: ${finalQ} of ${totalQ} questions finalized`,
            `Win Strategy — Central Claim: ${ws.data?.central_claim ?? "?"}`,
            `North Star: ${ws.data?.north_star_message ?? "?"}`,
            `Win Themes: ${wt.join(" | ") || "(none)"}`,
            `Win Theme Keywords: ${winKw.join(", ") || "(none)"}`,
            `Discriminators: ${ws.data?.discriminators ?? "?"}`,
            `Style — Voice: ${sg.data?.voice_and_tone ?? "?"} | Political: ${sg.data?.political_sensitivities ?? "?"} | Cultural: ${sg.data?.cultural_sensitivities ?? "?"}`,
            `Evaluator persona: ${evaluatorName}${cfg?.evaluator_lens ? ` — lens: ${cfg.evaluator_lens}` : ""}${(cfg?.evaluator_priorities ?? []).length ? ` — priorities: ${(cfg!.evaluator_priorities ?? []).join(", ")}` : ""}`,
            `Active competitors: ${(comps.data ?? []).map((c) => `${(c as { organization_name: string }).organization_name} (${(c as { competitor_type: string }).competitor_type})`).join(", ") || "(none)"}`,
            knownComps.length ? `Known competitors (config): ${knownComps.map((c) => (c.name ?? c.organization_name ?? "?")).join(", ")}` : "",
            `At-risk questions: ${risks.length} (${risks.slice(0, 8).join(", ")})`,
            `Procurement Evolution: ${evol.data?.iris_signals ?? "(none)"}`,
            `Recent intelligence:\n${(feed.data ?? []).map((i) => `- ${(i as { headline: string }).headline}: ${(i as { iris_assessment: string | null }).iris_assessment ?? ""}`).join("\n") || "(none)"}`,
            `MISSION_STAMP: ${shortCode} · ${days ?? "?"}d to submission · ${finalQ} finalized · ${sigCount} ORACLE signals`,
          ].filter(Boolean).join("\n");
          userRoleLine = `User mission role: ${(tm.data as { mission_role: string | null } | null)?.mission_role ?? "(none)"}`;

          // Institutional memory: Athena patterns relevant to this state.
          if (mm?.state) {
            const mem = await userClient
              .from("atlas_institutional_memory")
              .select("pattern_type,pattern_description,confidence_score")
              .contains("applicable_states", [mm.state])
              .eq("suppressed", false)
              .gte("confidence_score", 0.6)
              .order("confidence_score", { ascending: false })
              .limit(5);
            const rows = (mem.data ?? []) as Array<{ pattern_type: string; pattern_description: string; confidence_score: number }>;
            if (rows.length) {
              memoryCtx = `Institutional memory (Athena patterns for ${stateCode}):\n${rows.map((r) => `- [${r.pattern_type}] ${r.pattern_description}`).join("\n")}`;
            }
          }

          // Cross-session conversation context for this (user, mission).
          const ctxRow = await userClient
            .from("iris_conversation_context")
            .select("summary,recent_topics,message_count,last_message_at")
            .eq("user_id", user.id).eq("mission_id", body.missionId).maybeSingle();
          const ctx = ctxRow.data as { summary: string | null; recent_topics: unknown; message_count: number; last_message_at: string | null } | null;
          if (ctx && (ctx.summary || ctx.message_count > 0)) {
            const topics = Array.isArray(ctx.recent_topics)
              ? (ctx.recent_topics as Array<{ topic?: string }>).map((t) => t?.topic).filter(Boolean).slice(0, 5)
              : [];
            conversationCtx = [
              `Prior conversation with this user on this mission (${ctx.message_count} previous messages):`,
              ctx.summary ? `Summary: ${ctx.summary}` : "",
              topics.length ? `Recent topics: ${topics.join(" · ")}` : "",
            ].filter(Boolean).join("\n");
          }

          // Fire-and-forget: record this user turn into conversation context.
          const lastUserMsg = [...body.messages].reverse().find((mm2) => mm2.role === "user")?.content ?? "";
          if (lastUserMsg) {
            const topic = lastUserMsg.slice(0, 80);
            const prevTopics = Array.isArray(ctx?.recent_topics)
              ? (ctx!.recent_topics as Array<{ topic: string; at: string }>)
              : [];
            const nextTopics = [{ topic, at: new Date().toISOString() }, ...prevTopics].slice(0, 10);
            void userClient.from("iris_conversation_context").upsert({
              user_id: user.id,
              mission_id: body.missionId,
              recent_topics: nextTopics,
              message_count: (ctx?.message_count ?? 0) + 1,
              last_message_at: new Date().toISOString(),
              summary: ctx?.summary ?? null,
            }, { onConflict: "user_id,mission_id" });
          }
        }

        const userContextLine = [
          `User: ${user.email ?? user.id}`,
          userRoleLine,
          `Current page: ${body.pageLabel}`,
          body.sectionName ? `Active section: ${body.sectionName}` : "",
          body.questionId ? `Active question: ${body.questionNumber ?? ""} — ${body.questionText ?? ""}` : "",
        ].filter(Boolean).join("\n");

        const systemPrompt = `You are IRIS — the AI intelligence analyst for the ATLAS platform, built by Athena Strategy Group. You are a Medicaid procurement intelligence expert assigned to ONE specific mission.

CRITICAL GROUNDING RULES — read before answering:
1. You ONLY discuss the mission described in "Mission context" below. NEVER reference other missions, other states, or other procurements. If "Mission context" says "(no active mission)", tell the user to open a mission first and STOP — do not invent one.
2. NEVER invent dates, deadlines, agency names, client names, RFP numbers, or evaluation criteria. If a fact is not in the context block, say "I don't have that data — check [where in ATLAS]".
3. ATLAS is NOT a writing tool. Writers draft their actual responses in their client environments (Word, SharePoint, Loopio). In ATLAS you brief them, give intel, surface risks, and help them coordinate. NEVER tell a user to "write their draft here", "compose in this panel", or imply ATLAS is where the final response is authored.
4. If "Mission context" contains a line starting with "MISSION_STAMP:", you MUST end your response with that exact stamp on its own final line, prefixed with two newlines. Do not modify the stamp text. If no MISSION_STAMP is provided, do not invent one.

Personality: Confident but never arrogant. Direct — give specific answers, not hedged ones. Strategic — connect dots others miss. Speak plainly, like a trusted colleague. Occasionally push back when the user is missing something important. Never say "As an AI" or "I cannot" — either answer or explain what context you need. Keep responses concise — never more than 200 words unless asked for a long-form brief.

Mission context:
${missionCtx}

${memoryCtx ? memoryCtx + "\n\n" : ""}${conversationCtx ? conversationCtx + "\n\n" : ""}Current user context:
${userContextLine}

Instructions:
- When asked about the mission: use the real data above, not generic statements.
- When asked about risks: be honest. Name what's at risk by question number.
- When asked what to work on: prioritize by days to submission and at-risk status.
- When asked about intel: reference specific items from "Recent intelligence" above. If empty, say there is no new intel.
- When asked to "draft", "write", or "compose": offer a strategic outline, talking points, or proof points the writer can take to their client document. Do NOT produce a final response body and do NOT imply ATLAS is the place to author it.
- Never make up facts about the client, state, or procurement. If you don't have it, say so.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...body.messages,
        ];


        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
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
