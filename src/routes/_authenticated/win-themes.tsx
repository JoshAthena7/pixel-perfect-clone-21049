import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Watermark } from "@/components/war-room/Watermark";

export const Route = createFileRoute("/_authenticated/win-themes")({
  head: () => ({ meta: [{ title: "Win Themes — Athena" }] }),
  component: LeadWinThemes,
});

type Section = { id: string; section_name: string };

function LeadWinThemes() {
  const { engagement, isLeadership } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const sectionMap = useMemo(
    () => Object.fromEntries(sectionsList.map((s) => [s.id, s.section_name])),
    [sectionsList],
  );

  async function load() {
    if (!engagement) return;
    const [{ data: themes }, { data: secs }] = await Promise.all([
      supabase.from("win_themes").select("*").eq("engagement_id", engagement.id).order("created_at", { ascending: false }),
      supabase.from("heatmap_sections").select("id, section_name").eq("engagement_id", engagement.id).order("sort_order"),
    ]);
    setItems(themes ?? []);
    setSectionsList((secs ?? []) as Section[]);
  }
  useEffect(() => { load(); }, [engagement?.id]);

  function toggleSection(id: string) {
    setSelectedIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !title.trim()) return;
    const { error } = await supabase.from("win_themes").insert({
      engagement_id: engagement.id, title: title.trim(), description: description || null, section_ids: selectedIds,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setDescription(""); setSelectedIds([]);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("win_themes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <Watermark />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Win Themes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Themes writers should land in every section.</p>
      </div>
      {isLeadership && (
        <Card className="border-border bg-surface p-4">
          <form onSubmit={add} className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Health equity leadership" /></div>
            <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div>
              <Label>Applies to sections</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {sectionsList.map((s) => {
                  const on = selectedIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSection(s.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
                    >
                      {s.section_name}
                    </button>
                  );
                })}
                {sectionsList.length === 0 && <span className="text-xs text-muted-foreground">No sections yet.</span>}
              </div>
            </div>
            <Button type="submit" disabled={!title.trim()}>Add theme</Button>
          </form>
        </Card>
      )}
      {items.map((t) => {
        const names = (t.section_ids ?? []).map((id: string) => sectionMap[id]).filter(Boolean);
        return (
          <Card key={t.id} className="border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.description && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</div>}
                {names.length > 0 && (
                  <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Applies to: {names.join(", ")}</div>
                )}
              </div>
              {isLeadership && <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
