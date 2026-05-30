// /api/public/hooks/intelligence-engine
// Cron-driven hourly. Generates pattern-recognition insights.

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/intelligence-engine")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiGenerate(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return "";
    const json: any = await res.json();
    return (json?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const lovableKey = process.env.LOVABLE_API_KEY ?? "";

  const counts: Record<string, number> = {
    trajectory_warning: 0,
    section_risk: 0,
    systemic_issue: 0,
    client_risk: 0,
    below_win_curve: 0,
    capacity_warning: 0,
    content_pattern: 0,
  };

  const { data: weights } = await supabase.from("insight_type_weights").select("*");
  const weightsMap = new Map((weights ?? []).map((w: any) => [w.insight_type, w]));
  const confidenceFor = (type: string): number => {
    const w = weightsMap.get(type);
    if (!w) return 0.5;
    const acc = Number(w.accuracy_rate ?? 0.5);
    const base = Number(w.base_confidence ?? 0.5);
    // Blend base confidence with measured accuracy when we have data
    return w.total_count > 5 ? Number((acc * 0.6 + base * 0.4).toFixed(2)) : base;
  };

  const insightsToInsert: any[] = [];

  // Skip if a similar unactioned insight exists in last 48h
  async function recentSimilarExists(engagementId: string | null, type: string): Promise<boolean> {
    let q = supabase
      .from("intelligence_insights")
      .select("id", { count: "exact", head: true })
      .eq("insight_type", type)
      .eq("actioned", false)
      .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString());
    q = engagementId ? q.eq("engagement_id", engagementId) : q.is("engagement_id", null);
    const { count } = await q;
    return (count ?? 0) > 0;
  }

  const { data: active } = await supabase
    .from("engagements")
    .select("id,name,client,submission_date,state")
    .eq("status", "Active");
  const activeEngagements = active ?? [];

  // -----------------------------------------------
  // Analysis 1: trajectory_warning
  // -----------------------------------------------
  for (const eng of activeEngagements) {
    const { data: snaps } = await supabase
      .from("snapshots")
      .select("snapshot_date,temperature_score")
      .eq("engagement_id", eng.id)
      .order("snapshot_date", { ascending: false })
      .limit(5);
    if (!snaps || snaps.length < 4) continue;
    const scores = snaps.map((s: any) => s.temperature_score).reverse(); // oldest -> newest
    let drops = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] < scores[i - 1]) drops++;
    const latest = scores[scores.length - 1];
    if (drops >= 3 && latest < 70) {
      if (await recentSimilarExists(eng.id, "trajectory_warning")) continue;
      const body = await aiGenerate(
        "You are Athena. Write a 2-sentence executive alert (max 280 chars). Direct, no preamble.",
        `Engagement: ${eng.name} (${eng.client}). Health score trajectory (oldest→newest): ${scores.join(" → ")}. Latest is ${latest}. Explain the decline pattern and what it likely signals.`,
        lovableKey,
      );
      insightsToInsert.push({
        engagement_id: eng.id,
        insight_type: "trajectory_warning",
        title: `Declining trajectory — score ${latest}`,
        body: body || `Health has fallen across ${drops} of the last 4 snapshots, now at ${latest}. Worth a leadership review.`,
        severity: latest < 50 ? "critical" : "warning",
        confidence_score: confidenceFor("trajectory_warning"),
        supporting_data: { scores, drops },
      });
      counts.trajectory_warning++;
    }
  }

  // -----------------------------------------------
  // Analysis 2: section_risk — current at-risk sections
  // -----------------------------------------------
  for (const eng of activeEngagements) {
    if (!eng.submission_date) continue;
    const days = Math.ceil((new Date(eng.submission_date).getTime() - Date.now()) / 86400000);
    if (days > 21 || days < 0) continue;
    const { data: sections } = await supabase
      .from("heatmap_sections")
      .select("id,section_name,status,updated_at")
      .eq("engagement_id", eng.id)
      .in("status", ["Red", "Yellow"]);
    for (const s of sections ?? []) {
      if (await recentSimilarExists(eng.id, "section_risk")) break;
      const ageDays = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 86400000);
      if (s.status === "Red" || (s.status === "Yellow" && ageDays > 3)) {
        insightsToInsert.push({
          engagement_id: eng.id,
          insight_type: "section_risk",
          title: `${s.section_name} is ${s.status} with ${days}d to submission`,
          body: `${s.section_name} has been ${s.status} for ${ageDays} day${ageDays === 1 ? "" : "s"} with ${days} days until submission. Historical pattern: sections still flagged at this stage account for the majority of post-mortem regrets.`,
          severity: s.status === "Red" ? "critical" : "warning",
          confidence_score: confidenceFor("section_risk"),
          supporting_data: { section_id: s.id, status: s.status, age_days: ageDays, days_to_submission: days },
        });
        counts.section_risk++;
        break;
      }
    }
  }

  // -----------------------------------------------
  // Analysis 3: systemic_issue across engagements
  // -----------------------------------------------
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: recentSos } = await supabase
    .from("sos_alerts")
    .select("category,engagement_id")
    .gte("created_at", since14);
  const byCategory = new Map<string, Set<string>>();
  const byCategoryCount = new Map<string, number>();
  for (const a of recentSos ?? []) {
    const set = byCategory.get(a.category) ?? new Set<string>();
    set.add(a.engagement_id);
    byCategory.set(a.category, set);
    byCategoryCount.set(a.category, (byCategoryCount.get(a.category) ?? 0) + 1);
  }
  for (const [category, engSet] of byCategory) {
    const count = byCategoryCount.get(category) ?? 0;
    if (count >= 3 && engSet.size >= 2) {
      if (await recentSimilarExists(null, "systemic_issue")) continue;
      const rec = await aiGenerate(
        "You are Athena. Write a 2-sentence recommendation for firm leadership.",
        `Pattern detected: ${count} SOS alerts in category "${category}" across ${engSet.size} different engagements in the last 14 days. Suggest what this systemic issue likely indicates and a tactical action.`,
        lovableKey,
      );
      insightsToInsert.push({
        engagement_id: null,
        insight_type: "systemic_issue",
        title: `Firm-wide pattern: ${category}`,
        body: rec || `${count} alerts in "${category}" across ${engSet.size} engagements in 14d. Likely a process or staffing issue worth a firm-level fix.`,
        severity: "warning",
        confidence_score: confidenceFor("systemic_issue"),
        supporting_data: { category, alert_count: count, engagements: Array.from(engSet) },
      });
      counts.systemic_issue++;
    }
  }

  // -----------------------------------------------
  // Analysis 4: client_risk (sentiment drop)
  // -----------------------------------------------
  const sentimentRank: Record<string, number> = { Happy: 3, Neutral: 2, Concerned: 1, Frustrated: 0 };
  for (const eng of activeEngagements) {
    const { data: pulses } = await supabase
      .from("client_pulses")
      .select("interaction_date,sentiment,summary")
      .eq("engagement_id", eng.id)
      .order("interaction_date", { ascending: false })
      .limit(3);
    if (!pulses || pulses.length < 2) continue;
    const latest = sentimentRank[pulses[0].sentiment] ?? 2;
    const prev = sentimentRank[pulses[1].sentiment] ?? 2;
    if (latest < prev) {
      if (await recentSimilarExists(eng.id, "client_risk")) continue;
      insightsToInsert.push({
        engagement_id: eng.id,
        insight_type: "client_risk",
        title: `Client sentiment dropped: ${pulses[1].sentiment} → ${pulses[0].sentiment}`,
        body: `Latest client pulse moved from ${pulses[1].sentiment} to ${pulses[0].sentiment}. Latest summary: ${pulses[0].summary?.slice(0, 200) ?? "(no summary)"}.`,
        severity: latest <= 1 ? "critical" : "warning",
        confidence_score: confidenceFor("client_risk"),
        supporting_data: { from: pulses[1].sentiment, to: pulses[0].sentiment },
      });
      counts.client_risk++;
    }
  }

  // -----------------------------------------------
  // Analysis 5: below_win_curve
  // -----------------------------------------------
  const { data: wonOutcomes } = await supabase
    .from("engagement_outcomes")
    .select("engagement_id")
    .eq("outcome", "Won");
  const wonIds = (wonOutcomes ?? []).map((o: any) => o.engagement_id);
  let benchmark30 = 0, benchmark14 = 0, benchmark7 = 0, benchN = 0;
  if (wonIds.length > 0) {
    const { data: wonEngs } = await supabase
      .from("engagements")
      .select("id,submission_date")
      .in("id", wonIds);
    for (const we of wonEngs ?? []) {
      if (!we.submission_date) continue;
      const sub = new Date(we.submission_date).getTime();
      const { data: snaps } = await supabase
        .from("snapshots")
        .select("snapshot_date,temperature_score")
        .eq("engagement_id", we.id);
      const find = (daysOut: number) => {
        const target = sub - daysOut * 86400000;
        let best: any = null;
        for (const s of snaps ?? []) {
          const sd = new Date(s.snapshot_date).getTime();
          if (!best || Math.abs(sd - target) < Math.abs(new Date(best.snapshot_date).getTime() - target)) best = s;
        }
        return best?.temperature_score ?? null;
      };
      const v30 = find(30), v14 = find(14), v7 = find(7);
      if (v30 != null && v14 != null && v7 != null) {
        benchmark30 += v30; benchmark14 += v14; benchmark7 += v7; benchN++;
      }
    }
  }
  if (benchN > 0) {
    benchmark30 /= benchN; benchmark14 /= benchN; benchmark7 /= benchN;
    for (const eng of activeEngagements) {
      if (!eng.submission_date) continue;
      const days = Math.ceil((new Date(eng.submission_date).getTime() - Date.now()) / 86400000);
      let bench = null, label = "";
      if (days >= 5 && days <= 10) { bench = benchmark7; label = "7d"; }
      else if (days >= 12 && days <= 17) { bench = benchmark14; label = "14d"; }
      else if (days >= 25 && days <= 35) { bench = benchmark30; label = "30d"; }
      if (bench == null) continue;
      const { data: latest } = await supabase
        .from("snapshots")
        .select("temperature_score")
        .eq("engagement_id", eng.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) continue;
      const gap = bench - latest.temperature_score;
      if (gap > 12) {
        if (await recentSimilarExists(eng.id, "below_win_curve")) continue;
        insightsToInsert.push({
          engagement_id: eng.id,
          insight_type: "below_win_curve",
          title: `${gap.toFixed(0)} pts below win-curve at ${label}`,
          body: `At ${label} from submission, won engagements averaged ${bench.toFixed(0)}. This engagement is at ${latest.temperature_score}. The gap (${gap.toFixed(0)} pts) is meaningful; review what historical winners did differently at this stage.`,
          severity: gap > 20 ? "critical" : "warning",
          confidence_score: confidenceFor("below_win_curve"),
          supporting_data: { benchmark: bench, actual: latest.temperature_score, gap, label },
        });
        counts.below_win_curve++;
      }
    }
  }

  // -----------------------------------------------
  // Analysis 6: capacity_warning
  // -----------------------------------------------
  const { data: assignments } = await supabase
    .from("section_assignments")
    .select("user_id,engagement_id,status")
    .in("status", ["Not Started", "In Progress"]);
  const byUser = new Map<string, { engs: Set<string>; total: number }>();
  for (const a of assignments ?? []) {
    if (!a.user_id) continue;
    const e = byUser.get(a.user_id) ?? { engs: new Set<string>(), total: 0 };
    e.engs.add(a.engagement_id);
    e.total++;
    byUser.set(a.user_id, e);
  }
  const activeIds = new Set(activeEngagements.map((e: any) => e.id));
  for (const [userId, info] of byUser) {
    if (info.total < 5 || info.engs.size < 2) continue;
    // only count if any of their engs is within 21 days
    const relevantEngs = activeEngagements.filter((e: any) =>
      info.engs.has(e.id) && e.submission_date &&
      Math.ceil((new Date(e.submission_date).getTime() - Date.now()) / 86400000) <= 21
    );
    if (relevantEngs.length === 0) continue;
    const { data: member } = await supabase
      .from("engagement_members")
      .select("display_name")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    for (const eng of relevantEngs) {
      if (!activeIds.has(eng.id)) continue;
      if (await recentSimilarExists(eng.id, "capacity_warning")) continue;
      insightsToInsert.push({
        engagement_id: eng.id,
        insight_type: "capacity_warning",
        title: `${member?.display_name ?? "A writer"} is overloaded`,
        body: `${member?.display_name ?? "This contributor"} has ${info.total} incomplete sections across ${info.engs.size} active engagements within 21 days of submission. Capacity risk.`,
        severity: "warning",
        confidence_score: confidenceFor("capacity_warning"),
        supporting_data: { user_id: userId, total_sections: info.total, engagements: info.engs.size },
      });
      counts.capacity_warning++;
    }
  }

  // -----------------------------------------------
  // Insert
  // -----------------------------------------------
  if (insightsToInsert.length > 0) {
    const { error: insErr } = await supabase.from("intelligence_insights").insert(insightsToInsert);
    if (insErr) console.error("insight insert error", insErr);
  }

  for (const eng of activeEngagements.slice(0, 1)) {
    await supabase.from("activity_log").insert({
      engagement_id: eng.id,
      user_id: null,
      actor_name: "Athena",
      action: "intelligence_engine_run",
      metadata: { counts, generated: insightsToInsert.length },
    });
  }

  return Response.json({ generated: insightsToInsert.length, counts });
}
