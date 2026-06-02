import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "./iris-prompts";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (refreshes morning brief multiple times/day)

export const generateLobbyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ force: z.boolean().optional().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Check cache
    if (!data.force) {
      const { data: cached } = await supabase
        .from("iris_brief_cache")
        .select("brief_text, generated_at")
        .eq("scope", "lobby")
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.generated_at) {
        const age = Date.now() - new Date(cached.generated_at).getTime();
        if (age < CACHE_TTL_MS) {
          return { brief: cached.brief_text, generated_at: cached.generated_at, cached: true };
        }
      }
    }

    // 2. Gather firm-wide context
    const { data: missions } = await supabase
      .from("missions")
      .select("id,name,client,state,health,submission_date,status")
      .eq("status", "Active");
    const missionIds = (missions ?? []).map((m) => m.id);

    const [{ data: qs }, { data: collab }, { data: conflicts }, { data: gates }, { data: intel }, { data: sosSignals }] = await Promise.all([
      missionIds.length
        ? supabase.from("question_records").select("mission_id,health,pens_down_date,status").in("mission_id", missionIds)
        : Promise.resolve({ data: [] as any[] }),
      missionIds.length
        ? supabase
            .from("question_collaboration")
            .select("mission_id,entry_type,body,created_at")
            .in("mission_id", missionIds)
            .in("entry_type", ["sme_request", "decision_needed", "air_cover"])
            .eq("resolved", false)
            .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        : Promise.resolve({ data: [] as any[] }),
      missionIds.length
        ? supabase
            .from("alignment_conflicts")
            .select("mission_id,description,severity")
            .in("mission_id", missionIds)
            .is("resolved_at", null)
        : Promise.resolve({ data: [] as any[] }),
      missionIds.length
        ? supabase
            .from("mission_review_gates")
            .select("mission_id,gate_name,target_date")
            .in("mission_id", missionIds)
            .gte("target_date", new Date().toISOString().slice(0, 10))
            .lte("target_date", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("market_intelligence")
        .select("title,summary,published_at")
        .order("created_at", { ascending: false })
        .limit(3),
      missionIds.length
        ? supabase
            .from("signals")
            .select("mission_id,signal_title,severity")
            .in("mission_id", missionIds)
            .eq("status", "open")
            .eq("severity", "critical")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // 3. Build context summary
    const missionLines = (missions ?? []).map((m) => {
      const mqs = (qs ?? []).filter((q) => q.mission_id === m.id);
      const g = mqs.filter((q) => q.health === "green").length;
      const y = mqs.filter((q) => q.health === "yellow").length;
      const r = mqs.filter((q) => q.health === "red").length;
      const days = m.submission_date
        ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
        : null;
      return `- ${m.name} (${m.client}${m.state ? `, ${m.state}` : ""}): health=${m.health}, ${mqs.length}q [${g}G/${y}Y/${r}R]${days !== null ? `, submission in ${days}d` : ""}`;
    }).join("\n");

    const collabSummary = (collab ?? []).slice(0, 10).map((c) =>
      `- [${c.entry_type}] ${(c.body ?? "").slice(0, 120)}`
    ).join("\n");
    const conflictSummary = (conflicts ?? []).slice(0, 10).map((c) =>
      `- [${c.severity}] ${c.description.slice(0, 140)}`
    ).join("\n");
    const gateSummary = (gates ?? []).map((g) => `- ${g.gate_name} on ${g.target_date}`).join("\n");
    const intelSummary = (intel ?? []).map((i) => `- ${i.title}: ${(i.summary ?? "").slice(0, 160)}`).join("\n");
    const sosSummary = (sosSignals ?? []).slice(0, 5).map((s) => `- ${s.signal_title}`).join("\n");

    const userMsg = `FIRM CONTEXT — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}

Active missions:
${missionLines || "(none active)"}

Unresolved team needs (24h):
${collabSummary || "(none)"}

Unresolved alignment conflicts:
${conflictSummary || "(none)"}

Review gates in next 14 days:
${gateSummary || "(none)"}

Open critical SOS signals:
${sosSummary || "(none)"}

Recent market intelligence (latest 3):
${intelSummary || "(none)"}`;

    const sys = `Write a 3-sentence firm-wide morning brief for the leadership team.
Sentence 1: overall firm health across active missions.
Sentence 2: the most urgent thing happening right now (name the mission, question number, person).
Sentence 3: one forward-looking signal (upcoming deadline, gate, or market event).
Plain prose. No headers, no bullets. Be specific. Use names, numbers, dates.`;

    const brief = (await callIris(sys, userMsg)) ?? "IRIS is initializing. Configure LOVABLE_API_KEY to activate firm-wide intelligence.";

    // 4. Cache
    await supabase.from("iris_brief_cache").insert({
      scope: "lobby",
      user_id: userId,
      brief_text: brief,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    });

    return { brief, generated_at: new Date().toISOString(), cached: false };
  });
