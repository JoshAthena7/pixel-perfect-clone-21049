// Build a "LANGUAGE & INCLUSION REQUIREMENTS" prompt fragment from a
// mission_iris_config row. Append the result to every IRIS system prompt so
// the AI follows mission-specific person-first + cultural standards.

import type { PersonFirstPair } from "./default-person-first";

export type StateTerminologyEntry = {
  term: string;
  preferred: string;
  context?: string | null;
};

export type LanguagePromptInput = {
  person_first_pairs?: PersonFirstPair[] | null;
  cultural_standards?: string[] | null;
  state_terminology?: StateTerminologyEntry[] | null;
};

const STANDARD_LINES: Record<string, string> = {
  avoid_deficit_framing: "Describe people's strengths alongside their needs. Never define people solely by deficits or challenges.",
  community_names: "Use specific community names (Black families, Latino youth, Indigenous communities) rather than umbrella terms like \"minority\" or \"diverse populations.\"",
  experienced_not_suffered: "People \"experienced\" hardship or barriers — they did not \"suffer from\" their circumstances. Avoid \"suffers from\" language.",
  acknowledge_systemic_factors: "When discussing poor outcomes, acknowledge structural and systemic factors — do not attribute outcomes solely to individual behavior.",
  community_owned_language: "Use language communities use to describe themselves. Avoid clinical or bureaucratic labels when lived-experience language exists.",
  avoid_medical_model: "Use person-first language over medical model language. \"Person with schizophrenia\" not \"schizophrenic.\" Lead with the person.",
  engagement_not_compliance: "Families and youth are partners in services, not subjects of compliance. Use \"engagement\" and \"participation\" not \"compliance\" when referring to clients.",
  family_as_partners: "Always frame families as active partners in care decisions, not passive recipients of services.",
};

export function buildLanguagePrompt(input: LanguagePromptInput): string {
  const parts: string[] = [];

  const activePairs = (input.person_first_pairs ?? []).filter((p) => p && p.active && p.term && p.replacement);
  if (activePairs.length > 0) {
    parts.push("PERSON-FIRST LANGUAGE REQUIREMENTS — you must follow these exactly in every response:");
    for (const p of activePairs) {
      parts.push(`Never say "${p.term}" — always say "${p.replacement}" instead.`);
    }
  }

  const standards = input.cultural_standards ?? [];
  for (const key of standards) {
    const line = STANDARD_LINES[key];
    if (line) parts.push(line);
  }

  const stateTerms = (input.state_terminology ?? []).filter((t) => t && t.term && t.preferred);
  if (stateTerms.length > 0) {
    parts.push("STATE-PREFERRED TERMINOLOGY — use these terms in all outputs:");
    for (const t of stateTerms) {
      const ctx = t.context ? ` Context: ${t.context}` : "";
      parts.push(`Say "${t.preferred}" not "${t.term}."${ctx}`);
    }
  }

  if (parts.length === 0) return "";
  return `\n\n## LANGUAGE & INCLUSION REQUIREMENTS\n${parts.join("\n")}`;
}
