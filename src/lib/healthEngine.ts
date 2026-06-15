/**
 * ATLAS Question Health Engine — pure calculation.
 *
 * No database calls live in here. Callers load all signals from the database,
 * pass them in, and write the result back. This keeps the rules auditable,
 * testable in isolation, and identical between the on-demand server fn and
 * the daily cron.
 */

export type HealthState = "healthy" | "watch" | "at_risk";

export interface QuestionHealthInputs {
  // Identity
  questionId: string;
  missionId: string;
  daysUntilSubmission: number;
  daysUntilInternalReview: number;

  // Brief signals (from mission_questions.iris_brief_status + mission_assist_events)
  briefStatus: "pending" | "queued" | "generating" | "ready" | "stale" | "error";
  briefAgeInDays: number | null;
  briefOpened: boolean;
  briefExported: boolean;

  // Progress signals (from question_progress — lead_writer row)
  progressStatus: string;
  acceptanceStatus: string;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  writerConfidence: string | null;
  smeAssigned: boolean;
  lastActivityAt: Date | null;

  // Mock score (latest from question_progress.mock_score or question_feedback)
  mockScore: number | null;
  maxScore: number;

  // Feedback signals
  openFeedbackCount: number;

  // Coherence (from mission_sections)
  coherenceStatus: string;

  // Pulse staleness (mission_pulse_updates)
  stalePulseDomains: number;

  // SOS (mission_assist_events)
  sosRaised: boolean;
}

export interface HealthReason {
  signal: string;
  value: string;
  impact: "pass" | "watch" | "risk";
  detail: string;
}

export interface HealthResult {
  state: HealthState;
  score: number;
  reasons: HealthReason[];
  tripWires: string[];
  calculatedAt: Date;
}

export function calculateQuestionHealth(inputs: QuestionHealthInputs): HealthResult {
  const reasons: HealthReason[] = [];
  const tripWires: string[] = [];
  let state: HealthState = "healthy";

  // ─────────── HARD TRIP WIRES ───────────
  if (inputs.briefStatus === "pending" && inputs.daysUntilSubmission <= 14) {
    tripWires.push("Brief not generated with ≤14 days to submission");
    state = "at_risk";
  }
  if (
    !inputs.briefOpened &&
    inputs.briefStatus === "ready" &&
    inputs.daysUntilSubmission <= 10
  ) {
    tripWires.push("Writer has never opened brief with ≤10 days to submission");
    state = "at_risk";
  }
  if (inputs.acceptanceStatus === "pending" && inputs.assignedAt) {
    const hoursPending = (Date.now() - inputs.assignedAt.getTime()) / (1000 * 60 * 60);
    if (hoursPending > 48) {
      tripWires.push("Assignment pending >48 hours with no response");
      state = "at_risk";
    }
  }
  if (inputs.sosRaised && !inputs.smeAssigned) {
    tripWires.push("SOS raised — Need Help with no SME assigned");
    state = "at_risk";
  }
  if (inputs.mockScore !== null && inputs.mockScore / inputs.maxScore < 0.65) {
    tripWires.push(`Mock score critically low: ${inputs.mockScore}/${inputs.maxScore}`);
    state = "at_risk";
  }
  if (inputs.openFeedbackCount > 0 && inputs.daysUntilInternalReview <= 7) {
    tripWires.push(
      `${inputs.openFeedbackCount} unacknowledged feedback items with ≤7 days to internal review`,
    );
    state = "at_risk";
  }
  if (inputs.daysUntilSubmission < 0) {
    tripWires.push("Submission deadline has passed");
    state = "at_risk";
  }

  if (state === "at_risk" && tripWires.length > 0) {
    return { state, score: 0, reasons, tripWires, calculatedAt: new Date() };
  }

  // ─────────── SIGNAL SCORING ───────────
  const scores: { weight: number; value: number }[] = [];

  // 1. Brief Freshness
  let briefScore = 0;
  if (inputs.briefStatus === "ready") {
    if (inputs.briefAgeInDays === null) briefScore = 50;
    else if (inputs.briefAgeInDays <= 7) briefScore = 100;
    else if (inputs.briefAgeInDays <= 14) briefScore = 75;
    else if (inputs.briefAgeInDays <= 21) briefScore = 40;
    else briefScore = 15;
  } else if (inputs.briefStatus === "stale") briefScore = 30;
  else if (inputs.briefStatus === "pending") briefScore = 10;
  scores.push({ weight: 20, value: briefScore });
  reasons.push({
    signal: "Brief Freshness",
    value: inputs.briefStatus + (inputs.briefAgeInDays ? ` (${inputs.briefAgeInDays}d)` : ""),
    impact: briefScore >= 75 ? "pass" : briefScore >= 40 ? "watch" : "risk",
    detail:
      briefScore < 40
        ? "Brief is stale or missing. Writers are working without current intelligence."
        : briefScore < 75
          ? "Brief is aging. Approaching stale threshold."
          : "Brief is current.",
  });

  // 2. Brief Engagement
  let engageScore = 0;
  if (inputs.briefExported) engageScore = 100;
  else if (inputs.briefOpened) engageScore = 60;
  else if (inputs.briefStatus !== "pending") engageScore = 10;
  else engageScore = 50;
  scores.push({ weight: 15, value: engageScore });
  reasons.push({
    signal: "Brief Engagement",
    value: inputs.briefExported
      ? "Opened and exported"
      : inputs.briefOpened
        ? "Opened, not exported"
        : "Never opened",
    impact: engageScore >= 60 ? "pass" : engageScore >= 30 ? "watch" : "risk",
    detail:
      !inputs.briefOpened && inputs.briefStatus === "ready"
        ? "Writer has not opened this brief. Intelligence is not being used."
        : !inputs.briefExported
          ? "Brief opened but not exported to client environment."
          : "Writer has engaged with brief and exported to client environment.",
  });

  // 3. Mock Score
  let mockScore = 70;
  if (inputs.mockScore !== null) {
    mockScore = Math.round((inputs.mockScore / inputs.maxScore) * 100);
  }
  scores.push({ weight: 20, value: mockScore });
  reasons.push({
    signal: "Mock Score",
    value:
      inputs.mockScore !== null
        ? `${inputs.mockScore}/${inputs.maxScore} (${mockScore}%)`
        : "Not yet scored",
    impact: mockScore >= 75 ? "pass" : mockScore >= 60 ? "watch" : "risk",
    detail:
      inputs.mockScore === null
        ? "No mock score yet. Using neutral baseline."
        : mockScore >= 85
          ? "Strong mock score. Quality signal is healthy."
          : mockScore >= 75
            ? "Acceptable mock score. Room for improvement before submission."
            : "Mock score below target. Revision needed.",
  });

  // 4. Progress Status
  const progressScoreMap: Record<string, number> = {
    finalized: 100,
    gold_team: 95,
    mock_scored: 90,
    red_team: 80,
    internal_review: 75,
    revising: 65,
    in_progress: 55,
    briefed: 40,
    not_started: 10,
  };
  const progressScore = progressScoreMap[inputs.progressStatus] ?? 30;
  scores.push({ weight: 15, value: progressScore });
  const expectedProgress =
    inputs.daysUntilSubmission <= 7
      ? 80
      : inputs.daysUntilSubmission <= 14
        ? 60
        : inputs.daysUntilSubmission <= 21
          ? 40
          : 20;
  const progressGap = progressScore < expectedProgress;
  reasons.push({
    signal: "Progress Status",
    value: inputs.progressStatus.replace(/_/g, " "),
    impact: progressScore >= 75 ? "pass" : progressScore >= 40 ? "watch" : "risk",
    detail: progressGap
      ? `Behind expected pace. At ${inputs.daysUntilSubmission} days out, ${inputs.progressStatus.replace(/_/g, " ")} is below target.`
      : "Progress is on track for current deadline proximity.",
  });

  // 5. Deadline + Activity
  const dayScore =
    inputs.daysUntilSubmission >= 30
      ? 100
      : inputs.daysUntilSubmission >= 21
        ? 85
        : inputs.daysUntilSubmission >= 14
          ? 65
          : inputs.daysUntilSubmission >= 7
            ? 40
            : 15;
  let activityPenalty = 0;
  if (inputs.lastActivityAt) {
    const daysSinceActivity =
      (Date.now() - inputs.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity > 5 && inputs.daysUntilSubmission <= 14) activityPenalty = 20;
    else if (daysSinceActivity > 3 && inputs.daysUntilSubmission <= 7) activityPenalty = 30;
  }
  const deadlineScore = Math.max(0, dayScore - activityPenalty);
  scores.push({ weight: 10, value: deadlineScore });
  reasons.push({
    signal: "Deadline & Activity",
    value: `${inputs.daysUntilSubmission}d remaining`,
    impact: deadlineScore >= 65 ? "pass" : deadlineScore >= 40 ? "watch" : "risk",
    detail:
      activityPenalty > 0
        ? "No recent activity detected on this question. Deadline pressure is compounding inactivity."
        : `${inputs.daysUntilSubmission} days to submission.`,
  });

  // 6. Open Feedback
  const feedbackScore =
    inputs.openFeedbackCount === 0
      ? 100
      : inputs.openFeedbackCount === 1
        ? 70
        : inputs.openFeedbackCount <= 3
          ? 45
          : 20;
  scores.push({ weight: 10, value: feedbackScore });
  reasons.push({
    signal: "Open Feedback",
    value: `${inputs.openFeedbackCount} open item(s)`,
    impact: feedbackScore >= 70 ? "pass" : feedbackScore >= 45 ? "watch" : "risk",
    detail:
      inputs.openFeedbackCount === 0
        ? "No unacknowledged feedback. Review loop is clean."
        : `${inputs.openFeedbackCount} feedback items not yet acknowledged. Writer must acknowledge to move status forward.`,
  });

  // 7. Strategic Coherence
  const coherenceScoreMap: Record<string, number> = {
    aligned: 100,
    unreviewed: 60,
    needs_revision: 30,
    escalated: 10,
  };
  const coherenceScore = coherenceScoreMap[inputs.coherenceStatus] ?? 60;
  scores.push({ weight: 5, value: coherenceScore });
  reasons.push({
    signal: "Strategic Coherence",
    value: inputs.coherenceStatus.replace(/_/g, " "),
    impact: coherenceScore >= 60 ? "pass" : coherenceScore >= 30 ? "watch" : "risk",
    detail:
      inputs.coherenceStatus === "aligned"
        ? "Engagement Lead has validated narrative alignment."
        : inputs.coherenceStatus === "needs_revision"
          ? "Engagement Lead flagged coherence issues. Revision required."
          : inputs.coherenceStatus === "escalated"
            ? "Coherence escalated. Immediate leader attention required."
            : "Not yet reviewed by Engagement Lead.",
  });

  const totalWeight = scores.reduce((s, i) => s + i.weight, 0);
  const composite = Math.round(
    scores.reduce((s, i) => s + i.value * i.weight, 0) / totalWeight,
  );

  // ─────────── SOFT WATCH ESCALATION ───────────
  if (state !== "at_risk") {
    if (
      inputs.mockScore !== null &&
      inputs.mockScore / inputs.maxScore < 0.75 &&
      inputs.mockScore / inputs.maxScore >= 0.65
    ) {
      state = "watch";
    }
    if (["need_help", "capacity_concern"].includes(inputs.acceptanceStatus)) state = "watch";
    if (inputs.briefAgeInDays && inputs.briefAgeInDays > 14) state = "watch";
    if (inputs.stalePulseDomains >= 3) state = "watch";
    if (inputs.coherenceStatus === "needs_revision") state = "watch";
    if (composite < 55 && state === "healthy") state = "watch";
    if (composite < 35) state = "at_risk";
  }

  return { state, score: composite, reasons, tripWires, calculatedAt: new Date() };
}
