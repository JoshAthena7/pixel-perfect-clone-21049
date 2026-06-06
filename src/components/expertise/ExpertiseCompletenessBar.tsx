import type { ExpertiseCategory, LibraryItem } from "@/lib/expertise.functions";
import type { DisplayChip } from "./ExpertiseChips";
import { CATEGORY_META, CATEGORY_ORDER } from "./category-meta";

type Props = {
  chips: DisplayChip[];
  library: LibraryItem[];
};

export function ExpertiseCompletenessBar({ chips, library }: Props) {
  const structuredCount = chips.filter((c) => c.category !== null).length;
  const primaryCount = chips.filter((c) => c.isPrimary).length;

  // categories with at least one selection (structured)
  const categoriesCovered = new Set<ExpertiseCategory>();
  for (const c of chips) if (c.category) categoriesCovered.add(c.category);

  let pct = 0;
  if (structuredCount >= 1) pct += 25;
  if (structuredCount >= 3) pct += 25;
  if (primaryCount >= 1) pct += 15;
  if (primaryCount >= 3) pct += 15;
  pct += Math.min(20, categoriesCovered.size * 5);

  const missingCategory = CATEGORY_ORDER.find((c) => !categoriesCovered.has(c));

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-foreground">Expertise Profile</div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{Math.min(100, pct)}% complete</span>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <li>
          {structuredCount >= 3 ? "✓" : "○"} Structured expertise added ({structuredCount})
        </li>
        <li>
          {primaryCount >= 3 ? "✓" : "○"} Primary expertise selected ({primaryCount} of 5)
        </li>
        {missingCategory && (
          <li>
            ○ Consider adding {CATEGORY_META[missingCategory].label} expertise (none selected)
          </li>
        )}
      </ul>
    </div>
  );
}
