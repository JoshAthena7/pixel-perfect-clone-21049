import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkDraftCompliance } from "@/lib/ai/compliance.functions";

type Req = {
  id: string;
  requirement_text: string;
  section_reference: string | null;
  requirement_type: string | null;
  status: "Not Mapped" | "Addressed" | "Partial" | "Gap";
  ai_quote: string | null;
  ai_explanation: string | null;
};

export function WriterCompliancePanel({
  engagementId,
  sectionId,
  sectionName,
}: {
  engagementId: string;
  sectionId: string;
  sectionName: string;
}) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("compliance_requirements")
      .select("id, requirement_text, section_reference, requirement_type, status, ai_quote, ai_explanation")
      .eq("engagement_id", engagementId)
      .contains("addressed_in_sections", [sectionName]);
    setReqs(((data as Req[]) ?? []).sort((a, b) => {
      const order = { Gap: 0, Partial: 1, "Not Mapped": 2, Addressed: 3 } as const;
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    }));
    setLoading(false);
  }, [engagementId, sectionName]);

  useEffect(() => { load(); }, [load]);

  async function check() {
    setRunning(true);
    try {
      const res = (await checkDraftCompliance({ data: { sectionId } })) as any;
      toast.success(res.message ?? `Checked ${res.checked ?? 0} requirements`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Check failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return null;
  if (reqs.length === 0) return null;

  const gaps = reqs.filter((r) => r.status === "Gap").length;
  const partial = reqs.filter((r) => r.status === "Partial").length;
  const addressed = reqs.filter((r) => r.status === "Addressed").length;

  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Compliance Requirements</p>
          {gaps > 0 && <Badge variant="destructive">{gaps} gap</Badge>}
          {partial > 0 && <Badge className="bg-amber-500">{partial} partial</Badge>}
          {addressed > 0 && <Badge className="bg-emerald-500">{addressed} addressed</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={check} disabled={running}>
          {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Check my draft
        </Button>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {reqs.map((r) => {
          const tone =
            r.status === "Addressed" ? "border-l-emerald-500 bg-emerald-500/5" :
            r.status === "Partial" ? "border-l-amber-500 bg-amber-500/5" :
            r.status === "Gap" ? "border-l-red-500 bg-red-500/5" : "border-l-muted bg-muted/20";
          return (
            <div key={r.id} className={`rounded border-l-2 ${tone} pl-2 py-1.5 pr-2`}>
              <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                {r.requirement_type && <Badge variant="outline" className="h-3.5 text-[9px]">{r.requirement_type}</Badge>}
                {r.section_reference && <span className="text-[9px] font-mono text-muted-foreground">{r.section_reference}</span>}
                <Badge variant="outline" className="h-3.5 text-[9px]">{r.status}</Badge>
              </div>
              <p className="text-xs leading-snug">{r.requirement_text}</p>
              {r.ai_quote && r.status === "Addressed" && (
                <p className="text-[10px] italic text-emerald-700 mt-1">✓ "{r.ai_quote}"</p>
              )}
              {r.ai_explanation && r.status !== "Addressed" && (
                <p className="text-[10px] italic text-muted-foreground mt-1">{r.ai_explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
