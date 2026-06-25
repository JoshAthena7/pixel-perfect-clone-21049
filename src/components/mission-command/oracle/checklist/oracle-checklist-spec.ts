/**
 * ORACLE Document Checklist — what IRIS needs to brief correctly.
 *
 * Used by the Setup Wizard Step 1 and the Feed ATLAS drawer Documents tab.
 * Each item maps an uploaded mission_document to a known ORACLE slot so the
 * user never has to manually tag a document.
 */
import type { DocumentPurpose } from "@/lib/oracle/types";

export type ChecklistUrgency = "critical" | "high" | "normal" | "low";

export type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  why_it_matters: string;
  document_type: string;
  document_purpose: DocumentPurpose;
  checklist_category: string;
  urgency: ChecklistUrgency;
  accept: string;
  multiple?: boolean;
};

export const REQUIRED_DOCUMENTS: ChecklistItem[] = [
  {
    id: "primary_rfp",
    label: "Primary RFP",
    description:
      "The main solicitation document. IRIS extracts all requirements, evaluation criteria, and scoring rubrics from this.",
    why_it_matters:
      "Without this, IRIS has nothing to ground briefs in. This is the most critical upload.",
    document_type: "rfp",
    document_purpose: "procurement",
    checklist_category: "primary_rfp",
    urgency: "critical",
    accept: ".pdf,.docx,.doc",
  },
  {
    id: "model_contract",
    label: "State Model Contract",
    description:
      "The contract the winning bidder will sign. IRIS extracts service obligations, performance standards, reporting requirements, and legal constraints — then flags any question response that may conflict.",
    why_it_matters:
      "Responses that win the proposal but contradict the contract create legal risk. IRIS reads the contract so your team writes to win AND to perform.",
    document_type: "model_contract",
    document_purpose: "procurement",
    checklist_category: "model_contract",
    urgency: "critical",
    accept: ".pdf,.docx,.doc",
  },
  {
    id: "scope_of_work",
    label: "Scope of Work",
    description:
      "The operational specification defining services, deliverables, timelines, and standards. IRIS maps each SOW obligation to the questions that must address it.",
    why_it_matters:
      "The SOW defines what you must do if you win. Writers need to know whether their planned response commits to something the SOW requires or prohibits.",
    document_type: "scope_of_work",
    document_purpose: "procurement",
    checklist_category: "scope_of_work",
    urgency: "critical",
    accept: ".pdf,.docx,.doc",
  },
  {
    id: "addenda",
    label: "Addenda & Q&A Documents",
    description: "All amendments, addenda, and Q&A releases issued after the RFP.",
    why_it_matters:
      "Addenda often contain critical clarifications that supersede the original RFP. Missing these can mean IRIS gives outdated guidance.",
    document_type: "amendment",
    document_purpose: "procurement",
    checklist_category: "addenda",
    urgency: "critical",
    accept: ".pdf,.docx,.doc",
    multiple: true,
  },
  {
    id: "state_plan",
    label: "State Medicaid Plan",
    description:
      "The governing state Medicaid framework — NJ FamilyCare, 1115 waiver, or equivalent.",
    why_it_matters:
      "IRIS uses this to ground all regulatory compliance guidance. Without it, regulatory briefs rely on general knowledge instead of this state's specific requirements.",
    document_type: "reference",
    document_purpose: "reference",
    checklist_category: "state_plan",
    urgency: "critical",
    accept: ".pdf,.docx",
  },
  {
    id: "waiver",
    label: "1115 / 1915b / 1915c Waiver Documents",
    description:
      "Federal waiver authority documents governing managed care or HCBS delivery in this state.",
    why_it_matters:
      "Waivers define what is federally authorized. Proposals that contradict waiver terms fail compliance review. IRIS flags these conflicts — but only if you upload the waiver.",
    document_type: "reference",
    document_purpose: "reference",
    checklist_category: "waiver",
    urgency: "critical",
    accept: ".pdf,.docx",
    multiple: true,
  },
  {
    id: "eqro",
    label: "EQRO Report",
    description:
      "The most recent External Quality Review Organization annual report for this program.",
    why_it_matters:
      "EQRO reports contain the state's own assessment of the current program's performance gaps — exactly what evaluators want bidders to address. This is gold.",
    document_type: "reference",
    document_purpose: "reference",
    checklist_category: "eqro",
    urgency: "critical",
    accept: ".pdf,.docx",
  },
  {
    id: "prior_rfp",
    label: "Prior RFP (if rebid)",
    description: "The previous version of this procurement, if this is a rebid.",
    why_it_matters:
      "Shows what the state asked for last time and what changed. IRIS uses this for the crosswalk analysis.",
    document_type: "rfp",
    document_purpose: "competitive_intel",
    checklist_category: "prior_rfp",
    urgency: "high",
    accept: ".pdf,.docx",
  },
];

export const RECOMMENDED_DOCUMENTS: ChecklistItem[] = [
  {
    id: "past_proposal",
    label: "Past Proposal / Win-Loss Review",
    description: "Prior proposals submitted for this or similar procurements.",
    why_it_matters:
      "IRIS learns what your team has argued before and can flag contradictions or opportunities to strengthen your position.",
    document_type: "other",
    document_purpose: "client_strategy",
    checklist_category: "past_proposal",
    urgency: "high",
    accept: ".pdf,.docx",
    multiple: true,
  },
  {
    id: "style_guide",
    label: "Style Guide / Voice Guide",
    description: "Any writing style guide, brand voice guide, or tone document.",
    why_it_matters:
      "IRIS conditions all content guidance on this. Without it, IRIS suggests language that may not match your team's voice.",
    document_type: "other",
    document_purpose: "writing_standards",
    checklist_category: "style_guide",
    urgency: "high",
    accept: ".pdf,.docx",
  },
  {
    id: "knowledge_transfer",
    label: "Knowledge Transfer / Kickoff Docs",
    description:
      "Any internal briefing documents, kickoff presentations, or background context.",
    why_it_matters:
      "Helps IRIS understand client-specific context that isn't in the RFP.",
    document_type: "other",
    document_purpose: "client_strategy",
    checklist_category: "knowledge_transfer",
    urgency: "normal",
    accept: ".pdf,.docx,.pptx",
    multiple: true,
  },
  {
    id: "cms_guidance",
    label: "CMS Guidance Documents",
    description:
      "Any relevant CMS guidance, informational bulletins, or policy memos.",
    why_it_matters:
      "CMS guidance shapes what the state can and cannot require. IRIS uses these for federal compliance grounding.",
    document_type: "reference",
    document_purpose: "reference",
    checklist_category: "cms_guidance",
    urgency: "normal",
    accept: ".pdf,.docx",
    multiple: true,
  },
  {
    id: "legislative",
    label: "Legislative / Advocacy Reports",
    description:
      "Any state legislative reports, advocacy organization reports, or public data on this program.",
    why_it_matters:
      "Surfaces political and stakeholder context that evaluators care about but rarely state explicitly.",
    document_type: "other",
    document_purpose: "competitive_intel",
    checklist_category: "legislative",
    urgency: "normal",
    accept: ".pdf,.docx",
    multiple: true,
  },
  {
    id: "incumbent_performance",
    label: "Incumbent Performance Reports",
    description:
      "Any public reports, audit findings, or news coverage about the current provider's performance.",
    why_it_matters:
      "IRIS uses this for competitive intelligence — where the incumbent is vulnerable and what the state is likely dissatisfied with.",
    document_type: "other",
    document_purpose: "competitive_intel",
    checklist_category: "incumbent_performance",
    urgency: "normal",
    accept: ".pdf,.docx",
    multiple: true,
  },
  {
    id: "crosswalk",
    label: "Crosswalk or Comparison Analysis",
    description:
      "Any document comparing this RFP to prior versions, competitor approaches, or internal frameworks.",
    why_it_matters:
      "Gives IRIS structured context about what changed and what matters.",
    document_type: "other",
    document_purpose: "reference",
    checklist_category: "crosswalk",
    urgency: "low",
    accept: ".pdf,.docx,.xlsx",
  },
];

export const ALL_CHECKLIST_ITEMS = [...REQUIRED_DOCUMENTS, ...RECOMMENDED_DOCUMENTS];

export function getChecklistItemById(id: string): ChecklistItem | undefined {
  return ALL_CHECKLIST_ITEMS.find((i) => i.id === id);
}

/**
 * Fuzzy match an uploaded mission_document's title to a checklist slot when
 * `document_checklist_category` was not explicitly set.
 */
export function matchDocumentToChecklist(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes("addend") || t.includes("q&a") || t.includes("q and a") || t.includes("amendment")) return "addenda";
  if (t.includes("waiver") || t.includes("1115") || t.includes("1915")) return "waiver";
  if (t.includes("eqro") || t.includes("external quality") || t.includes("quality review")) return "eqro";
  if (t.includes("state plan") || t.includes("medicaid plan") || t.includes("familycare")) return "state_plan";
  if (t.includes("style guide") || t.includes("voice guide") || t.includes("writing guide") || t.includes("brand")) return "style_guide";
  if (t.includes("crosswalk") || t.includes("comparison")) return "crosswalk";
  if (t.includes("kickoff") || t.includes("knowledge transfer") || t.includes("background")) return "knowledge_transfer";
  if (t.includes("cms") || t.includes("bulletin")) return "cms_guidance";
  if (t.includes("legislat") || t.includes("advocacy")) return "legislative";
  if (t.includes("incumbent") || t.includes("audit")) return "incumbent_performance";
  if (t.includes("proposal") || /\bwin\b/.test(t) || /\bloss\b/.test(t) || t.includes("past response")) return "past_proposal";
  if (t.includes("rfp") || t.includes("solicitation") || t.includes("rfq")) {
    if (/(20\d{2})/.test(t) && (t.includes("prior") || t.includes("previous") || t.includes("old"))) return "prior_rfp";
    return "primary_rfp";
  }
  return null;
}
