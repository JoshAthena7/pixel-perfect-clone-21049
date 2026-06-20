// Default person-first language pairs seeded into IRIS Studio for every mission.
// 28 pairs across 8 categories. Used by Language & Inclusion tab and the
// IRIS system-prompt builder.

export type PersonFirstPair = {
  term: string;
  replacement: string;
  category: PersonFirstCategory;
  active: boolean;
};

export type PersonFirstCategory =
  | "mental_health"
  | "substance_use"
  | "disability"
  | "housing"
  | "economic"
  | "youth"
  | "engagement"
  | "cultural";

export const PERSON_FIRST_CATEGORY_LABEL: Record<PersonFirstCategory, string> = {
  mental_health: "Mental Health",
  substance_use: "Substance Use",
  disability: "Disability",
  housing: "Housing",
  economic: "Economic",
  youth: "Youth",
  engagement: "Engagement",
  cultural: "Cultural",
};

export const DEFAULT_PERSON_FIRST_PAIRS: PersonFirstPair[] = [
  // Mental Health
  { term: "mentally ill", replacement: "person experiencing mental illness", category: "mental_health", active: true },
  { term: "the mentally ill", replacement: "people with mental health needs", category: "mental_health", active: true },
  { term: "emotionally disturbed", replacement: "youth with emotional and behavioral health needs", category: "mental_health", active: true },
  { term: "psychiatric patient", replacement: "person receiving psychiatric care", category: "mental_health", active: true },
  { term: "mental patient", replacement: "person with mental health needs", category: "mental_health", active: true },
  // Substance Use
  { term: "substance abuser", replacement: "person with substance use disorder", category: "substance_use", active: true },
  { term: "addict", replacement: "person with addiction", category: "substance_use", active: true },
  { term: "junkie", replacement: "person in recovery", category: "substance_use", active: true },
  { term: "drug abuser", replacement: "person with a substance use condition", category: "substance_use", active: true },
  { term: "alcoholic", replacement: "person with alcohol use disorder", category: "substance_use", active: true },
  // Disability
  { term: "the disabled", replacement: "people with disabilities", category: "disability", active: true },
  { term: "special needs", replacement: "individualized needs", category: "disability", active: true },
  { term: "handicapped", replacement: "person with a disability", category: "disability", active: true },
  { term: "mentally retarded", replacement: "person with an intellectual disability", category: "disability", active: true },
  { term: "confined to a wheelchair", replacement: "wheelchair user", category: "disability", active: true },
  { term: "suffers from a disability", replacement: "has a disability", category: "disability", active: true },
  // Housing & Economic
  { term: "homeless youth", replacement: "youth experiencing homelessness", category: "housing", active: true },
  { term: "the homeless", replacement: "people experiencing homelessness", category: "housing", active: true },
  { term: "low-income families", replacement: "families with limited financial resources", category: "economic", active: true },
  { term: "the poor", replacement: "people experiencing poverty", category: "economic", active: true },
  // Youth
  { term: "at-risk youth", replacement: "youth facing barriers", category: "youth", active: true },
  { term: "problem youth", replacement: "youth with complex needs", category: "youth", active: true },
  { term: "difficult families", replacement: "families with complex needs", category: "youth", active: true },
  { term: "troubled youth", replacement: "youth experiencing challenges", category: "youth", active: true },
  // Engagement
  { term: "non-compliant", replacement: "facing barriers to engagement", category: "engagement", active: true },
  { term: "failed to comply", replacement: "experienced barriers to participation", category: "engagement", active: true },
  { term: "refused treatment", replacement: "declined services at this time", category: "engagement", active: true },
  { term: "unmotivated", replacement: "not yet engaged", category: "engagement", active: true },
  // Cultural
  { term: "minority communities", replacement: "historically underserved communities", category: "cultural", active: true },
  { term: "urban youth", replacement: "youth in urban communities", category: "cultural", active: true },
  { term: "inner city", replacement: "under-resourced communities", category: "cultural", active: true },
];

export const DEFAULT_NJ_STATE_TERMINOLOGY: Array<{
  term: string;
  preferred: string;
  context: string;
}> = [
  { term: "children", preferred: "youth", context: "NJ CSOC refers to youth, not children" },
  { term: "services", preferred: "System of Care", context: "NJ branding" },
  { term: "family input", preferred: "family voice", context: "NJ CSOC term" },
  { term: "patient", preferred: "youth", context: "Never use patient in CSOC context" },
  { term: "client", preferred: "youth or young person", context: "Person-first, non-medical" },
  { term: "case", preferred: "service plan or care plan", context: "Less clinical" },
];

export const CULTURAL_STANDARD_DEFS: Array<{
  key: string;
  label: string;
  description: string;
}> = [
  { key: "community_names", label: "Community-Specific Names", description: "Use \"Black families,\" \"Latino youth,\" \"Indigenous communities\" — not umbrella terms like \"minority\" or \"diverse populations.\"" },
  { key: "avoid_deficit_framing", label: "Avoid Deficit Framing", description: "Describe strengths alongside needs. Never define people solely by what they lack or struggle with." },
  { key: "experienced_not_suffered", label: "\"Experienced\" Not \"Suffered\"", description: "People \"experienced\" hardship or barriers — they did not \"suffer from\" their circumstances." },
  { key: "acknowledge_systemic_factors", label: "Acknowledge Systemic Factors", description: "Name structural barriers (poverty, racism, lack of resources) rather than attributing outcomes solely to individual behavior." },
  { key: "community_owned_language", label: "Community-Owned Language", description: "Use language communities use to describe themselves. Avoid clinical or bureaucratic labels when lived-experience language exists." },
  { key: "avoid_medical_model", label: "Person-Centered Over Medical Model", description: "Lead with the person, not the diagnosis. \"Person with schizophrenia\" not \"schizophrenic.\"" },
  { key: "engagement_not_compliance", label: "Engagement Not Compliance", description: "Families and youth are partners in services — not subjects of compliance requirements." },
  { key: "family_as_partners", label: "Family as Partners", description: "Families are active partners in care decisions — not passive recipients of services or obstacles to treatment." },
];
