// Pure helpers shared by both server functions and client components.
// MUST NOT import Supabase or any server-only modules.

export type SetupFieldKey =
  | "client"
  | "state_agency"
  | "submission_date"
  | "program_type"
  | "incumbent_name"
  | "mission_highlights"
  | "client_strengths"
  | "client_win_strategy"
  | "program_goals"
  | "key_requirements"
  | "win_themes"
  | "evaluation_criteria";

export const SETUP_FIELDS: { key: SetupFieldKey; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "state_agency", label: "Issuing agency" },
  { key: "submission_date", label: "Submission date" },
  { key: "program_type", label: "Program type" },
  { key: "incumbent_name", label: "Incumbent" },
  
  { key: "mission_highlights", label: "Mission highlights" },
  { key: "client_strengths", label: "Client strengths" },
  { key: "client_win_strategy", label: "Win strategy" },
  { key: "program_goals", label: "Program goals" },
  { key: "key_requirements", label: "Key requirements" },
  { key: "win_themes", label: "Win themes" },
  { key: "evaluation_criteria", label: "Evaluation criteria" },
];

export type SetupCompleteness = {
  pct: number;
  filled: number;
  total: number;
  missing: { key: SetupFieldKey; label: string }[];
};

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
function hasArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

export function computeSetupCompleteness(input: {
  mission: Record<string, any> | null | undefined;
  evaluationCount: number;
}): SetupCompleteness {
  const m = input.mission ?? {};

  const checks: Record<SetupFieldKey, boolean> = {
    client: hasText(m.client),
    state_agency: hasText(m.state_agency),
    submission_date: hasText(m.submission_date),
    program_type: hasText(m.program_type),
    incumbent_name: hasText(m.incumbent_name),
    
    mission_highlights: hasText(m.mission_highlights),
    client_strengths: hasText(m.client_strengths),
    client_win_strategy: hasText(m.client_win_strategy),
    program_goals: hasText(m.program_goals),
    key_requirements: hasArray(m.key_requirements),
    win_themes: hasArray(m.win_themes),
    evaluation_criteria: input.evaluationCount > 0,
  };

  const missing = SETUP_FIELDS.filter((f) => !checks[f.key]);
  const filled = SETUP_FIELDS.length - missing.length;
  const pct = Math.round((filled / SETUP_FIELDS.length) * 100);
  return { pct, filled, total: SETUP_FIELDS.length, missing };
}
