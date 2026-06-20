// Shared helpers used by ExecutiveSummary + IntelSidebar.

export function coverageSentence(approvedCount: number): string {
  if (approvedCount === 0)
    return "ORACLE is empty. Process your RFP in the Setup Wizard to activate IRIS briefings.";
  if (approvedCount < 10)
    return `Early coverage — ${approvedCount} of ~50 key items loaded. IRIS briefs are drawing from general knowledge.`;
  if (approvedCount < 30)
    return `Building coverage — ${approvedCount} items loaded. IRIS briefs have partial grounding.`;
  return `Strong coverage — ${approvedCount} items loaded. IRIS briefs are well-grounded.`;
}

export function coveragePercent(approvedCount: number): number {
  return Math.min(100, Math.round((approvedCount / 50) * 100));
}

export const GOLD = "#C49A2B";

export type SectionId =
  | "summary"
  | "signals"
  | "stakeholders"
  | "competitive"
  | "evidence"
  | "sources"
  | "gaps";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "signals", label: "Signals" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "competitive", label: "Competitive" },
  { id: "evidence", label: "Evidence" },
  { id: "sources", label: "Sources" },
  { id: "gaps", label: "Gaps" },
];
