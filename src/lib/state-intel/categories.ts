// Canonical list of the 12 State Intelligence Pack categories.
// The `id` matches the public.state_intel_category enum in the database.

export type StateIntelCategoryId =
  | "waivers_authorities"
  | "state_plan_amendments"
  | "managed_care_landscape"
  | "quality_strategy"
  | "directed_payments"
  | "core_set_performance"
  | "legislative_budget"
  | "rate_setting"
  | "eligibility_enrollment"
  | "workforce_network"
  | "demographics_health"
  | "litigation_compliance";

export interface StateIntelCategory {
  id: StateIntelCategoryId;
  label: string;
  shortDescription: string;
  uploadExamples: string[];
}

export const STATE_INTEL_CATEGORIES: StateIntelCategory[] = [
  {
    id: "waivers_authorities",
    label: "Waivers & Authorities",
    shortDescription: "The foundation — every active waiver granting the state Medicaid flexibility.",
    uploadExamples: [
      "Current 1115 demonstration — full STCs + approval letter",
      "1115 interim and summative evaluation reports",
      "Pending 1115 amendments",
      "1915(b) managed care waiver (if applicable)",
      "1915(c) HCBS waivers — one per population (I/DD, aged/disabled, TBI)",
      "1915(i)/1915(k) state plan options",
    ],
  },
  {
    id: "state_plan_amendments",
    label: "State Plan & Amendments",
    shortDescription: "The Medicaid state plan and the trail of changes CMS has approved.",
    uploadExamples: [
      "Current Medicaid state plan",
      "Recent SPA approvals (last 3 years)",
      "Pending SPAs",
      "CHIP state plan + amendments",
    ],
  },
  {
    id: "managed_care_landscape",
    label: "Managed Care Landscape",
    shortDescription: "Who runs Medicaid managed care today and how the state contracts for it.",
    uploadExamples: [
      "Current MCO contracts (master template + plan-specific addenda)",
      "Most recent procurement RFP + awards",
      "Enrollment data by MCO + region",
      "Network adequacy reports",
      "MCO performance scorecards",
    ],
  },
  {
    id: "quality_strategy",
    label: "Quality Strategy",
    shortDescription: "The state's quality framework and the EQR record proving it works (or doesn't).",
    uploadExamples: [
      "Current Medicaid Quality Strategy",
      "External Quality Review (EQR) reports — last 2 years, all MCOs",
      "Performance Improvement Projects (PIPs)",
      "Quality withhold / pay-for-performance design",
    ],
  },
  {
    id: "directed_payments",
    label: "Directed Payments & SDPs",
    shortDescription: "The supplemental and directed payment programs flowing through MCOs.",
    uploadExamples: [
      "Current directed payment preprints",
      "CMS approval letters for SDPs",
      "Hospital UPL / IGT programs",
      "Provider tax / assessment program documentation",
    ],
  },
  {
    id: "core_set_performance",
    label: "Core Set Performance",
    shortDescription: "How the state is performing on the CMS Adult, Child, and Health Home Core Sets.",
    uploadExamples: [
      "Most recent Core Set reporting",
      "HEDIS results by MCO",
      "CAHPS member experience surveys",
      "State-specific performance improvement plans",
    ],
  },
  {
    id: "legislative_budget",
    label: "Legislative & Budget",
    shortDescription: "Recent legislative action, budget direction, and oversight body minutes.",
    uploadExamples: [
      "Most recent state Medicaid budget bill",
      "Major Medicaid legislation from the last 2 sessions",
      "Medical Care Advisory Committee (MCAC/MMAC) minutes — last 12 months",
      "Legislative oversight committee reports",
    ],
  },
  {
    id: "rate_setting",
    label: "Rate Setting",
    shortDescription: "How capitation rates are built and what the actuaries are signaling.",
    uploadExamples: [
      "Current capitation rate certification letters",
      "Actuarial rate development reports",
      "Fee-for-service fee schedules (key categories)",
      "Risk adjustment methodology documentation",
    ],
  },
  {
    id: "eligibility_enrollment",
    label: "Eligibility & Enrollment",
    shortDescription: "Who is enrolled, how the state is handling unwinding, and continuous coverage status.",
    uploadExamples: [
      "Monthly enrollment reports",
      "Unwinding data + procedural disenrollment trends",
      "Continuous eligibility policy (children + adults)",
      "Express Lane / streamlined eligibility documentation",
    ],
  },
  {
    id: "workforce_network",
    label: "Workforce & Provider Network",
    shortDescription: "The provider supply problem and what the state is doing about it.",
    uploadExamples: [
      "Network adequacy reports by service category",
      "Workforce shortage data (BHA, dental, primary care)",
      "CHW / peer support program documentation",
      "Loan repayment / workforce investment program records",
    ],
  },
  {
    id: "demographics_health",
    label: "Demographics & Health Status",
    shortDescription: "Who the Medicaid population is and what they need.",
    uploadExamples: [
      "State health dashboard / population health profile",
      "SDOH data by region",
      "Maternal & infant health indicators",
      "Behavioral health prevalence reports",
    ],
  },
  {
    id: "litigation_compliance",
    label: "Litigation & Compliance",
    shortDescription: "Active legal exposure and outstanding CMS findings.",
    uploadExamples: [
      "Active class action / consent decree documentation",
      "Open CMS corrective action plans",
      "OIG audit responses",
      "Significant compliance settlements (last 3 years)",
    ],
  },
];

export const CATEGORY_BY_ID: Record<StateIntelCategoryId, StateIntelCategory> = Object.fromEntries(
  STATE_INTEL_CATEGORIES.map((c) => [c.id, c]),
) as Record<StateIntelCategoryId, StateIntelCategory>;

// US states (50 + DC + PR for Medicaid completeness)
export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" }, { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s.name]),
);

export const TOTAL_CATEGORIES = STATE_INTEL_CATEGORIES.length;
