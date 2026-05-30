import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "Intelligence Insights — Athena" }] }),
  component: InsightsPage,
});

type Insight = {
  id: string;
  engagement_id: string | null;
  insight_type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  confidence_score: number;
  actioned: boolean;
  created_at: string;
};

function severityIcon(sev: string) {
  if (sev === "critical") return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (sev === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <Info className="h-4 w-4 text-primary" />;
}

function InsightsPage() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  async function load() {
    setLoading(true);
    let q = supabase.from("intelligence_insights").select("*").order("created_at", { ascending: false }).limit(100);
    if (engagement) q = q.or(`engagement_id.eq.${engagement.id},engagement_id.is.null`);
    if (filter === "open") q = q.eq("actioned", false);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [engagement?.id, filter]);

  async function markActioned(id: string) {
    const { error } = await supabase.from("intelligence_insights").update({ actioned: true, actioned_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked as actioned");
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-primary" /> Athena Insights</h1>
          <p className="text-sm text-muted-foreground">Pattern-recognition signals across your engagement(s).</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === "open" ? "default" : "outline"} size="sm" onClick={() => setFilter("open")}>Open</Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>All</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No insights yet. They appear as Athena detects patterns.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <Card key={i.id} className={`p-4 ${i.actioned ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                {severityIcon(i.severity)}
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{i.title}</h3>
                    <Badge variant="outline" className="text-xs">{i.insight_type.replace(/_/g, " ")}</Badge>
                    <Badge variant="secondary" className="text-xs">{Math.round(i.confidence_score * 100)}% conf</Badge>
                    {i.engagement_id === null && <Badge className="text-xs">firm-wide</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.body}</p>
                  <p className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</p>
                </div>
                {!i.actioned && (
                  <Button size="sm" variant="outline" onClick={() => markActioned(i.id)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Actioned
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
