import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { getUserExpertise } from "@/lib/expertise.functions";
import { CATEGORY_META, CUSTOM_COLOR } from "./category-meta";

type Props = {
  userId: string;
  interactive?: boolean; // if true, clicking a chip navigates to discovery
};

export function ExpertiseChipsReadOnly({ userId, interactive = true }: Props) {
  const navigate = useNavigate();
  const getUserExp = useServerFn(getUserExpertise);
  const { data, isLoading } = useQuery({
    queryKey: ["user-expertise", userId],
    queryFn: () => getUserExp({ data: { userId } }),
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading expertise…</p>;
  }

  const all: Array<{
    key: string;
    label: string;
    color: string;
    isPrimary: boolean;
    expertiseId: string | null;
  }> = [];

  for (const s of data?.structured ?? []) {
    all.push({
      key: s.expertise_id,
      label: s.label,
      color: CATEGORY_META[s.category].color,
      isPrimary: s.is_primary,
      expertiseId: s.expertise_id,
    });
  }
  for (const c of data?.custom ?? []) {
    all.push({
      key: `custom:${c.custom_label.toLowerCase()}`,
      label: c.custom_label,
      color: CUSTOM_COLOR,
      isPrimary: c.is_primary,
      expertiseId: null,
    });
  }

  if (all.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No expertise listed yet.</p>;
  }

  const primaries = all.filter((c) => c.isPrimary);
  const secondaries = all.filter((c) => !c.isPrimary);

  function clickChip(expertiseId: string | null) {
    if (!interactive || !expertiseId) return;
    navigate({ to: "/atrium", search: { expertise: expertiseId } as any });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {primaries.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => clickChip(c.expertiseId)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-transform hover:scale-105"
            style={{ backgroundColor: c.color }}
            disabled={!interactive || !c.expertiseId}
          >
            <Star className="h-2.5 w-2.5 fill-white text-white" />
            {c.label}
          </button>
        ))}
        {secondaries.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => clickChip(c.expertiseId)}
            className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-foreground transition-transform hover:scale-105 ${
              c.expertiseId ? "" : "border-dashed"
            }`}
            style={{ borderColor: c.color }}
            disabled={!interactive || !c.expertiseId}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label}
          </button>
        ))}
      </div>
      {interactive && (
        <p className="text-[11px] text-muted-foreground">
          Primary areas shown in filled chips. Click any structured chip to find others with this expertise.
        </p>
      )}
    </div>
  );
}
