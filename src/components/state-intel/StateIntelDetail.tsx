import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  getStateIntelPack,
  markStatePackReviewed,
} from "@/lib/state-intel/state-intel.functions";
import { STATE_INTEL_CATEGORIES, TOTAL_CATEGORIES } from "@/lib/state-intel/categories";
import { CategorySection } from "./CategorySection";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function StateIntelDetail({ stateCode }: { stateCode: string }) {
  const get = useServerFn(getStateIntelPack);
  const mark = useServerFn(markStatePackReviewed);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["state-intel-pack", stateCode],
    queryFn: () => get({ data: { stateCode } }),
  });

  const reviewMut = useMutation({
    mutationFn: () => mark({ data: { stateCode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["state-intel-pack", stateCode] });
      qc.invalidateQueries({ queryKey: ["state-intel-packs"] });
      toast.success("Marked reviewed");
    },
  });

  const byCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of data?.documents ?? []) {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    }
    return map;
  }, [data]);

  const filledCount = Object.values(byCategory).filter((arr) =>
    arr.some((d) => d.is_current),
  ).length;

  if (isLoading) {
    return <div className="px-6 py-6 text-white/55 text-[14px]">Loading…</div>;
  }
  if (!data?.pack) {
    return (
      <div className="px-6 py-6">
        <Link to="/admin/state-intel" className="text-[14px] text-white/60 hover:text-white inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="mt-6 text-white/60">State pack not found.</div>
      </div>
    );
  }

  const pack = data.pack;

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <Link to="/admin/state-intel" className="text-[12px] text-white/55 hover:text-white inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> All states
      </Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-mono text-[#c9a84c]">{pack.state_code}</span>
            <h1 className="text-xl font-medium text-white">{pack.state_name}</h1>
          </div>
          <div className="text-[14px] text-white/55 mt-1">
            {filledCount} of {TOTAL_CATEGORIES} categories with current documents
            {pack.last_reviewed_at && (
              <> · reviewed {new Date(pack.last_reviewed_at).toLocaleDateString()}</>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reviewMut.mutate()}
          disabled={reviewMut.isPending}
          className="gap-2"
        >
          <CheckCircle2 className="w-4 h-4" /> Mark reviewed
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          {STATE_INTEL_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              stateCode={stateCode}
              documents={byCategory[cat.id] ?? []}
            />
          ))}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-[12px] font-medium text-white/55 tracking-wide mb-2">
              Missions inheriting this pack
            </h3>
            {data.missions.length === 0 ? (
              <p className="text-[12px] text-white/45">No active missions in this state.</p>
            ) : (
              <ul className="space-y-2">
                {data.missions.map((m: any) => (
                  <li key={m.id}>
                    <Link
                      to="/missions/$missionId"
                      params={{ missionId: m.id }}
                      className="text-[14px] text-white/80 hover:text-white block truncate"
                    >
                      {m.name}
                      <span className="text-[11px] text-white/40 ml-2">{m.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
