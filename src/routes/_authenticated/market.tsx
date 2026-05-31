import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({ meta: [{ title: "Market Intelligence — Athena" }] }),
  component: () => <Navigate to="/intel" replace />,
});

type Item = { id: string; source: string; title: string; summary: string | null; url: string | null; relevant_states: string[]; relevant_categories: string[]; published_at: string | null; ingested_at: string };
type Target = { id: string; target_type: "competitor" | "state" | "keyword"; value: string };

function MarketPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [newType, setNewType] = useState<"keyword" | "competitor" | "state">("keyword");
  const [newVal, setNewVal] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from("market_intelligence").select("*").order("ingested_at", { ascending: false }).limit(80),
      supabase.from("monitoring_targets").select("*").order("created_at", { ascending: false }),
    ]);
    setItems((m as any) ?? []);
    setTargets((t as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addTarget() {
    if (!newVal.trim()) return;
    const { error } = await supabase.from("monitoring_targets").insert({ target_type: newType, value: newVal.trim() });
    if (error) return toast.error(error.message);
    setNewVal("");
    load();
  }
  async function removeTarget(id: string) {
    const { error } = await supabase.from("monitoring_targets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Globe className="h-5 w-5 text-primary" /> Market Intelligence</h1>
        <p className="text-sm text-muted-foreground">External signals — government press, policy, and your monitoring targets.</p>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Monitoring targets</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {targets.length === 0 && <p className="text-xs text-muted-foreground">No targets yet. Add competitors, keywords, or states to track.</p>}
          {targets.map((t) => (
            <Badge key={t.id} variant="outline" className="gap-2 py-1">
              <span className="text-xs uppercase text-muted-foreground">{t.target_type}</span>
              {t.value}
              <button onClick={() => removeTarget(t.id)} className="ml-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Select value={newType} onValueChange={(v) => setNewType(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keyword</SelectItem>
              <SelectItem value="competitor">Competitor</SelectItem>
              <SelectItem value="state">State</SelectItem>
            </SelectContent>
          </Select>
          <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="e.g. Centene, Medicaid waiver, TX" />
          <Button onClick={addTarget}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Recent signals</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No market intel yet. The ingestion hook runs hourly via cron.</Card>
        ) : (
          <div className="space-y-3">
            {items.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">{i.source}</Badge>
                  {i.relevant_states?.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  {i.relevant_categories?.map((c) => <Badge key={c} className="text-xs">{c}</Badge>)}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(i.published_at ?? i.ingested_at).toLocaleDateString()}</span>
                </div>
                <h3 className="font-semibold">{i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.title}</a> : i.title}</h3>
                {i.summary && <p className="mt-1 text-sm text-muted-foreground">{i.summary.slice(0, 400)}{i.summary.length > 400 ? "…" : ""}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
