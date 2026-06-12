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
    const [missionRes, teamRes] = await Promise.all([
      supabase.from("missions").select("*").eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", data.missionId),
    ]);
    const mission = missionRes.data;
    const team = teamRes.data ?? [];
    const leadRow = team.find((t: any) => t.mission_role === "engagement_lead" || t.mission_role === "lead");
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
      whyMattersToAthena: ws?.mission_significance ?? null,
      whatIsAtStake: ws?.value_proposition ?? null,
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
    const { supabase } = context as Ctx;
    const [risksRes, qRiskRes, feedRes, sosRes] = await Promise.all([
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
        .from("intelligence_feed_items")
        .select("id,headline,iris_assessment,recommended_action,published_at")
        .eq("mission_id", data.missionId)
        .not("recommended_action", "is", null)
        .order("published_at", { ascending: false })
        .limit(5),
      supabase
        .from("reality_updates")
        .select("id,details,user_name,created_at")
        .eq("mission_id", data.missionId)
        .eq("signal_type", "sos")
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
    ]);

    type Risk = { id: string; level: "HIGH" | "WATCH"; title: string; description: string; createdAt: string };
    const items: Risk[] = [];
    for (const r of risksRes.data ?? []) {
      items.push({
        id: r.id,
        level: r.severity === "high" || r.severity === "critical" ? "HIGH" : "WATCH",
        title: r.title,
        description: r.description ?? "",
        createdAt: r.created_at,
      });
    }
    for (const q of qRiskRes.data ?? []) {
      items.push({
        id: `q-${q.id}`,
        level: q.health_status === "at_risk" ? "HIGH" : "WATCH",
        title: `Q${q.question_number ?? ""} — ${String(q.question_text ?? "").slice(0, 100)}`,
        description: q.health_status === "at_risk" ? "Flagged at risk." : "On watch list.",
        createdAt: new Date().toISOString(),
      });
    }
    for (const f of feedRes.data ?? []) {
      items.push({
        id: `f-${f.id}`,
        level: "WATCH",
        title: f.headline,
        description: f.recommended_action ?? f.iris_assessment ?? "",
        createdAt: f.published_at ?? new Date().toISOString(),
      });
    }
    for (const s of sosRes.data ?? []) {
      items.push({
        id: `s-${s.id}`,
        level: "HIGH",
        title: `SOS — ${s.user_name ?? "Team member"}`,
        description: s.details ?? "",
        createdAt: s.created_at,
      });
    }

    items.sort((a, b) => {
      if (a.level !== b.level) return a.level === "HIGH" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return { items };
  });

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
    const order = ["rfp", "amendment", "qa", "compliance", "style"];
    const groups: Record<string, any[]> = {};
    for (const d of docs ?? []) {
      const key = d.is_amendment ? "amendment" : (d.document_type || "other");
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
