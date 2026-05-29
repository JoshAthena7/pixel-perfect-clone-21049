import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/writer/decisions")({
  head: () => ({ meta: [{ title: "Decisions — Writer Portal" }] }),
  component: WriterDecisions,
});

function WriterDecisions() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [section, setSection] = useState<string>("All");

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("decisions")
      .select("*")
      .eq("engagement_id", engagement.id)
      .order("decision_date", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [engagement?.id]);

  const sections = useMemo(() => {
    const set = new Set<string>();
    items.forEach((d) => {
      (d.impacted_areas || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .forEach((s: string) => set.add(s));
    });
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  const visible = section === "All"
    ? items
    : items.filter((d) => (d.impacted_areas || "").toLowerCase().includes(section.toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Decisions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Key decisions logged by leadership.</p>
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          {sections.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No decisions to show.</Card>
      ) : (
        visible.map((d) => (
          <Card key={d.id} className="border-border bg-surface p-4">
            <div className="text-sm font-semibold">{d.title}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Made by {d.owner_name || "—"} · {d.decision_date ? format(new Date(d.decision_date), "MMM d, yyyy") : ""}
            </div>
            {d.rationale && <div className="mt-3 text-sm text-foreground whitespace-pre-wrap">{d.rationale}</div>}
            {d.impacted_areas && (
              <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Impacts: {d.impacted_areas}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
