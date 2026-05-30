import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";

type Item = {
  id: string;
  writing_implication: string | null;
  writer_acknowledged: boolean;
  question_id: string | null;
  policy_intelligence: {
    id: string;
    title: string;
    source: string;
    policy_type: string;
    summary: string | null;
    url: string | null;
    published_date: string | null;
  } | null;
};

const STORAGE_KEY = (uid: string, sid: string) => `policy-alerts-open:${uid}:${sid}`;

export function WriterPolicyAlertsPanel({
  engagementId,
  sectionId,
  userId,
}: {
  engagementId: string;
  sectionId: string;
  userId: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<boolean>(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Get question ids in this section
    const { data: qs } = await supabase
      .from("rfp_questions")
      .select("id")
      .eq("engagement_id", engagementId)
      .eq("section_id", sectionId);
    const qIds = ((qs as any[]) ?? []).map((q) => q.id);

    const select =
      "id, writing_implication, writer_acknowledged, question_id, policy_intelligence!inner(id, title, source, policy_type, summary, url, published_date)";
    const [{ data: secRows }, { data: qRows }] = await Promise.all([
      supabase
        .from("policy_section_mappings")
        .select(select)
        .eq("engagement_id", engagementId)
        .eq("section_id", sectionId)
        .is("question_id", null)
        .eq("confirmed", true),
      qIds.length
        ? supabase
            .from("policy_section_mappings")
            .select(select)
            .eq("engagement_id", engagementId)
            .in("question_id", qIds)
            .eq("confirmed", true)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const combined = [...((secRows as any[]) ?? []), ...((qRows as any[]) ?? [])];
    // dedupe by policy_id, prefer question-level
    const byPolicy = new Map<string, Item>();
    for (const row of combined as Item[]) {
      const pid = row.policy_intelligence?.id;
      if (!pid) continue;
      const existing = byPolicy.get(pid);
      if (!existing || (row.question_id && !existing.question_id)) byPolicy.set(pid, row);
    }
    setItems(Array.from(byPolicy.values()));
    setLoading(false);
  }, [engagementId, sectionId]);

  useEffect(() => {
    load();
    try {
      const v = localStorage.getItem(STORAGE_KEY(userId, sectionId));
      if (v !== null) setOpen(v === "1");
    } catch {
      /* ignore */
    }
  }, [load, userId, sectionId]);

  function toggleOpen(v: boolean) {
    setOpen(v);
    try {
      localStorage.setItem(STORAGE_KEY(userId, sectionId), v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function acknowledge(id: string, value: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, writer_acknowledged: value } : i)));
    const { error } = await supabase
      .from("policy_section_mappings")
      .update({ writer_acknowledged: value })
      .eq("id", id);
    if (error) {
      // revert
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, writer_acknowledged: !value } : i)));
      return;
    }
    // If the mapping is question-level, clear policy_flagged on the question once all
    // its mappings are acknowledged.
    const item = items.find((i) => i.id === id);
    if (value && item?.question_id) {
      const { data: remaining } = await supabase
        .from("policy_section_mappings")
        .select("id")
        .eq("question_id", item.question_id)
        .eq("writer_acknowledged", false);
      if (!remaining || remaining.length === 0) {
        await supabase
          .from("rfp_questions")
          .update({ policy_flagged: false })
          .eq("id", item.question_id);
      }
    }
  }

  if (loading || items.length === 0) return null;

  return (
    <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 to-surface p-4">
      <Collapsible open={open} onOpenChange={toggleOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between gap-2 text-left">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-bold">Policy Alerts for This Section</h3>
              <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/15 text-[10px]">
                {items.length}
              </Badge>
            </div>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-2">
          {items.map((m) => {
            const p = m.policy_intelligence!;
            return (
              <div
                key={m.id}
                className={`rounded-md border p-3 transition ${m.writer_acknowledged ? "border-border bg-surface/40 opacity-70" : "border-red-500/20 bg-surface/80"}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/15">{p.source}</Badge>
                  <Badge variant="outline">{p.policy_type}</Badge>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> source
                    </a>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold">{p.title}</p>
                {p.summary && (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{p.summary}</p>
                )}
                {m.writing_implication && (
                  <div className="mt-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Writing implication</p>
                    <p className="mt-0.5 text-xs leading-relaxed">{m.writing_implication}</p>
                  </div>
                )}
                <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={m.writer_acknowledged}
                    onCheckedChange={(v) => acknowledge(m.id, Boolean(v))}
                  />
                  <span className="text-muted-foreground">I've addressed this</span>
                </label>
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
