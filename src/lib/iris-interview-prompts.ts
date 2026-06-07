/**
 * Prompts for IRIS Interview Flight Plan™.
 *  1. Generate a complete pre-interview intelligence package.
 *  2. Debrief the interview from raw writer notes (not persisted).
 */

interface PlanInputs {
  sme_name: string;
  sme_role: string;
  sme_organization?: string | null;
  sme_type: string;
  section_context: string;
  mission_brief_summary: string;
  strategic_highlights: string;
  relevant_requirements: string;
  additional_context?: string | null;
}

export function interviewPlanPrompt(i: PlanInputs): string {
  return `You are IRIS, the intelligence engine for ATLAS.

A proposal writer is preparing to interview:
Name: ${i.sme_name}
Role: ${i.sme_role}
Organization: ${i.sme_organization ?? "Not specified"}
SME Type: ${i.sme_type}

This interview supports the following proposal work:
${i.section_context}

Procurement context — Mission Brief:
${i.mission_brief_summary}

Strategic Assessment highlights:
${i.strategic_highlights}

Outstanding requirements relevant to this SME's domain:
${i.relevant_requirements}

${i.additional_context ? `Additional context from the writer:\n${i.additional_context}\n` : ""}
Generate a complete Interview Flight Plan™ that transforms this writer from unprepared to weaponized before they walk into the room.

Return ONLY this exact JSON structure (no markdown, no preamble):

{
  "sme_briefing": {
    "headline": string,
    "who_you_are_meeting": string,
    "why_they_matter": string,
    "questions_this_supports": string[],
    "relevant_requirements": [
      { "requirement_id": string, "requirement_text": string, "why_relevant": string }
    ],
    "known_sensitivities": string[],
    "preparation_note": string
  },
  "interview_objective": {
    "primary_objective": string,
    "secondary_objectives": string[],
    "definition_of_success": string
  },
  "recommended_questions": [
    {
      "question_id": "IQ-001",
      "topic": string,
      "tier_1_basic": string,
      "tier_2_better": string,
      "tier_3_best": string,
      "why_tier_3_wins": string,
      "follow_up": string
    }
  ],
  "information_gaps": [
    {
      "gap_id": "IG-001",
      "what_we_need": string,
      "why_it_matters": string,
      "question_to_close_gap": string,
      "risk_if_unanswered": "High" | "Medium" | "Low"
    }
  ],
  "story_mining": {
    "context": string,
    "questions": [
      {
        "question_id": "SM-001",
        "question": string,
        "what_to_listen_for": string,
        "how_to_use": string
      }
    ]
  },
  "red_flag_questions": [
    {
      "question_id": "RF-001",
      "risk_area": string,
      "question": string,
      "what_a_weak_answer_sounds_like": string,
      "what_a_strong_answer_sounds_like": string,
      "iris_note": string
    }
  ],
  "interview_flow": {
    "recommended_duration": string,
    "opening": string,
    "sequence": [ { "phase": string, "duration": string, "focus": string } ],
    "closing": string
  },
  "iris_briefing_note": string
}`;
}

interface DebriefInputs {
  interview_plan_json: string;
  raw_notes: string;
}

export function interviewDebriefPrompt(i: DebriefInputs): string {
  return `You are IRIS, the intelligence engine for ATLAS.

A proposal writer has completed an SME interview and uploaded their notes. Analyze the notes against the original Interview Flight Plan™ and extract structured intelligence.

Original Interview Flight Plan:
${i.interview_plan_json}

Writer's interview notes:
${i.raw_notes}

Return ONLY this exact JSON structure (no markdown, no preamble):

{
  "debrief_headline": string,
  "questions_answered": [
    {
      "question_id": string,
      "question": string,
      "answer_quality": "Strong" | "Adequate" | "Weak" | "Not Asked",
      "key_insight": string,
      "usable_content": string
    }
  ],
  "stories_found": [
    {
      "story_id": "SF-001",
      "headline": string,
      "story_summary": string,
      "human_element": string,
      "outcome": string,
      "proposal_use": string,
      "needs_follow_up": boolean,
      "follow_up_needed": string | null
    }
  ],
  "requirements_addressed": [
    {
      "requirement_id": string,
      "requirement_text": string,
      "coverage_from_interview": "Fully Addressed" | "Partially Addressed" | "Not Addressed",
      "supporting_content": string,
      "recommended_coverage_update": "covered" | "partial" | "not_started"
    }
  ],
  "gaps_remaining": [
    {
      "gap": string,
      "original_gap_id": string | null,
      "why_still_needed": string,
      "recommended_action": string
    }
  ],
  "risk_signals": [
    {
      "signal": string,
      "evidence": string,
      "severity": "High" | "Medium" | "Low",
      "recommended_mitigation": string
    }
  ],
  "recommended_followup": [
    {
      "action": string,
      "urgency": "Before Writing" | "Before Submission" | "Optional",
      "who_to_ask": string,
      "specific_question": string
    }
  ],
  "iris_debrief_note": string
}`;
}
