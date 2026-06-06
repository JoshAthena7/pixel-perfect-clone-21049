// Single source of truth for "what does IRIS know about this mission".
// Every IRIS function MUST call buildMissionContext() before generating output.
// Adding a new intelligence source = wire it in here once.
//
// Server-only. Do NOT import from client code.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSetupCompleteness,
  type SetupCompleteness,
} from "./iris-mission-context";

// ---------- Public types ----------

export type WinThemeCtx = {
  id: string;
  title: string;
  description: string | null;
  keyMessage: string | null;
  questionIds: string[];
  alignmentTarget: string | null;
};

export type OracleSectionCtx = {
  key: string;
  status: string;
  generatedAt: string | null;
  excerpt: string;
};

export type RiskCtx = {
  id: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: string | null;
};

export type SignalCtx = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  severity: string;
  confidence: number | null;
  recommendedAction: string | null;
};

export type DocumentCtx = {
  id: string;
  title: string;
  docType: string | null;
  description: string | null;
  hasExtractedText: boolean;
};

export type ClarificationCtx = {
  id: string;
  number: number;
  question: string;
  status: string;
  submittedAt: string | null;
};

export type RealityUpdateCtx = {
  id: string;
  questionId: string | null;
  signalType: string | null;
  needType: string | null;
  details: string | null;
  userName: string | null;
  createdAt: string;
};

export type PulseCtx = {
  id: string;
  questionId: string | null;
  progress: number | null;
  blocked: boolean | null;
  blockedReason: string | null;
  confidence: number | null;
  note: string | null;
  submittedAt: string | null;
};

export type ComplianceCtx = {
  id: string;
  citation: string;
  requirement: string;
  severity: string | null;
  isFederal: boolean | null;
  source: string;
};

export type CanonItemCtx = {
  id: string;
  topic: string;
  category: string | null;
  citation: string | null;
  content: string;
  priority: number | null;
};

export type EvaluationCriterionCtx = {
  category: string;
  points: number | null;
  competitiveRisk: string | null;
};

export type QuestionContextCtx = {
  id: string;
  number: string | null;
  title: string;
  rfpRequirement: string | null;
  requirements: string[];
  mandatoryLanguage: string[];
  scoringCriteria: string | null;
  pageLimit: number | null;
  wordLimit: number | null;
  assignedWriterId: string | null;
  assignedSmeId: string | null;
  dueDate: string | null;
  status: string | null;
  health: string | null;
  currentScore: number | null;
  currentFocus: string | null;
  nextStep: string | null;
  waitingOn: string | null;
  threadSummary: Array<{
    entryType: string;
    author: string | null;
    body: string;
    createdAt: string;
    resolved: boolean;
  }>;
  irisQuestionBrief: any | null;
  complianceRequirements: Array<{
    id: string;
    requirement: string;
    severity: string | null;
    isFederal: boolean | null;
  }>;
  priorScoreResults: Array<{
    id: string;
    createdAt: string;
    score: number | null;
    summary: string | null;
  }>;
};

export type MissionContext = {
  missionId: string;
  // From Setup Record
  missionName: string;
  clientName: string;
  issuingAgency: string | null;
  state: string | null;
  programType: string | null;
  submissionDate: string | null;
  contractValue: string | null;
  contractTerm: string | null;
  winStrategy: string | null;
  clientStrengths: string | null;
  programGoals: string | null;
  missionHighlights: string | null;
  keyRequirements: string[];
  incumbent: string | null;
  evaluationCriteria: EvaluationCriterionCtx[];
  populationServed: string | null;
  geographicScope: string | null;
  competitors: string[];
  priorityTopics: string[];

  // Win themes
  winThemes: WinThemeCtx[];
  legacyWinThemes: string[];

  // IRIS extracted intelligence
  oracleBriefingSections: OracleSectionCtx[];
  activeRisks: RiskCtx[];
  activeSignals: SignalCtx[];
  clientIntel: {
    politicalConsiderations: string | null;
    meetingCadence: string | null;
    notes: string | null;
    decisionMakers: any[];
    stakeholders: any[];
  } | null;

  // Documents and vault
  uploadedDocumentSummaries: DocumentCtx[];
  canonItems: CanonItemCtx[];

  // Compliance
  applicableComplianceItems: ComplianceCtx[];

  // Live mission state
  questionCount: number;
  assignedCount: number;
  unassignedCount: number;
  healthScore: { green: number; yellow: number; red: number };
  completenessScore: SetupCompleteness;
  openSosItems: SignalCtx[];
  openClientClarifications: ClarificationCtx[];
  recentWriterUpdates: RealityUpdateCtx[];
  recentPulses: PulseCtx[];

  // Expanded intelligence sources (No Data Left Behind)
  broadcasts: Array<{ id: string; fromName: string; text: string; createdAt: string }>;
  mockScores: Array<{ id: string; stage: string; score: number; sectionName: string | null; questionId: string | null; evaluatorNote: string | null; scoredAt: string }>;
  pendingExecDecisions: Array<{ id: string; description: string; urgency: string; status: string; createdAt: string }>;
  irisMemories: Array<{ id: string; title: string; summary: string | null; category: string; importance: string; scope: string }>;
  activeAssumptions: Array<{ id: string; assumption: string; confidence: number | null; status: string; riskIfWrong: string | null }>;
  recentDecisions: Array<{ id: string; title: string; status: string | null; owner: string | null; rationale: string | null; decidedAt: string | null }>;
  rfpAmendments: Array<{ id: string; summary: string | null; totalChanges: number; criticalChanges: number; analyzedAt: string | null; changes: Array<{ id: string; severity: string; description: string; writerAction: string | null; affectedSections: string[] }> }>;
  marketIntelligence: Array<{ id: string; type: string; title: string; summary: string | null; url: string | null; publishedAt: string | null }>;
  missionStrategyItems: Array<{ id: string; kind: string; label: string; notes: string | null }>;
  openHealthFlags: Array<{ id: string; kind: string; severity: string | null; rationale: string | null; questionId: string | null }>;
  missionSections: Array<{ id: string; number: string; title: string; status: string | null; progressPct: number | null; irisAlignmentPct: number | null; irisFlagged: boolean; assignedUserId: string | null; dueDate: string | null }>;
  recentResearch: Array<{ id: string; answer: string; confidence: string; generatedAt: string }>;
  missionTimeline: {
    questionDeadline: string | null;
    pinkTeam: string | null;
    redTeam: string | null;
    goldTeam: string | null;
    execReview: string | null;
    submission: string | null;
    orals: string | null;
    award: string | null;
  } | null;

  // Question-scoped (optional)
  question?: QuestionContextCtx;
};

// ---------- Loader ----------

type BuildOpts = {
  questionId?: string | null;
  // Hard cap per-section to keep prompts bounded.
  docLimit?: number;
  canonLimit?: number;
  complianceLimit?: number;
  oracleExcerptChars?: number;
};

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

export async function buildMissionContext(
  supabase: SupabaseClient,
  missionId: string,
  opts: BuildOpts = {},
): Promise<MissionContext> {
  const {
    questionId = null,
    docLimit = 20,
    canonLimit = 12,
    complianceLimit = 25,
    oracleExcerptChars = 700,
  } = opts;

  const since48h = new Date(Date.now() - FORTY_EIGHT_HOURS).toISOString();

  // Fan out reads. allSettled so a single failing table never breaks IRIS.
  const [
    missionR,
    evalR,
    winThemesR,
    oracleR,
    risksR,
    signalsR,
    sosR,
    clientIntelR,
    docsR,
    canonR,
    complianceR,
    questionsR,
    clarificationsR,
    realityR,
    pulsesR,
    broadcastsR,
    mockScoresR,
    execDecisionsR,
    irisMemoriesR,
    assumptionsR,
    decisionsR,
    amendmentsR,
    amendmentChangesR,
    marketIntelR,
    strategyR,
    healthFlagsR,
    sectionsR,
    researchR,
    timelineR,
  ] = await Promise.allSettled([
    supabase
      .from("missions")
      .select(
        "id,name,client,state,state_agency,submission_date,program_type,incumbent_name,contract_value,contract_term,mission_highlights,client_strengths,client_win_strategy,program_goals,key_requirements,win_themes,priority_topics,competitors,iris_setup_suggested_fields,iris_setup_autofill_status",
      )
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("mission_evaluation_criteria")
      .select("category,points,competitive_risk,display_order")
      .eq("mission_id", missionId)
      .order("display_order", { ascending: true }),
    supabase
      .from("win_themes")
      .select("id,title,description,key_message,question_ids,status")
      .eq("mission_id", missionId)
      .eq("status", "active"),
    supabase
      .from("briefing_book_sections")
      .select("section_key,content,status,generated_at")
      .eq("mission_id", missionId)
      .eq("status", "ready")
      .order("generated_at", { ascending: false }),
    supabase
      .from("mission_risks")
      .select("id,title,description,severity,status")
      .eq("mission_id", missionId)
      .in("status", ["Open", "Monitoring"])
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("signals")
      .select(
        "id,signal_type,signal_title,signal_summary,severity,confidence,recommended_action,source_module,status",
      )
      .eq("mission_id", missionId)
      .eq("status", "open")
      .neq("source_module", "sos")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("signals")
      .select(
        "id,signal_type,signal_title,signal_summary,severity,confidence,recommended_action,status",
      )
      .eq("mission_id", missionId)
      .eq("status", "open")
      .eq("source_module", "sos")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("mission_client_intel")
      .select(
        "political_considerations,meeting_cadence,notes,decision_makers,stakeholders",
      )
      .eq("mission_id", missionId)
      .maybeSingle(),
    supabase
      .from("mission_vault_documents")
      .select("id,title,doc_type,description,extracted_text,extraction_status")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(docLimit),
    supabase
      .from("intelligence_canon")
      .select("id,topic,category,citation,content,priority,is_active")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(canonLimit),
    supabase
      .from("compliance_requirements")
      .select(
        "id,section_reference,requirement_text,plain_language,severity,is_federal,source_document",
      )
      .eq("mission_id", missionId)
      .order("severity", { ascending: false })
      .limit(complianceLimit),
    supabase
      .from("question_records")
      .select("id,assigned_writer_id,health")
      .eq("mission_id", missionId),
    supabase
      .from("client_clarifications")
      .select("id,number,question,status,submitted_at")
      .eq("mission_id", missionId)
      .in("status", ["draft", "submitted"])
      .order("number", { ascending: false })
      .limit(15),
    supabase
      .from("reality_updates")
      .select(
        "id,question_id,signal_type,need_type,details,user_name,created_at,resolved",
      )
      .eq("mission_id", missionId)
      .eq("resolved", false)
      .gte("created_at", since48h)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("question_pulses")
      .select(
        "id,question_id,progress,blocked,blocked_reason,confidence,note,submitted_at",
      )
      .eq("mission_id", missionId)
      .gte("submitted_at", since48h)
      .order("submitted_at", { ascending: false })
      .limit(20),
    // ----- Expanded sources (No Data Left Behind) -----
    supabase
      .from("broadcasts")
      .select("id,from_name,text,created_at")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("mock_scores")
      .select("id,stage,score,section_name,question_id,evaluator_note,scored_at")
      .eq("mission_id", missionId)
      .order("scored_at", { ascending: false })
      .limit(8),
    supabase
      .from("executive_decisions")
      .select("id,description,urgency,status,created_at")
      .eq("mission_id", missionId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("iris_memories")
      .select("id,title,summary,category,importance,scope,mission_id")
      .or(`mission_id.eq.${missionId},and(scope.eq.global,importance.neq.reference)`)
      .is("archived_at", null)
      .order("importance", { ascending: true })
      .limit(10),
    supabase
      .from("mission_assumptions")
      .select("id,assumption,confidence_score,status,risk_if_wrong")
      .eq("mission_id", missionId)
      .eq("status", "active")
      .order("confidence_score", { ascending: true })
      .limit(10),
    supabase
      .from("mission_decisions")
      .select("id,title,status,owner,rationale,decided_at,created_at")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("rfp_amendments")
      .select("id,summary,total_changes,critical_changes,analyzed_at,status")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("amendment_changes")
      .select(
        "id,amendment_id,severity,description,writer_action_required,affected_sections,acknowledged",
      )
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("market_intelligence")
      .select("id,type,title,summary,url,published_at,created_at")
      .or(`mission_id.eq.${missionId},matched_mission_ids.cs.{${missionId}}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("mission_strategy")
      .select("id,kind,label,notes,sort_order")
      .eq("mission_id", missionId)
      .order("sort_order", { ascending: true })
      .limit(30),
    supabase
      .from("iris_health_flags")
      .select("id,kind,severity,rationale,question_id,resolved_at")
      .eq("mission_id", missionId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("mission_sections")
      .select(
        "id,number,title,studio_status,studio_progress_pct,iris_alignment_pct,iris_flagged,assigned_user_id,internal_due_date",
      )
      .eq("mission_id", missionId)
      .order("number", { ascending: true })
      .limit(50),
    supabase
      .from("research_results")
      .select("id,answer,confidence,generated_at")
      .eq("mission_id", missionId)
      .order("generated_at", { ascending: false })
      .limit(5),
    supabase
      .from("mission_timeline")
      .select(
        "question_deadline,pink_team,red_team,gold_team,exec_review,submission,orals,award",
      )
      .eq("mission_id", missionId)
      .maybeSingle(),
  ]);

  const mission = settled(missionR)?.data ?? null;
  const evaluationRaw = settled(evalR)?.data ?? [];
  const winThemesRaw = settled(winThemesR)?.data ?? [];
  const oracleRaw = settled(oracleR)?.data ?? [];
  const risksRaw = settled(risksR)?.data ?? [];
  const signalsRaw = settled(signalsR)?.data ?? [];
  const sosRaw = settled(sosR)?.data ?? [];
  const clientIntelRaw = settled(clientIntelR)?.data ?? null;
  const docsRaw = settled(docsR)?.data ?? [];
  const canonRaw = settled(canonR)?.data ?? [];
  const complianceRaw = settled(complianceR)?.data ?? [];
  const questionsRaw = settled(questionsR)?.data ?? [];
  const clarificationsRaw = settled(clarificationsR)?.data ?? [];
  const realityRaw = settled(realityR)?.data ?? [];
  const pulsesRaw = settled(pulsesR)?.data ?? [];
  const broadcastsRaw = settled(broadcastsR)?.data ?? [];
  const mockScoresRaw = settled(mockScoresR)?.data ?? [];
  const execDecisionsRaw = settled(execDecisionsR)?.data ?? [];
  const irisMemoriesRaw = settled(irisMemoriesR)?.data ?? [];
  const assumptionsRaw = settled(assumptionsR)?.data ?? [];
  const decisionsRaw = settled(decisionsR)?.data ?? [];
  const amendmentsRaw = settled(amendmentsR)?.data ?? [];
  const amendmentChangesRaw = settled(amendmentChangesR)?.data ?? [];
  const marketIntelRaw = settled(marketIntelR)?.data ?? [];
  const strategyRaw = settled(strategyR)?.data ?? [];
  const healthFlagsRaw = settled(healthFlagsR)?.data ?? [];
  const sectionsRaw = settled(sectionsR)?.data ?? [];
  const researchRaw = settled(researchR)?.data ?? [];
  const timelineRaw = settled(timelineR)?.data ?? null;

  const suggested = (mission?.iris_setup_suggested_fields ?? {}) as Record<
    string,
    any
  >;
  const populationServed =
    typeof suggested.population_served?.value === "string"
      ? suggested.population_served.value
      : null;
  const geographicScope =
    typeof suggested.geographic_scope?.value === "string"
      ? suggested.geographic_scope.value
      : null;

  const completeness = computeSetupCompleteness({
    mission,
    evaluationCount: evaluationRaw.length,
  });

  // Health bucket counts
  const health = { green: 0, yellow: 0, red: 0 };
  let assigned = 0;
  for (const q of questionsRaw as any[]) {
    if (q.assigned_writer_id) assigned++;
    if (q.health === "green") health.green++;
    else if (q.health === "yellow") health.yellow++;
    else if (q.health === "red") health.red++;
  }

  // Question-scoped context
  let question: QuestionContextCtx | undefined;
  if (questionId) {
    question = await loadQuestionContext(supabase, questionId);
  }

  return {
    missionId,
    missionName: mission?.name ?? "Unknown mission",
    clientName: mission?.client ?? "",
    issuingAgency: mission?.state_agency ?? null,
    state: mission?.state ?? null,
    programType: mission?.program_type ?? null,
    submissionDate: mission?.submission_date ?? null,
    contractValue: mission?.contract_value ?? null,
    contractTerm: mission?.contract_term ?? null,
    winStrategy: mission?.client_win_strategy ?? null,
    clientStrengths: mission?.client_strengths ?? null,
    programGoals: mission?.program_goals ?? null,
    missionHighlights: mission?.mission_highlights ?? null,
    keyRequirements: (mission?.key_requirements ?? []) as string[],
    incumbent: mission?.incumbent_name ?? null,
    evaluationCriteria: (evaluationRaw as any[]).map((e) => ({
      category: e.category,
      points: e.points ?? null,
      competitiveRisk: e.competitive_risk ?? null,
    })),
    populationServed,
    geographicScope,
    competitors: (mission?.competitors ?? []) as string[],
    priorityTopics: (mission?.priority_topics ?? []) as string[],

    winThemes: (winThemesRaw as any[]).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      keyMessage: t.key_message ?? null,
      questionIds: (t.question_ids ?? []) as string[],
      alignmentTarget: null,
    })),
    legacyWinThemes: (mission?.win_themes ?? []) as string[],

    oracleBriefingSections: (oracleRaw as any[]).map((s) => ({
      key: s.section_key,
      status: s.status,
      generatedAt: s.generated_at,
      excerpt: String(s.content ?? "").slice(0, oracleExcerptChars),
    })),
    activeRisks: (risksRaw as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      severity: r.severity ?? null,
      status: r.status ?? null,
    })),
    activeSignals: (signalsRaw as any[]).map((s) => ({
      id: s.id,
      type: s.signal_type,
      title: s.signal_title,
      summary: s.signal_summary ?? null,
      severity: s.severity,
      confidence: typeof s.confidence === "number" ? s.confidence : null,
      recommendedAction: s.recommended_action ?? null,
    })),
    clientIntel: clientIntelRaw
      ? {
          politicalConsiderations:
            (clientIntelRaw as any).political_considerations ?? null,
          meetingCadence: (clientIntelRaw as any).meeting_cadence ?? null,
          notes: (clientIntelRaw as any).notes ?? null,
          decisionMakers: ((clientIntelRaw as any).decision_makers ?? []) as any[],
          stakeholders: ((clientIntelRaw as any).stakeholders ?? []) as any[],
        }
      : null,

    uploadedDocumentSummaries: (docsRaw as any[]).map((d) => ({
      id: d.id,
      title: d.title,
      docType: d.doc_type ?? null,
      description: d.description ?? null,
      hasExtractedText:
        typeof d.extracted_text === "string" && d.extracted_text.length > 0,
    })),
    canonItems: (canonRaw as any[]).map((c) => ({
      id: c.id,
      topic: c.topic,
      category: c.category ?? null,
      citation: c.citation ?? null,
      content: String(c.content ?? "").slice(0, 500),
      priority: c.priority ?? null,
    })),

    applicableComplianceItems: (complianceRaw as any[]).map((c) => ({
      id: c.id,
      citation: c.section_reference ?? "",
      requirement:
        (c.plain_language && c.plain_language.length > 0
          ? c.plain_language
          : c.requirement_text) ?? "",
      severity: c.severity ?? null,
      isFederal: c.is_federal ?? null,
      source: c.source_document ?? "",
    })),

    questionCount: questionsRaw.length,
    assignedCount: assigned,
    unassignedCount: Math.max(0, questionsRaw.length - assigned),
    healthScore: health,
    completenessScore: completeness,
    openSosItems: (sosRaw as any[]).map((s) => ({
      id: s.id,
      type: s.signal_type,
      title: s.signal_title,
      summary: s.signal_summary ?? null,
      severity: s.severity,
      confidence: typeof s.confidence === "number" ? s.confidence : null,
      recommendedAction: s.recommended_action ?? null,
    })),
    openClientClarifications: (clarificationsRaw as any[]).map((c) => ({
      id: c.id,
      number: c.number,
      question: c.question,
      status: c.status,
      submittedAt: c.submitted_at,
    })),
    recentWriterUpdates: (realityRaw as any[]).map((r) => ({
      id: r.id,
      questionId: r.question_id,
      signalType: r.signal_type ?? null,
      needType: r.need_type ?? null,
      details: r.details ?? null,
      userName: r.user_name ?? null,
      createdAt: r.created_at,
    })),
    recentPulses: (pulsesRaw as any[]).map((p) => ({
      id: p.id,
      questionId: p.question_id,
      progress: p.progress ?? null,
      blocked: p.blocked ?? null,
      blockedReason: p.blocked_reason ?? null,
      confidence: p.confidence ?? null,
      note: p.note ?? null,
      submittedAt: p.submitted_at,
    })),

    question,
  };
}

async function loadQuestionContext(
  supabase: SupabaseClient,
  questionId: string,
): Promise<QuestionContextCtx | undefined> {
  const { data: q } = await supabase
    .from("question_records")
    .select(
      "id,mission_id,question_number,title,question_text,requirements,mandatory_language,scoring_criteria,page_limit,word_limit,assigned_writer_id,assigned_sme_id,pens_down_date,status,health,current_score,current_focus,next_step,waiting_on,iris_pre_brief",
    )
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return undefined;

  const [threadR, complianceR, scoresR] = await Promise.allSettled([
    supabase
      .from("question_collaboration")
      .select("entry_type,author_name,body,created_at,resolved")
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("compliance_requirements")
      .select("id,requirement_text,plain_language,severity,is_federal")
      .contains("relevant_question_ids", [questionId])
      .limit(15),
    supabase
      .from("score_me_history")
      .select("id,score,projected_score,full_analysis,created_at")
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const thread = settled(threadR)?.data ?? [];
  const comp = settled(complianceR)?.data ?? [];
  const scores = settled(scoresR)?.data ?? [];

  return {
    id: q.id as string,
    number: (q.question_number as string) ?? null,
    title: (q.title as string) ?? "",
    rfpRequirement: (q.question_text as string) ?? null,
    requirements: (q.requirements ?? []) as string[],
    mandatoryLanguage: (q.mandatory_language ?? []) as string[],
    scoringCriteria: (q.scoring_criteria as string) ?? null,
    pageLimit: (q.page_limit as number) ?? null,
    wordLimit: (q.word_limit as number) ?? null,
    assignedWriterId: (q.assigned_writer_id as string) ?? null,
    assignedSmeId: (q.assigned_sme_id as string) ?? null,
    dueDate: (q.pens_down_date as string) ?? null,
    status: (q.status as string) ?? null,
    health: (q.health as string) ?? null,
    currentScore: (q.current_score as number) ?? null,
    currentFocus: (q.current_focus as string) ?? null,
    nextStep: (q.next_step as string) ?? null,
    waitingOn: (q.waiting_on as string) ?? null,
    threadSummary: (thread as any[]).map((t) => ({
      entryType: t.entry_type,
      author: t.author_name ?? null,
      body: String(t.body ?? "").slice(0, 280),
      createdAt: t.created_at,
      resolved: !!t.resolved,
    })),
    irisQuestionBrief: q.iris_pre_brief ?? null,
    complianceRequirements: (comp as any[]).map((c) => ({
      id: c.id,
      requirement:
        (c.plain_language && c.plain_language.length > 0
          ? c.plain_language
          : c.requirement_text) ?? "",
      severity: c.severity ?? null,
      isFederal: c.is_federal ?? null,
    })),
    priorScoreResults: (scores as any[]).map((s) => {
      const analysis = (s.full_analysis ?? {}) as any;
      const note =
        typeof analysis?.iris_note === "string" ? analysis.iris_note : null;
      return {
        id: s.id,
        createdAt: s.created_at,
        score: typeof s.score === "number" ? s.score : null,
        summary: note,
      };
    }),
  };
}

function settled<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

// ---------- Formatter (strategic preamble injected into every IRIS prompt) ----------

function fmtStr(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0
    ? v.trim()
    : "(not yet provided)";
}
function fmtArr(v: unknown): string {
  return Array.isArray(v) && v.length > 0
    ? (v as any[]).map((x) => String(x)).join("; ")
    : "(not yet provided)";
}

export function formatMissionContextBlock(ctx: MissionContext): string {
  const evalLine =
    ctx.evaluationCriteria.length === 0
      ? "(not yet provided)"
      : ctx.evaluationCriteria
          .map(
            (e) =>
              `${e.category}${e.points ? ` (${e.points}pts)` : ""}${e.competitiveRisk ? ` [${e.competitiveRisk} risk]` : ""}`,
          )
          .join("; ");

  const winThemesLine =
    ctx.winThemes.length > 0
      ? ctx.winThemes
          .map((t) => `${t.title}${t.keyMessage ? ` — ${t.keyMessage}` : ""}`)
          .join(" | ")
      : ctx.legacyWinThemes.length > 0
        ? ctx.legacyWinThemes.join("; ")
        : "(not yet provided)";

  const lines: string[] = [];
  lines.push(`You are IRIS, the intelligence engine for ${fmtStr(ctx.missionName)}.`);
  lines.push("");
  lines.push("MISSION CONTEXT (from Setup Record):");
  lines.push(`- Client: ${fmtStr(ctx.clientName)} / ${fmtStr(ctx.issuingAgency)}`);
  lines.push(`- Win Strategy: ${fmtStr(ctx.winStrategy)}`);
  lines.push(`- Client Strengths: ${fmtStr(ctx.clientStrengths)}`);
  lines.push(`- Program Goals: ${fmtStr(ctx.programGoals)}`);
  lines.push(`- Mission Highlights: ${fmtStr(ctx.missionHighlights)}`);
  lines.push(`- Win Themes: ${winThemesLine}`);
  lines.push(`- Key Contract Requirements: ${fmtArr(ctx.keyRequirements)}`);
  lines.push(`- Incumbent: ${fmtStr(ctx.incumbent)}`);
  lines.push(`- Evaluation Criteria: ${evalLine}`);
  lines.push(`- Population Served: ${fmtStr(ctx.populationServed)}`);
  lines.push(`- Geographic Scope: ${fmtStr(ctx.geographicScope)}`);
  lines.push(`- Submission Date: ${fmtStr(ctx.submissionDate)}`);
  lines.push(
    `- Contract Value: ${fmtStr(ctx.contractValue)}${ctx.contractTerm ? ` over ${ctx.contractTerm}` : ""}`,
  );
  if (ctx.competitors.length > 0) lines.push(`- Known Competitors: ${ctx.competitors.join("; ")}`);

  // Intelligence layer
  if (ctx.oracleBriefingSections.length > 0) {
    lines.push("");
    lines.push("ORACLE BRIEFING (top sections):");
    for (const s of ctx.oracleBriefingSections.slice(0, 5)) {
      lines.push(`- ${s.key}: ${s.excerpt}`);
    }
  }
  if (ctx.activeRisks.length > 0) {
    lines.push("");
    lines.push("ACTIVE RISKS:");
    for (const r of ctx.activeRisks.slice(0, 8)) {
      lines.push(`- [${r.severity ?? "?"}] ${r.title}${r.description ? ` — ${r.description.slice(0, 160)}` : ""}`);
    }
  }
  if (ctx.activeSignals.length > 0) {
    lines.push("");
    lines.push("ACTIVE SIGNALS:");
    for (const s of ctx.activeSignals.slice(0, 8)) {
      lines.push(`- [${s.severity}] ${s.type}: ${s.title}${s.summary ? ` — ${s.summary.slice(0, 160)}` : ""}`);
    }
  }
  if (ctx.openSosItems.length > 0) {
    lines.push("");
    lines.push("OPEN SOS ITEMS:");
    for (const s of ctx.openSosItems) {
      lines.push(`- ${s.title}${s.summary ? `: ${s.summary.slice(0, 160)}` : ""}`);
    }
  }
  if (ctx.applicableComplianceItems.length > 0) {
    lines.push("");
    lines.push("COMPLIANCE REQUIREMENTS:");
    for (const c of ctx.applicableComplianceItems.slice(0, 8)) {
      lines.push(
        `- ${c.citation}${c.isFederal ? " (federal)" : ""}${c.severity ? ` [${c.severity}]` : ""}: ${c.requirement.slice(0, 200)}`,
      );
    }
  }
  if (ctx.canonItems.length > 0) {
    lines.push("");
    lines.push("APPROVED CANON (reusable language):");
    for (const c of ctx.canonItems.slice(0, 6)) {
      lines.push(`- ${c.topic}${c.citation ? ` (${c.citation})` : ""}: ${c.content.slice(0, 200)}`);
    }
  }
  if (ctx.uploadedDocumentSummaries.length > 0) {
    lines.push("");
    lines.push("UPLOADED DOCUMENTS:");
    for (const d of ctx.uploadedDocumentSummaries.slice(0, 10)) {
      lines.push(
        `- ${d.title}${d.docType ? ` [${d.docType}]` : ""}${d.description ? ` — ${d.description.slice(0, 120)}` : ""}${d.hasExtractedText ? "" : " (text not yet extracted)"}`,
      );
    }
  }
  if (ctx.clientIntel?.politicalConsiderations || ctx.clientIntel?.meetingCadence) {
    lines.push("");
    lines.push("CLIENT INTEL:");
    if (ctx.clientIntel.politicalConsiderations)
      lines.push(`- Political: ${ctx.clientIntel.politicalConsiderations.slice(0, 240)}`);
    if (ctx.clientIntel.meetingCadence)
      lines.push(`- Cadence: ${ctx.clientIntel.meetingCadence.slice(0, 200)}`);
  }

  // Live state
  lines.push("");
  lines.push("LIVE MISSION STATE:");
  lines.push(
    `- Questions: ${ctx.questionCount} (${ctx.assignedCount} assigned, ${ctx.unassignedCount} unassigned) · ${ctx.healthScore.green}G / ${ctx.healthScore.yellow}Y / ${ctx.healthScore.red}R`,
  );
  if (ctx.openClientClarifications.length > 0) {
    lines.push(`- Open clarifications: ${ctx.openClientClarifications.length}`);
  }
  if (ctx.recentWriterUpdates.length > 0) {
    lines.push(`- Recent writer updates (48h): ${ctx.recentWriterUpdates.length}`);
    for (const u of ctx.recentWriterUpdates.slice(0, 4)) {
      lines.push(
        `  · ${u.userName ?? "writer"} [${u.signalType ?? u.needType ?? "update"}]: ${(u.details ?? "").slice(0, 140)}`,
      );
    }
  }
  if (ctx.recentPulses.length > 0) {
    const blocked = ctx.recentPulses.filter((p) => p.blocked).length;
    lines.push(`- Daily pulses (48h): ${ctx.recentPulses.length} (${blocked} blocked)`);
  }

  // Question-scoped
  if (ctx.question) {
    const q = ctx.question;
    lines.push("");
    lines.push(`QUESTION CONTEXT — Q${fmtStr(q.number)}: ${q.title}`);
    if (q.rfpRequirement) lines.push(`- RFP: ${q.rfpRequirement.slice(0, 500)}`);
    if (q.requirements.length) lines.push(`- Requirements: ${q.requirements.join("; ")}`);
    if (q.mandatoryLanguage.length)
      lines.push(`- Mandatory language: ${q.mandatoryLanguage.join("; ")}`);
    if (q.scoringCriteria) lines.push(`- Scoring: ${q.scoringCriteria.slice(0, 300)}`);
    if (q.pageLimit || q.wordLimit)
      lines.push(
        `- Limits: ${q.pageLimit ? `${q.pageLimit} pages` : ""}${q.pageLimit && q.wordLimit ? " · " : ""}${q.wordLimit ? `${q.wordLimit} words` : ""}`,
      );
    lines.push(
      `- Status: ${fmtStr(q.status)} · Health: ${fmtStr(q.health)} · Score: ${q.currentScore ?? "—"} · Due: ${fmtStr(q.dueDate)}`,
    );
    if (q.currentFocus) lines.push(`- Current focus: ${q.currentFocus}`);
    if (q.nextStep) lines.push(`- Next step: ${q.nextStep}`);
    if (q.waitingOn) lines.push(`- Waiting on: ${q.waitingOn}`);
    if (q.complianceRequirements.length > 0) {
      lines.push(`- Question compliance:`);
      for (const c of q.complianceRequirements.slice(0, 5)) {
        lines.push(`  · ${c.requirement.slice(0, 200)}${c.isFederal ? " (federal)" : ""}`);
      }
    }
    if (q.threadSummary.length > 0) {
      lines.push(`- Recent thread:`);
      for (const t of q.threadSummary.slice(0, 5)) {
        lines.push(`  · [${t.entryType}] ${t.author ?? "—"}: ${t.body}`);
      }
    }
    if (q.priorScoreResults.length > 0) {
      lines.push(`- Prior Score Me runs: ${q.priorScoreResults.length}`);
      for (const s of q.priorScoreResults.slice(0, 2)) {
        if (s.summary) lines.push(`  · ${s.summary.slice(0, 200)}`);
      }
    }
  }

  lines.push("");
  lines.push(
    `Setup Record completeness: ${ctx.completenessScore.pct}% (${ctx.completenessScore.filled}/${ctx.completenessScore.total}).`,
  );
  if (ctx.completenessScore.pct < 100) {
    lines.push(
      `Fields not yet provided: ${ctx.completenessScore.missing.map((f) => f.label).join(", ")}. Treat those as unknown — do not invent values.`,
    );
  }
  lines.push("");
  lines.push("Use this context to ground every response. Do not contradict it. Do not speculate about things explicitly stated here.");

  return lines.join("\n");
}
