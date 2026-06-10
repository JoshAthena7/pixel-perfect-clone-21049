import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateCompetitiveLandscape, regenerateCompetitorProfile } from "@/lib/oracle.functions";
import type { Database } from "@/integrations/supabase/types";

type Competitor = Database["public"]["Tables"]["competitor_profiles"]["Row"];

const TYPE_COLOR: Record<string, string> = {
  incumbent: "#C0392B",
  likely_bidder: "#D4800A",
  possible_bidder: "#94A3B8",
  dark_horse: "#5D6D7E",
};

export function OracleCompetitors({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [landscape, setLandscape] = useState<string>("");
  const [landscapeLoaded, setLandscapeLoaded] = useState(false);
  const summary = useServerFn(generateCompetitiveLandscape);
  const regen = useServerFn(regenerateCompetitorProfile);

  const { data: comps = [] } = useQuery({
    queryKey: ["oracle-competitors", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("competitor_profiles").select("*").eq("mission_id", missionId).order("created_at", { ascending: false });
      return (data ?? []) as Competitor[];
    },
  });

  useEffect(() => {
    if (landscapeLoaded || comps.length < 2) return;
    setLandscapeLoaded(true);
    summary({ data: { missionId } }).then((r) => setLandscape(r.summary)).catch(() => undefined);
  }, [comps.length, landscapeLoaded, missionId, summary]);

  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const removeComp = async (id: string) => {
    if (!confirm("Remove competitor?")) return;
    await supabase.from("competitor_profiles").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["oracle-competitors", missionId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Competitive Landscape</h2>
      </div>

      {comps.length >= 2 && landscape && (
        <div className="rounded-lg border-2 border-[#C9A55C] bg-card p-4">
          <div className="text-xs font-semibold text-[#C9A55C] uppercase tracking-wider mb-2">IRIS Landscape Summary</div>
          <p className="text-sm">{landscape}</p>
        </div>
      )}
      {comps.length < 2 && (
        <div className="rounded border bg-card p-4 text-sm text-muted-foreground">
          Add at least 2 competitors to generate the IRIS competitive landscape summary.
        </div>
      )}

      {comps.length === 0 ? (
        <div className="rounded border bg-card p-6 text-center text-sm text-muted-foreground">
          No competitors identified yet. Add competitors to see IRIS competitive intelligence.
        </div>
      ) : (
        <div className="space-y-3">
          {comps.map((c) => {
            const isOpen = expanded.has(c.id);
            const vflags = Array.isArray(c.vulnerability_flags) ? (c.vulnerability_flags as string[]) : [];
            const recent = Array.isArray(c.recent_intelligence) ? (c.recent_intelligence as { headline?: string; date?: string; url?: string }[]) : [];
            return (
              <div key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{c.organization_name}</h3>
                      <Badge variant="outline" className="text-[10px]">conf: {c.iris_confidence}</Badge>
                    </div>
                    {c.likely_narrative && <p className="italic text-sm mt-2 text-muted-foreground">{c.likely_narrative}</p>}
                  </div>
                  <Badge style={{ background: TYPE_COLOR[c.competitor_type] ?? "#888", color: "#fff" }} className="text-[10px]">
                    {c.competitor_type.replace("_", " ")}
                  </Badge>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1">Strengths</div>
                        <p className="text-sm text-muted-foreground">{c.known_strengths || "—"}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1">Weaknesses</div>
                        <p className="text-sm text-muted-foreground">{c.known_weaknesses || "—"}</p>
                      </div>
                    </div>
                    {c.differentiation_strategy && (
                      <div className="border-l-4 border-[#C9A55C] pl-3 py-2 bg-muted/30">
                        <div className="text-xs font-semibold mb-1">Differentiation Strategy</div>
                        <p className="text-sm">{c.differentiation_strategy}</p>
                      </div>
                    )}
                    {vflags.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold mb-1">Vulnerability Flags</div>
                        <div className="flex flex-wrap gap-1">
                          {vflags.map((v, i) => <Badge key={i} className="bg-[#D4800A]/20 text-[#D4800A] border-[#D4800A] text-[10px]">{v}</Badge>)}
                        </div>
                      </div>
                    )}
                    {recent.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold mb-1">Recent Intelligence</div>
                        <div className="text-xs">
                          {recent[0].headline}{recent[0].date ? ` (${recent[0].date})` : ""}
                          {recent[0].url && <> · <a href={recent[0].url} target="_blank" rel="noreferrer" className="underline">source</a></>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => toggle(c.id)}>{isOpen ? "Collapse" : "Expand"}</Button>
                  <Button size="sm" variant="outline" onClick={async () => { try { await regen({ data: { competitorId: c.id } }); toast.success("IRIS regenerated profile"); qc.invalidateQueries({ queryKey: ["oracle-competitors", missionId] }); } catch (e) { toast.error((e as Error).message); } }}>Regenerate IRIS Profile</Button>
                  <Button size="sm" variant="ghost" onClick={() => removeComp(c.id)}>Remove</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
