import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/writer/win-themes")({
  head: () => ({ meta: [{ title: "Win Themes — Writer Portal" }] }),
  component: WriterWinThemes,
});

function WriterWinThemes() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [section, setSection] = useState("All");

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("win_themes")
      .select("*")
      .eq("engagement_id", engagement.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [engagement?.id]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    items.forEach((t) => (t.section_names || []).forEach((x: string) => s.add(x)));
    return ["All", ...Array.from(s).sort()];
  }, [items]);
  const visible = section === "All" ? items : items.filter((t) => (t.section_names || []).includes(section));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Win Themes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            These are the messages AmeriHealth needs to land in every section. Reference them before you write.
          </p>
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {visible.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No win themes yet.</Card>
      ) : (
        visible.map((t) => (
          <Card key={t.id} className="border-border bg-surface p-4">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.description && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</div>}
            {(t.section_names ?? []).length > 0 && (
              <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Applies to: {(t.section_names || []).join(", ")}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
