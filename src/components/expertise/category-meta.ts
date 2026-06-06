import type { ExpertiseCategory } from "@/lib/expertise.functions";

export const CATEGORY_META: Record<
  ExpertiseCategory,
  { label: string; short: string; color: string; order: number }
> = {
  "programs-populations": { label: "Programs & Populations", short: "Programs", color: "#6366F1", order: 1 },
  functional: { label: "Functional Expertise", short: "Functional", color: "#3B82F6", order: 2 },
  "procurement-market": { label: "Procurement & Market Expertise", short: "Market", color: "#10B981", order: 3 },
  leadership: { label: "Leadership Experience", short: "Leadership", color: "#F59E0B", order: 4 },
};

export const CATEGORY_ORDER: ExpertiseCategory[] = [
  "programs-populations",
  "functional",
  "procurement-market",
  "leadership",
];

export const CUSTOM_COLOR = "#94A3B8";
