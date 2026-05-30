import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Shield, ShieldAlert, ShieldCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkDraftCompliance } from "@/lib/ai/compliance.functions";

type Req = {
  id: string;
  document_id: string;
  requirement_text: string;
  section_reference: string | null;
  requirement_type: string | null;
  status: "Not Mapped" | "Addressed" | "Partial" | "Gap";
  addressed_in_sections: string[];
};
type Doc = { id: string; name: string; source: string | null; doc_type: string };
type Section = { id: string; section_name: string };

export function CompliancePanel({
  engagementId,
  isLeadership = false,
}: {
  engagementId: string;
  isLeadership?: boolean;
}) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: d }, { data: s }] = await Promise.all([
      supabase
        .from("compliance_requirements")
        .select("id, document_id, requirement_text, section_reference, requirement_type, status, addressed_in_sections")
        .eq("engagement_id", engagementId),
      supabase
        .from("compliance_documents")
        .select("id, name, source, doc_type")
        .eq("engagement_id", engagementId),
      supabase
        .from("heatmap_sections")
        .select("id, section_name")
        .eq("engagement_id", engagementId)
        .order("sort_order"),
    ]);
    setReqs((r as Req[]) ?? []);
    setDocs((d as Doc[]) ?? []);
    const secs = (s as Section[]) ?? [];
    setSections(secs);
    if (!activeSection && secs[0]) setActiveSection(secs[0].section_name);
    setLoading(false);
  }, [engagementId, activeSection]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`compliance-panel:${engagementId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "compliance_requirements", filter: `engagement_id=eq.${engagementId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagementId, load]);

  const sectionReqs = useMemo(() => {
    if (!activeSection) return [];
    return reqs
      .filter((r) => r.addressed_in_sections.includes(activeSection))
      .sort((a, b) => {
        const order = { Gap: 0, Partial: 1, "Not Mapped": 2, Addressed: 3 } as const;
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
  }, [reqs, activeSection]);

  const score = useMemo(() => {
    const mapped = sectionReqs.filter((r) => r.status !== "Not Mapped");
    if (!mapped.length) return null;
    return Math.round((mapped.filter((r) => r.status === "Addressed").length / mapped.length) * 100);
  }, [sectionReqs]);

  const grouped = useMemo(() => {
    const map = new Map<string, Req[]>();
    for (const r of sectionReqs) {
      const doc = docs.find((d) => d.id === r.document_id);
      const key = doc?.source ?? doc?.doc_type ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [sectionReqs, docs]);

  async function runCheck() {
    if (!activeSection) return;
    const sec = sections.find((s) => s.section_name === activeSection);
    if (!sec) return;
    setRunning(true);
    try {
      const res = (await checkDraftCompliance({ data: { sectionId: sec.id } })) as any;
      toast.success(res.message ?? `Checked ${res.checked ?? 0} requirements`);
    } catch (e: any) {
      toast.error(e.message ?? "Check failed");
    } finally {
      setRunning(false);
      load();
    }
  }

  const totalReqs = reqs.length;
  if (totalReqs === 0 && !loading) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center">
        <Shield className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No compliance requirements yet.</p>
        <Link to="/engagement/$id/compliance" params={{ id: engagementId }} className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
          Open Compliance Matrix <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Compliance</p>
          {score !== null && (
            <Badge className={score >= 85 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}>
              {score}%
            </Badge>
          )}
        </div>
        <Link to="/engagement/$id/compliance" params={{ id: engagementId }} className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
          Open Matrix <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {sections.map((s) => {
          const ct = reqs.filter((r) => r.addressed_in_sections.includes(s.section_name)).length;
          const gaps = reqs.filter((r) => r.addressed_in_sections.includes(s.section_name) && r.status === "Gap").length;
          if (ct === 0) return null;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.section_name)}
              className={`shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap ${
                activeSection === s.section_name ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.section_name} {gaps > 0 && <span className="text-red-500 font-bold">·{gaps}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : sectionReqs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No requirements mapped to this section.</p>
      ) : (
        <>
          {isLeadership && (
            <Button size="sm" variant="outline" className="w-full mb-3" onClick={runCheck} disabled={running}>
              {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Run AI Check on Drafts
            </Button>
          )}
          <div className="space-y-3">
            {grouped.map(([sourceLabel, rs]) => (
              <div key={sourceLabel}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{sourceLabel}</p>
                <div className="space-y-1.5">
                  {rs.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded border border-border bg-background/60 p-2">
                      <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        r.status === "Addressed" ? "bg-emerald-500" :
                        r.status === "Partial" ? "bg-amber-500" :
                        r.status === "Gap" ? "bg-red-500" : "bg-muted-foreground/40"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap mb-0.5">
                          {r.requirement_type && <Badge variant="outline" className="h-3.5 text-[8px]">{r.requirement_type}</Badge>}
                          {r.section_reference && <span className="text-[9px] font-mono text-muted-foreground">{r.section_reference}</span>}
                        </div>
                        <p className="text-xs leading-snug line-clamp-2">{r.requirement_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
