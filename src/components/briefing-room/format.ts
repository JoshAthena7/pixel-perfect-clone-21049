// Shared formatters for the Briefing Room.

const PROGRAM_TYPE_LABEL: Record<string, string> = {
  childrens_behavioral_health: "Children's Behavioral Health",
  medicaid_managed_care: "Medicaid Managed Care",
  ltss: "Long-Term Services and Supports",
  behavioral_health: "Behavioral Health",
};

export function formatProgramType(v: string | null | undefined): string {
  if (!v) return "";
  const k = String(v).toLowerCase();
  if (PROGRAM_TYPE_LABEL[k]) return PROGRAM_TYPE_LABEL[k];
  return k
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Win themes (and similar JSONB lists) may contain either plain strings or
// objects with a `title`/`name`/`text`/`label` field. Extract a clean string.
export function extractListText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return (
      v.title ?? v.name ?? v.theme ?? v.label ?? v.text ?? v.description ?? ""
    );
  }
  return String(v);
}
