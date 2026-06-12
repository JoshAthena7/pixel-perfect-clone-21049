import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MissionIdInput = z.object({ missionId: z.string().uuid() });

type Ctx = { supabase: any; userId: string };

// ============================================================
// Health computation — shared helper
// ============================================================
function computeHealth(args: {
  atRiskCount: number;
  blockedCount: number;
  daysToDeadline: number | null;
  unassignedSections: number;
}): "green" | "amber" | "red" {
  const { atRiskCount, blockedCount, daysToDeadline, unassignedSections } = args;
  if (blockedCount > 0) return "red";
  if (atRiskCount > 5) return "red";
  if (daysToDeadline !== null && daysToDeadline < 14) return "red";
  if (atRiskCount >= 1) return "amber";
  if (daysToDeadline !== null && daysToDeadline < 30) return "amber";
  if (unassignedSections > 0) return "amber";
  return "green";
}

function daysBetween(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ============================================================
// 1. Header — mission core + health
// ============================================================
export const getBriefingHeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [missionRes, questionsRes, sectionsRes, assignmentsRes] = await Promise.all([
      supabase.from("missions").select("id,name,client_name,submission_deadline,state,agency_name").eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_questions").select("id,health_status,status").eq("mission_id", data.missionId).eq("is_withdrawn", false),
      supabase.from("mission_sections").select("id").eq("mission_id", data.missionId),
      supabase.from("mission_assignments").select("question_id").eq("mission_id", data.missionId),
    ]);
    const mission = missionRes.data;
    if (!mission) throw new Error("Mission not found");
    const questions = questionsRes.data ?? [];
    const sections = sectionsRes.data ?? [];
    const assignedQuestionIds = new Set((assignmentsRes.data ?? []).map((a: any) => a.question_id));
    const atRiskCount = questions.filter((q: any) => q.health_status === "at_risk").length;
    const blockedCount = questions.filter((q: any) => q.status === "blocked").length;
    const unassignedSections = sections.length > 0 && assignedQuestionIds.size === 0 ? sections.length : 0;
    const daysToDeadline = daysBetween(mission.submission_deadline);
    const health = computeHealth({ atRiskCount, blockedCount, daysToDeadline, unassignedSections });
    return {
      mission,
      health,
      atRiskCount,
      blockedCount,
      daysToDeadline,
    };
  });

// ============================================================
// 2. Snapshot
// ============================================================
export const getSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [missionRes, teamRes, conflictsRes] = await Promise.all([
      supabase.from("missions").select("*").eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", data.missionId),
      supabase
        .from("conflict_flags")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.missionId)
        .eq("resolved", false),
    ]);
    const mission = missionRes.data;
    const team = teamRes.data ?? [];
    const leadRow =
      team.find((t: any) => t.mission_role === "engagement_lead") ??
      team.find((t: any) => t.mission_role === "lead") ??
      team.find((t: any) => t.mission_role === "admin");
    let leadName: string | null = null;
    if (leadRow) {
      const { data: lead } = await supabase
        .from("atlas_team_members")
        .select("display_name,full_name,email")
        .eq("id", leadRow.member_id)
        .maybeSingle();
      leadName = lead?.display_name || lead?.full_name || lead?.email || null;
    }
    const writers = team.filter((t: any) => t.mission_role === "writer").length;
    const smes = team.filter((t: any) => t.mission_role === "sme" || t.mission_role === "athena_sme" || t.mission_role === "client_sme").length;
    return {
      mission,
      leadName,
      writers,
      smes,
      daysToDeadline: daysBetween(mission?.submission_deadline),
      openConflicts: conflictsRes.count ?? 0,
    };
  });


// ============================================================
// 3. Why This Mission Matters
// ============================================================
export const getWhyMatters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: ws } = await supabase
      .from("mission_win_strategy")
      .select("mission_significance,value_proposition,executive_summary,known_risks,client_priorities")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    return {
      whyClientPursuing: ws?.client_priorities ?? null,
      whyMattersToAthena: ws?.value_proposition ?? null,
      whatIsAtStake: ws?.mission_significance ?? null,
      keyMarketDynamics: ws?.executive_summary ?? null,
    };
  });

// ============================================================
// 4. North Star
// ============================================================
export const getNorthStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [wsRes, stakeholdersRes] = await Promise.all([
      supabase
        .from("mission_win_strategy")
        .select("central_claim,win_themes,evaluator_priorities,evaluator_hot_buttons,known_risks")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
      supabase
        .from("stakeholder_profiles")
        .select("name,title,public_priorities")
        .eq("mission_id", data.missionId)
        .eq("stakeholder_type", "evaluator")
        .order("iris_confidence", { ascending: false })
        .limit(5),
    ]);
    const ws = wsRes.data ?? {};
    return {
      centralClaim: ws.central_claim ?? null,
      winThemes: Array.isArray(ws.win_themes) ? ws.win_themes : [],
      evaluatorPriorities: Array.isArray(ws.evaluator_priorities) ? ws.evaluator_priorities : [],
      evaluatorHotButtons: Array.isArray(ws.evaluator_hot_buttons) ? ws.evaluator_hot_buttons : [],
      thingsToAvoid: Array.isArray(ws.known_risks) ? ws.known_risks : [],
      evaluators: stakeholdersRes.data ?? [],
    };
  });

// ============================================================
// 5. Intelligence (Oracle)
// ============================================================
export const getIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [stakeholdersRes, incumbentRes, competitorsRes, policyRes, regulatoryRes, recentRes, politicalRes] = await Promise.all([
      supabase
        .from("stakeholder_profiles")
        .select("name,title,organization,public_priorities,known_concerns,iris_confidence")
        .eq("mission_id", data.missionId)
        .order("iris_confidence", { ascending: false })
        .limit(4),
      supabase
        .from("competitor_profiles")
        .select("organization_name,known_weaknesses,likely_narrative")
        .eq("mission_id", data.missionId)
        .eq("competitor_type", "incumbent")
        .maybeSingle(),
      supabase
        .from("competitor_profiles")
        .select("organization_name,likely_narrative,known_strengths")
        .eq("mission_id", data.missionId)
        .neq("competitor_type", "incumbent")
        .limit(3),
      supabase
        .from("intelligence_graph_nodes")
        .select("label,description,created_at")
        .eq("mission_id", data.missionId)
        .in("node_type", ["policy", "political"])
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("intelligence_graph_nodes")
        .select("label,description,created_at")
        .eq("mission_id", data.missionId)
        .in("node_type", ["regulatory", "compliance"])
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("intelligence_feed_items")
        .select("headline,iris_assessment,published_at,source_name")
        .eq("mission_id", data.missionId)
        .gte("iris_relevance_score", 70)
        .order("published_at", { ascending: false })
        .limit(3),
      supabase
        .from("intelligence_feed_items")
        .select("headline,iris_assessment,published_at")
        .eq("mission_id", data.missionId)
        .eq("category", "political")
        .order("published_at", { ascending: false })
        .limit(2),
    ]);
    return {
      stakeholders: stakeholdersRes.data ?? [],
      incumbent: incumbentRes.data ?? null,
      competitors: competitorsRes.data ?? [],
      policyNodes: policyRes.data ?? [],
      regulatoryNodes: regulatoryRes.data ?? [],
      recentFeeds: recentRes.data ?? [],
      politicalFeeds: politicalRes.data ?? [],
    };
  });

// ============================================================
// 6. Client Story
// ============================================================
export const getClientStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: ws } = await supabase
      .from("mission_win_strategy")
      .select("discriminators,proof_points,client_priorities,executive_summary,value_proposition")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);
    return {
      strengths: asArray(ws?.client_priorities),
      differentiators: asArray(ws?.discriminators),
      proofPoints: asArray(ws?.proof_points),
      successStory: ws?.executive_summary ?? null,
    };
  });

// ============================================================
// 7. Mission Map
// ============================================================
export const getMissionMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [sectionsRes, questionsRes, assignmentsRes, qaRes] = await Promise.all([
      supabase
        .from("mission_sections")
        .select("id,name,section_number,order_index")
        .eq("mission_id", data.missionId)
        .order("order_index", { ascending: true }),
      supabase
        .from("mission_questions")
        .select("id,section_id,question_number,question_text,status,health_status,iris_confidence")
        .eq("mission_id", data.missionId)
        .eq("is_withdrawn", false),
      supabase
        .from("mission_assignments")
        .select("question_id,assigned_writer_id")
        .eq("mission_id", data.missionId),
      supabase
        .from("question_assignments")
        .select("question_id,writer_name,athena_sme_name,client_sme_name")
        .eq("mission_id", data.missionId),
    ]);

    const writerIds = Array.from(
      new Set((assignmentsRes.data ?? []).map((a: any) => a.assigned_writer_id).filter(Boolean)),
    );
    let writerNames: Record<string, string> = {};
    if (writerIds.length > 0) {
      const { data: writers } = await supabase
        .from("atlas_team_members")
        .select("id,display_name,full_name,email")
        .in("id", writerIds);
      for (const w of writers ?? []) {
        writerNames[w.id] = w.display_name || w.full_name || w.email || "Writer";
      }
    }

    const assignmentByQ: Record<string, any> = {};
    for (const a of assignmentsRes.data ?? []) assignmentByQ[a.question_id] = a;
    const qaByQ: Record<string, any> = {};
    for (const a of qaRes.data ?? []) qaByQ[a.question_id] = a;

    const mapQ = (q: any) => {
      const a = assignmentByQ[q.id];
      const qa = qaByQ[q.id];
      const writer = a?.assigned_writer_id ? writerNames[a.assigned_writer_id] : qa?.writer_name ?? null;
      const sme = qa?.athena_sme_name ?? qa?.client_sme_name ?? null;
      return {
        id: q.id,
        number: q.question_number,
        text: q.question_text,
        status: q.status,
        health: q.health_status,
        confidence: q.iris_confidence,
        writer,
        sme,
      };
    };

    const allQs = questionsRes.data ?? [];
    const sortQs = (qs: any[]) =>
      qs.sort((a: any, b: any) => String(a.question_number ?? "").localeCompare(String(b.question_number ?? "")));

    const sections = (sectionsRes.data ?? [])
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        number: s.section_number,
        questions: sortQs(allQs.filter((q: any) => q.section_id === s.id)).map(mapQ),
      }))
      // hide sections with no questions when there is nothing to show
      .filter((s: any) => s.questions.length > 0);

    const unassigned = sortQs(allQs.filter((q: any) => !q.section_id)).map(mapQ);
    if (unassigned.length > 0) {
      sections.push({ id: "__unassigned__", name: "Unassigned", number: null, questions: unassigned });
    }

    return {
      sections,
      totals: {
        total: allQs.length,
        complete: allQs.filter((q: any) => q.status === "complete").length,
        inProgress: allQs.filter((q: any) => q.status === "in_progress").length,
        notStarted: allQs.filter((q: any) => q.status === "not_started" || !q.status).length,
        atRisk: allQs.filter((q: any) => q.health_status === "at_risk").length,
      },
    };
  });

// ============================================================
// 8. Risks & Watch Items
// ============================================================
export const getRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx & { userId: string };
    const [risksRes, qRiskRes, sosRes, conflictsRes, isAdminRes, teamRoleRes] = await Promise.all([
      supabase
        .from("mission_risks")
        .select("id,title,description,severity,status,created_at")
        .eq("mission_id", data.missionId)
        .neq("status", "resolved")
        .order("created_at", { ascending: false }),
      supabase
        .from("mission_questions")
        .select("id,question_number,question_text,health_status")
        .eq("mission_id", data.missionId)
        .in("health_status", ["at_risk", "watch"]),
      supabase
        .from("reality_updates")
        .select("id,details,user_name,created_at")
        .eq("mission_id", data.missionId)
        .eq("signal_type", "sos")
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("conflict_flags")
        .select("id,conflict_description,detected_from,severity,created_at,question_id_a,question_id_b")
        .eq("mission_id", data.missionId)
        .eq("resolved", false)
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("mission_role,member_id")
        .eq("mission_id", data.missionId),
    ]);

    // Determine if user is admin or engagement_lead on this mission.
    const isAdmin = !!isAdminRes.data;
    let isEL = false;
    if (!isAdmin) {
      const memberIds = (teamRoleRes.data ?? [])
        .filter((t: any) => t.mission_role === "engagement_lead" || t.mission_role === "lead")
        .map((t: any) => t.member_id);
      if (memberIds.length) {
        const { data: me } = await supabase
          .from("atlas_team_members")
          .select("id")
          .in("id", memberIds)
          .eq("user_id", userId)
          .maybeSingle();
        isEL = !!me;
      }
    }
    const canResolve = isAdmin || isEL;

    type Risk = {
      id: string;
      level: "HIGH" | "WATCH";
      kind: "risk" | "question" | "sos" | "conflict";
      title: string;
      description: string;
      createdAt: string;
      conflictId?: string;
      detectedFrom?: string | null;
      canResolve?: boolean;
    };
    const items: Risk[] = [];
    for (const r of risksRes.data ?? []) {
      items.push({
        id: r.id,
        level: r.severity === "high" || r.severity === "critical" ? "HIGH" : "WATCH",
        kind: "risk",
        title: r.title,
        description: r.description ?? "",
        createdAt: r.created_at,
      });
    }
    for (const q of qRiskRes.data ?? []) {
      items.push({
        id: `q-${q.id}`,
        level: q.health_status === "at_risk" ? "HIGH" : "WATCH",
        kind: "question",
        title: `Q${q.question_number ?? ""} — ${String(q.question_text ?? "").slice(0, 100)}`,
        description: q.health_status === "at_risk" ? "Flagged at risk." : "On watch list.",
        createdAt: new Date().toISOString(),
      });
    }
    for (const s of sosRes.data ?? []) {
      items.push({
        id: `s-${s.id}`,
        level: "HIGH",
        kind: "sos",
        title: `SOS — ${s.user_name ?? "Team member"}`,
        description: s.details ?? "",
        createdAt: s.created_at,
      });
    }
    for (const c of conflictsRes.data ?? []) {
      const desc = String(c.conflict_description ?? "");
      const title = `Conflict: ${desc.length > 80 ? desc.slice(0, 80) + "..." : desc}`;
      items.push({
        id: `c-${c.id}`,
        level: "WATCH",
        kind: "conflict",
        title,
        description: desc,
        createdAt: c.created_at,
        conflictId: c.id,
        detectedFrom: c.detected_from ?? null,
        canResolve,
      });
    }

    items.sort((a, b) => {
      if (a.level !== b.level) return a.level === "HIGH" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return { items, canResolve };
  });

// (Conflict resolution moved to src/lib/iris-conflicts.functions.ts —
//  resolveConflict is the shared single source of truth used by both
//  the Briefing Room Risks section and Mission Activity.)





// ============================================================
// 9. Documents
// ============================================================
export const getDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: docs } = await supabase
      .from("mission_documents")
      .select("id,document_type,title,file_url,source_url,is_amendment,created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });

    // Infer group key from explicit type, amendment flag, or document title.
    function inferKey(d: any): string {
      if (d.is_amendment) return "amendment";
      const t = String(d.document_type ?? "").toLowerCase();
      if (t === "primary_rfp" || t === "rfp" || t === "amendment" || t === "qa" || t === "compliance" || t === "style") {
        return t === "primary_rfp" ? "rfp" : t;
      }
      const title = String(d.title ?? "").toLowerCase();
      if (/amendment/.test(title)) return "amendment";
      if (/style\s*guide/.test(title)) return "style";
      if (/\b(rfp|solicitation|bid|t1932)\b/.test(title)) return "rfp";
      if (/\b(canon|intel|research)\b/.test(title)) return "intelligence";
      if (/q\s*&\s*a|q\s*and\s*a|prior\s*q&a/.test(title)) return "qa";
      if (/compliance/.test(title)) return "compliance";
      return "other";
    }

    const order = ["rfp", "amendment", "qa", "compliance", "style", "intelligence", "other"];
    const groups: Record<string, any[]> = {};
    for (const d of docs ?? []) {
      const key = inferKey(d);
      (groups[key] ??= []).push(d);
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return { groups: sortedKeys.map((k) => ({ key: k, docs: groups[k] })) };
  });

// ============================================================
// 10. Signals
// ============================================================
export const getSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [realityRes, broadcastRes] = await Promise.all([
      supabase
        .from("reality_updates")
        .select("id,signal_type,details,user_name,created_at")
        .eq("mission_id", data.missionId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("broadcasts")
        .select("id,text,from_name,created_at")
        .eq("mission_id", data.missionId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    type Signal = { id: string; type: string; body: string; from: string | null; createdAt: string };
    const signals: Signal[] = [];
    for (const r of realityRes.data ?? []) {
      const typeMap: Record<string, string> = {
        sos: "sos",
        pulse: "daily_pulse",
        daily_pulse: "daily_pulse",
        pm_update: "pm_update",
        update_reality: "update_reality",
      };
      signals.push({
        id: r.id,
        type: typeMap[r.signal_type] ?? "update_reality",
        body: r.details ?? "",
        from: r.user_name ?? null,
        createdAt: r.created_at,
      });
    }
    for (const b of broadcastRes.data ?? []) {
      signals.push({
        id: b.id,
        type: "pm_update",
        body: b.text ?? "",
        from: b.from_name ?? null,
        createdAt: b.created_at,
      });
    }
    signals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { signals: signals.slice(0, 10) };
  });

// ============================================================
// 11. Timeline (read-only Journey summary)
// ============================================================
export const getTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [missionRes, phasesRes] = await Promise.all([
      supabase
        .from("missions")
        .select("submission_deadline")
        .eq("id", data.missionId)
        .maybeSingle(),
      supabase
        .from("mission_journey_phases")
        .select("id,name,kind,start_date,end_date,order_index,is_cleared")
        .eq("mission_id", data.missionId)
        .eq("is_cleared", false)
        .order("order_index", { ascending: true }),
    ]);
    const phases = (phasesRes.data ?? []).filter((p: any) => p.kind !== "milestone" ? true : true);
    const now = Date.now();
    const allPhases = phasesRes.data ?? [];
    const phaseRows = allPhases.filter((p: any) => p.kind === "phase");
    const current = phaseRows.find((p: any) => {
      const s = p.start_date ? new Date(p.start_date).getTime() : null;
      const e = p.end_date ? new Date(p.end_date).getTime() : null;
      return s != null && e != null && now >= s && now <= e;
    }) ?? null;

    // Phase rail: all phase-kind rows in order, with status.
    const rail = phaseRows.map((p: any) => {
      const s = p.start_date ? new Date(p.start_date).getTime() : null;
      const e = p.end_date ? new Date(p.end_date).getTime() : null;
      let status: "completed" | "current" | "upcoming" = "upcoming";
      if (e != null && e < now) status = "completed";
      else if (s != null && e != null && now >= s && now <= e) status = "current";
      return { id: p.id, name: p.name, status };
    });

    // Upcoming "milestones" = gates/pens_down/milestone-kind due within 7 days.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const milestones = (phasesRes.data ?? [])
      .filter((p: any) => p.kind === "gate" || p.kind === "milestone" || p.kind === "pens_down")
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        dueDate: p.end_date ?? p.start_date ?? null,
      }))
      .filter((m: any) => m.dueDate)
      .map((m: any) => {
        const due = new Date(m.dueDate).getTime();
        return { ...m, daysUntil: Math.ceil((due - now) / (1000 * 60 * 60 * 24)) };
      })
      .filter((m: any) => m.daysUntil <= 7)
      .sort((a: any, b: any) => a.daysUntil - b.daysUntil);

    return {
      currentPhase: current
        ? { name: current.name, startDate: current.start_date, endDate: current.end_date }
        : null,
      rail,
      milestones,
      submissionDeadline: missionRes.data?.submission_deadline ?? null,
    };
  });
