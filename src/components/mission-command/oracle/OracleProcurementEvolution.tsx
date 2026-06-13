import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Evo = Database["public"]["Tables"]["procurement_evolution_records"]["Row"];

export function OracleProcurementEvolution({ missionId }: { missionId: string }) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["oracle-evo", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("procurement_evolution_records").select("*").eq("mission_id", missionId).maybeSingle();
      return data as Evo | null;
    },
    refetchInterval: (q) => (q.state.data?.analysis_completed_at ? false : 5000),
  });

  if (isLoading) return <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin h-5 w-5" /></div>;

  if (!data) {
    return (
      <div className="rounded border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No procurement evolution analysis yet. Upload a prior RFP in your Intelligence Loadout to generate this analysis.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: 1 } as never })}>Go to Intelligence Loadout</Button>
      </div>
    );
  }

  if (!data.analysis_completed_at) {
    return (
      <div className="rounded border bg-card p-8 text-center">
        <div className="text-2xl animate-pulse">✦</div>
        <p className="text-sm mt-2">Procurement Evolution Analysis is being generated. This may take a few minutes.</p>
      </div>
    );
  }

  const material = Array.isArray(data.material_changes) ? (data.material_changes as Record<string, unknown>[]) : [];
  const sections = Array.isArray(data.new_sections) ? (data.new_sections as Record<string, unknown>[]) : [];
  const tightened = Array.isArray(data.tightened_requirements) ? (data.tightened_requirements as Record<string, unknown>[]) : [];
  const scoring = Array.isArray(data.scoring_changes) ? (data.scoring_changes as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Procurement Evolution Analysis</h2>
        <div className="text-xs text-muted-foreground mt-1">Completed {new Date(data.analysis_completed_at).toLocaleString()}</div>
        {data.iris_summary && <p className="text-sm mt-3">{data.iris_summary}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Material Changes" count={material.length}>
          {material.map((c, i) => (
            <div key={i} className="border-l-2 border-primary/30 pl-2 py-1 text-xs">
              <Badge variant="outline" className="text-[10px]">{String(c.change_type ?? "Change")}</Badge>
              <div className="mt-1">{String(c.description ?? "")}</div>
              {Boolean(c.prior_version) && <div className="text-muted-foreground"><strong>Prior:</strong> {String(c.prior_version)}</div>}
              {Boolean(c.current_version) && <div className="text-muted-foreground"><strong>Current:</strong> {String(c.current_version)}</div>}
              {Boolean(c.significance) && <div className="text-[10px] italic mt-1">{String(c.significance)}</div>}
            </div>
          ))}
        </Card>

        <Card title="New Sections Added" count={sections.length}>
          {sections.map((s, i) => (
            <div key={i} className="text-xs py-1">
              <div className="font-medium">{String(s.name ?? "Section")}</div>
              {Boolean(s.description) && <div className="text-muted-foreground">{String(s.description)}</div>}
              {Boolean(s.signal) && <div className="italic text-[#C9A55C] mt-1">{String(s.signal)}</div>}
            </div>
          ))}
        </Card>

        <Card title="Requirements That Got Stricter" count={tightened.length} amber>
          {tightened.map((t, i) => (
            <div key={i} className="text-xs py-1">
              <div className="font-medium">{String(t.requirement ?? "Requirement")}</div>
              {Boolean(t.what_changed) && <div className="text-muted-foreground">{String(t.what_changed)}</div>}
              {Boolean(t.signal) && <div className="italic text-[#C9A55C] mt-1">{String(t.signal)}</div>}
            </div>
          ))}
        </Card>

        <Card title="Scoring Weight Changes" count={scoring.length}>
          {scoring.map((s, i) => (
            <div key={i} className="text-xs py-1">
              <div className="font-medium">{String(s.section ?? "Section")}</div>
              <div>{String(s.old_weight ?? "?")} → {String(s.new_weight ?? "?")}</div>
              {Boolean(s.significance) && <div className="italic mt-1">{String(s.significance)}</div>}
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.iris_signals && (
          <div className="rounded border-l-4 border-[#C9A55C] bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2">What These Changes Signal</div>
            <p className="text-sm">{data.iris_signals}</p>
          </div>
        )}
        {data.iris_recommendations && (
          <div className="rounded border-l-4 border-primary bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2">What You Should Do Differently</div>
            <p className="text-sm">{data.iris_recommendations}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, count, amber, children }: { title: string; count: number; amber?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${amber ? "border-[#D4800A]/60" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${amber ? "text-[#D4800A]" : ""}`}>{title}</h3>
        <Badge variant="outline">{count}</Badge>
      </div>
      <div className="space-y-2">
        {count === 0 ? <div className="text-xs text-muted-foreground italic">None</div> : children}
      </div>
    </div>
  );
}
