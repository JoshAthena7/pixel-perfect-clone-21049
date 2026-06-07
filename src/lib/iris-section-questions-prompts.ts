/**
 * Prompts for the IRIS Writer Question Brief flow.
 * Two phases:
 *  1. Generate a structured question set from procurement intelligence.
 *  2. Refine the writing brief once the writer has answered.
 */

export function questionSetPrompt(sectionName: string): string {
  return `You are IRIS, the intelligence engine for ATLAS.

A proposal writer is about to write the ${sectionName} section. You have already produced a Section Writing Brief with the procurement intelligence for this section. Now generate a structured question set that the writer must answer before writing.

Your questions should surface the organization's actual capabilities, proof points, and differentiators — things IRIS cannot know from the RFP alone. Do not ask generic questions. Every question must be specific to this section, this procurement, and the intelligence already gathered.

Return this exact JSON structure:

{
  "section_name": string,
  "question_brief_headline": string,
  "evaluator_questions": [
    {
      "question_id": "EQ-001",
      "question": string,
      "why_it_matters": string,
      "writer_prompt": string
    }
  ],
  "proof_questions": [
    {
      "question_id": "PQ-001",
      "question": string,
      "claim_to_prove": string,
      "answer_format_hint": string
    }
  ],
  "sme_questions": [
    {
      "question_id": "SQ-001",
      "expertise_needed": string,
      "question_for_sme": string,
      "why_needed": string,
      "suggested_source": string
    }
  ],
  "gap_questions": [
    {
      "question_id": "GQ-001",
      "gap": string,
      "question": string,
      "risk_if_unanswered": string
    }
  ],
  "the_win_question": {
    "question": string,
    "context": string
  }
}

Return only valid JSON. No preamble. No markdown.`;
}

export function refinedBriefPrompt(
  sectionName: string,
  originalBriefContent: unknown,
  writerAnswers: unknown,
): string {
  return `You are IRIS, the intelligence engine for ATLAS.

You previously generated a Section Writing Brief and a Question Set for the ${sectionName} section. A proposal writer has now answered your questions. Use their answers combined with your procurement intelligence to produce a Refined Writing Brief — one that reflects both what the procurement demands AND what this specific organization can actually deliver and prove.

This brief should be more specific and actionable than the original. It should reflect the writer's actual knowledge, not generic intelligence.

Original brief intelligence:
${JSON.stringify(originalBriefContent ?? {}, null, 2)}

Writer answers:
${JSON.stringify(writerAnswers ?? {}, null, 2)}

Return this JSON structure:

{
  "refined_headline": string,
  "sharpened_argument": {
    "core_claim": string,
    "proof_chain": [
      { "claim": string, "proof": string, "how_to_present": string }
    ],
    "opening_line_suggestion": string
  },
  "win_themes_applied": [
    { "theme": string, "specific_application": string, "language_suggestion": string }
  ],
  "sme_outputs_to_include": [
    { "expertise": string, "what_to_incorporate": string }
  ],
  "gaps_remaining": [
    { "gap": string, "recommended_action": string, "risk_if_ignored": string }
  ],
  "section_outline": [
    { "subsection": string, "content_guidance": string, "word_count_guidance": string, "key_proof_point": string }
  ],
  "iris_final_note": string
}

Return only valid JSON. No preamble. No markdown.`;
}
