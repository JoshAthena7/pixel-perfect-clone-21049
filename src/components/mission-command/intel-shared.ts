// Shared types & helpers for the Intelligence tabs.
export const DOC_TYPES = [
  { value: "primary_rfp", label: "Primary RFP" },
  { value: "amendment", label: "Amendment" },
  { value: "attachment", label: "Attachment / Appendix" },
  { value: "scoring_criteria", label: "Scoring Criteria" },
  { value: "prior_qa", label: "Prior Q&A" },
  { value: "research", label: "Research" },
  { value: "media_url", label: "Media / URL" },
  { value: "manual_note", label: "Manual Note" },
  { value: "other", label: "Other" },
] as const;

export const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((t) => [t.value, t.label]),
);

export const DOC_TYPE_GROUP_ORDER = [
  "primary_rfp",
  "amendment",
  "attachment",
  "scoring_criteria",
  "prior_qa",
  "research",
  "other",
] as const;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

export function isValidUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}
