import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { fetchIrisMemoryContext, logIrisMemoryUsage } from "./iris-memory.functions";

async function callIris(system: string, user: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "_IRIS is not configured yet. The built-in AI key is missing._";

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 402) return "_IRIS needs workspace AI credits before it can answer._";
    if (res.status === 429) return "_IRIS is rate limited right now. Try again in a minute._";
    if (!res.ok) return `_IRIS gateway returned ${res.status}._`;

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || "_IRIS returned an empty answer._";
  } catch (e: any) {
    return `_IRIS error: ${e?.message ?? "unknown"}._`;
  }
}

const IRIS_SYSTEM = `You are IRIS, Athena Strategy Group's embedded intelligence analyst for Medicaid procurement and proposal teams. Be direct, specific, concise, and operational. Use bullets when helpful. Do not use filler or a "Here is" preamble.

Before answering, search your INSTITUTIONAL MEMORY (provided below). Critical memories are firm-wide non-negotiables and must always inform your response. Never contradict a Critical memory without explicitly flagging the conflict.`;

export const irisAskGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ prompt: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: missions }, { data: signals }, { data: intel }, mem] = await Promise.all([
      supabase.from("missions").select("id,name,client,state,health,status,submission_date").eq("status", "Active").limit(20),
      supabase.from("signals").select("signal_title,signal_summary,severity,status,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(12),
      supabase.from("market_intelligence").select("title,summary,published_at").order("created_at", { ascending: false }).limit(6),
      fetchIrisMemoryContext(supabase, { missionId: null }),
    ]);

    const missionLines = (missions ?? []).map((m) => `- ${m.name} (${m.client}${m.state ? `, ${m.state}` : ""}): ${m.health}, due ${m.submission_date ?? "TBD"}`).join("\n");
    const signalLines = (signals ?? []).map((s) => `- [${s.severity}] ${s.signal_title}: ${s.signal_summary ?? ""}`).join("\n");
    const intelLines = (intel ?? []).map((i) => `- ${i.title}: ${i.summary ?? ""}`).join("\n");

    const answer = await callIris(
      `${IRIS_SYSTEM}\nYou are answering from the Lobby, so use firm-wide context across missions, open signals, and market intelligence. If the user asks for a mission-specific answer, tell them which mission to open.\n\n${mem.block}`,
      `Active missions:\n${missionLines || "(none)"}\n\nOpen signals:\n${signalLines || "(none)"}\n\nMarket intelligence:\n${intelLines || "(none)"}\n\nUser asks: ${data.prompt}`,
    );
    if (mem.ids.length) await logIrisMemoryUsage(supabase, mem.ids, { context: "Ask IRIS · Lobby" });
    return { answer };
  });

export const irisAskQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      questionId: z.string().uuid(),
      prompt: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q } = await supabase
      .from("question_records")
      .select("question_number,title,question_text,current_focus,next_step,waiting_on,guidance,mission_id")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Response not found");

    const [{ data: m }, mem] = await Promise.all([
      supabase
        .from("missions")
        .select("name,client,state,description,submission_date")
        .eq("id", q.mission_id)
        .maybeSingle(),
      fetchIrisMemoryContext(supabase, { missionId: q.mission_id }),
    ]);

    const sys = `${IRIS_SYSTEM}\nAnswer the writer's question about this specific response with actionable guidance.\n\n${mem.block}`;
    const user = `Mission: ${m?.name ?? "Unknown"} · Client: ${m?.client ?? "—"} · State: ${m?.state ?? "—"}\nResponse: ${q.question_number} — ${q.title}\nPrompt: ${q.question_text}\nCurrent focus: ${q.current_focus ?? "(none)"}\nNext step: ${q.next_step ?? "(none)"}\nWaiting on: ${q.waiting_on ?? "(none)"}\nLeadership guidance: ${q.guidance ?? "(none)"}\n\nWriter asks: ${data.prompt}`;

    const answer = await callIris(sys, user);
    if (mem.ids.length) await logIrisMemoryUsage(supabase, mem.ids, { missionId: q.mission_id, questionId: data.questionId, context: `Ask IRIS · Q${q.question_number}` });
    return { answer };
  });

export const irisAskMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      prompt: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: m } = await supabase
      .from("missions")
      .select("name,client,state,description,submission_date")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!m) throw new Error("Mission not found");

    const sys = `${IRIS_SYSTEM}\nAnswer the user's question about this mission with actionable guidance.`;
    const user = `Mission: ${m.name} · Client: ${m.client ?? "—"} · State: ${m.state ?? "—"}\nSubmission: ${m.submission_date ?? "—"}\nDescription: ${m.description ?? "(none)"}\n\nUser asks: ${data.prompt}`;

    return { answer: await callIris(sys, user) };
  });
