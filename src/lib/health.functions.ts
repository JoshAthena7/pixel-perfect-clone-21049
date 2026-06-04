// Lead Health Dashboard — aggregates pulses, mock scores, activity, gate proximity
// into a composite health view for a single mission.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuestionHealth = {
  questionId: string;
  questionNumber: string | null;
  title: string;
  section: string;
  writerId: string | null;
  pensDownDate: string | null;
  daysToGate: number | null;
  latestMockScore: number | null;
  latestMockStage: string | null;
  latestPulseConfidence: number | null;
  latestPulseProgress: number | null;
  blocked: boolean;
  lastPulseAt: string | null;
  lastActivityAt: string | null;
  daysSinceActivity: number | null;
  composite: number;
  status: "green" | "yellow" | "red" | "critical";
};

export type SectionHealth = {
  section: string;
  questions: QuestionHealth[];
  composite: number;
  status: "green" | "yellow" | "red" | "critical";
};

export type WriterHealth = {
  writerId: string;
  displayName: string;
  questionCount: number;
  composite: number;
  status: "green" | "yellow" | "red" | "critical";
  lastSeenAt: string | null;
  flags: number;
};

export type MissionLite = { id: string; name: string; client: string | null };

export type HealthOverview = {
  mission: MissionLite | null;
  sections: SectionHealth[];
  writers: WriterHealth[];
  activityMap: { sectionLabels: string[]; days: string[]; counts: number[][] };
  flagCount: number;
};

function sectionFromQuestionNumber(qn: string | null): string {
  if (!qn) return "Unsectioned";
  const head = qn.split(/[.\s-]/)[0];
  return head ? `Section ${head}` : "Unsectioned";
}

function statusFromScore(score: number): "green" | "yellow" | "red" | "critical" {
  if (score < 40) return "critical";
  if (score < 60) return "red";
  if (score < 80) return "yellow";
  return "green";
}

export const listLeadMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MissionLite[]> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data } = await supabase
      .from("mission_members")
      .select("mission_id, role, missions!inner(id,name,client,status)")
      .eq("user_id", userId)
      .in("role", ["admin", "lead"]);
    const seen = new Set<string>();
    const out: MissionLite[] = [];
    for (const row of (data ?? []) as Array<{ missions: { id: string; name: string; client: string | null; status: string | null } }>) {
      if (!row.missions || seen.has(row.missions.id)) continue;
      seen.add(row.missions.id);
      out.push({ id: row.missions.id, name: row.missions.name, client: row.missions.client });
    }
    return out;
  });

export const getMissionHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<HealthOverview> => {
    const { supabase } = context as { supabase: any };
    const missionId = data.missionId;

    const [missionRes, qRes, pulseRes, scoreRes, flagRes, membersRes, signalRes] = await Promise.all([
      supabase.from("missions").select("id,name,client").eq("id", missionId).maybeSingle(),
      supabase.from("question_records")
        .select("id,question_number,title,assigned_writer_id,pens_down_date,status,current_score,health")
        .eq("mission_id", missionId),
      supabase.from("question_pulses")
        .select("question_id,writer_auth_user_id,progress,confidence,blocked,submitted_at,hedging_score")
        .eq("mission_id", missionId)
        .order("submitted_at", { ascending: false })
        .limit(500),
      supabase.from("mock_scores")
        .select("question_id,section_name,stage,score,scored_at")
        .eq("mission_id", missionId)
        .order("scored_at", { ascending: false })
        .limit(500),
      supabase.from("iris_health_flags")
        .select("subject_writer_id,question_id,severity,status")
        .eq("mission_id", missionId)
        .eq("status", "open"),
      supabase.from("mission_members")
        .select("user_id,role,display_name")
        .eq("mission_id", missionId),
      supabase.from("signals")
        .select("related_question_id,created_at,user_id")
        .eq("mission_id", missionId)
        .gte("created_at", new Date(Date.now() - 21 * 86400000).toISOString())
        .limit(2000),
    ]);

    const mission = missionRes.data as MissionLite | null;
    const questions = (qRes.data ?? []) as Array<{
      id: string; question_number: string | null; title: string;
      assigned_writer_id: string | null; pens_down_date: string | null;
      status: string | null; current_score: number | null; health: string | null;
    }>;
    const pulses = (pulseRes.data ?? []) as Array<{
      question_id: string | null; writer_auth_user_id: string; progress: number;
      confidence: number; blocked: boolean; submitted_at: string; hedging_score: number;
    }>;
    const scores = (scoreRes.data ?? []) as Array<{
      question_id: string | null; section_name: string | null; stage: string; score: number; scored_at: string;
    }>;
    const flags = (flagRes.data ?? []) as Array<{
      subject_writer_id: string | null; question_id: string | null; severity: string; status: string;
    }>;
    const members = (membersRes.data ?? []) as Array<{ user_id: string; role: string; display_name: string | null }>;
    const signals = (signalRes.data ?? []) as Array<{ related_question_id: string | null; created_at: string; user_id: string | null }>;

    // Latest pulse per question
    const latestPulse = new Map<string, typeof pulses[number]>();
    for (const p of pulses) {
      if (p.question_id && !latestPulse.has(p.question_id)) latestPulse.set(p.question_id, p);
    }
    // Latest mock per question
    const latestScore = new Map<string, typeof scores[number]>();
    for (const s of scores) {
      if (s.question_id && !latestScore.has(s.question_id)) latestScore.set(s.question_id, s);
    }
    // Last activity (signal) per question
    const lastActivity = new Map<string, string>();
    for (const s of signals) {
      if (!s.related_question_id) continue;
      const prev = lastActivity.get(s.related_question_id);
      if (!prev || s.created_at > prev) lastActivity.set(s.related_question_id, s.created_at);
    }

    const now = Date.now();
    const memberNames = new Map(members.map((m) => [m.user_id, m.display_name ?? "Unknown"]));

    const qHealth: QuestionHealth[] = questions.map((q) => {
      const p = q.id ? latestPulse.get(q.id) : undefined;
      const s = q.id ? latestScore.get(q.id) : undefined;
      const activityAt = q.id ? lastActivity.get(q.id) ?? null : null;

      const daysToGate = q.pens_down_date
        ? Math.round((new Date(q.pens_down_date).getTime() - now) / 86400000)
        : null;
      const daysSinceActivity = activityAt
        ? Math.round((now - new Date(activityAt).getTime()) / 86400000)
        : null;

      // Composite (40/25/20/15) with redistribution when mock is missing.
      const hasMock = s != null;
      const wMock = hasMock ? 0.4 : 0;
      const wGate = hasMock ? 0.25 : 0.35;
      const wPulse = hasMock ? 0.2 : 0.3;
      const wAct = hasMock ? 0.15 : 0.35;

      const mockNorm = hasMock ? Number(s!.score) : 0;
      // Gate score: more days = higher. <0 days = 0; >=30 days = 100.
      const gateNorm = daysToGate == null ? 70 : Math.max(0, Math.min(100, ((daysToGate + 5) / 30) * 100));
      const pulseNorm = p ? Math.max(0, Math.min(100, ((p.confidence - 1) / 4) * 100 - p.hedging_score * 5)) : 60;
      const actNorm = daysSinceActivity == null
        ? 50
        : Math.max(0, 100 - daysSinceActivity * 15);

      let composite = Math.round(mockNorm * wMock + gateNorm * wGate + pulseNorm * wPulse + actNorm * wAct);

      // Override conditions
      let status = statusFromScore(composite);
      if (hasMock && s!.score < 55) status = "critical";
      if (daysSinceActivity != null && daysSinceActivity >= 5 && daysToGate != null && daysToGate <= 21) status = "red";
      if (p?.blocked) status = status === "critical" ? "critical" : "red";
      if (status === "critical") composite = Math.min(composite, 40);

      return {
        questionId: q.id,
        questionNumber: q.question_number,
        title: q.title,
        section: sectionFromQuestionNumber(q.question_number),
        writerId: q.assigned_writer_id,
        pensDownDate: q.pens_down_date,
        daysToGate,
        latestMockScore: s ? Number(s.score) : null,
        latestMockStage: s?.stage ?? null,
        latestPulseConfidence: p?.confidence ?? null,
        latestPulseProgress: p?.progress ?? null,
        blocked: !!p?.blocked,
        lastPulseAt: p?.submitted_at ?? null,
        lastActivityAt: activityAt,
        daysSinceActivity,
        composite,
        status,
      };
    });

    // Sections
    const sectionMap = new Map<string, QuestionHealth[]>();
    for (const q of qHealth) {
      const arr = sectionMap.get(q.section) ?? [];
      arr.push(q);
      sectionMap.set(q.section, arr);
    }
    const sections: SectionHealth[] = Array.from(sectionMap.entries()).map(([name, qs]) => {
      const avg = Math.round(qs.reduce((a, q) => a + q.composite, 0) / qs.length);
      const worst: SectionHealth["status"] = qs.some((q) => q.status === "critical") ? "critical"
        : qs.some((q) => q.status === "red") ? "red"
        : qs.some((q) => q.status === "yellow") ? "yellow" : "green";
      return { section: name, questions: qs.sort((a, b) => a.composite - b.composite), composite: avg, status: worst };
    }).sort((a, b) => a.composite - b.composite);

    // Writers
    const writerAgg = new Map<string, { sum: number; n: number; lastSeen: string | null; flags: number }>();
    for (const q of qHealth) {
      if (!q.writerId) continue;
      const cur = writerAgg.get(q.writerId) ?? { sum: 0, n: 0, lastSeen: null, flags: 0 };
      cur.sum += q.composite;
      cur.n += 1;
      if (q.lastActivityAt && (!cur.lastSeen || q.lastActivityAt > cur.lastSeen)) cur.lastSeen = q.lastActivityAt;
      writerAgg.set(q.writerId, cur);
    }
    for (const f of flags) {
      if (!f.subject_writer_id) continue;
      const cur = writerAgg.get(f.subject_writer_id);
      if (cur) cur.flags += 1;
    }
    const writers: WriterHealth[] = Array.from(writerAgg.entries()).map(([id, v]) => {
      const composite = Math.round(v.sum / v.n);
      return {
        writerId: id,
        displayName: memberNames.get(id) ?? "Unknown",
        questionCount: v.n,
        composite,
        status: statusFromScore(composite),
        lastSeenAt: v.lastSeen,
        flags: v.flags,
      };
    }).sort((a, b) => a.composite - b.composite);

    // 14-day activity heatmap per section
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }
    const sectionLabels = sections.map((s) => s.section);
    const counts: number[][] = sectionLabels.map(() => days.map(() => 0));
    const qIdToSectionIdx = new Map<string, number>();
    sections.forEach((sec, idx) => sec.questions.forEach((q) => qIdToSectionIdx.set(q.questionId, idx)));
    for (const sig of signals) {
      if (!sig.related_question_id) continue;
      const idx = qIdToSectionIdx.get(sig.related_question_id);
      if (idx == null) continue;
      const dayKey = sig.created_at.slice(0, 10);
      const dayIdx = days.indexOf(dayKey);
      if (dayIdx >= 0) counts[idx][dayIdx] += 1;
    }

    return {
      mission,
      sections,
      writers,
      activityMap: { sectionLabels, days, counts },
      flagCount: flags.length,
    };
  });
