import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/win-themes")({
  head: () => ({ meta: [{ title: "Win Themes — Athena" }] }),
  component: LeadWinThemes,
});

function LeadWinThemes() {
  const { engagement, isLeadership } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState("");

  async function load() {
    if (!engagement) return;
    const { data } = await supabase.from("win_themes").select("*").eq("engagement_id", engagement.id).order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, [engagement?.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !title.trim()) return;
    const section_names = sections.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("win_themes").insert({
      engagement_id: engagement.id, title: title.trim(), description: description || null, section_names,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setDescription(""); setSections("");
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("win_themes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Win Themes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Themes writers should land in every section.</p>
      </div>
      {isLeadership && (
        <Card className="border-border bg-surface p-4">
          <form onSubmit={add} className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Health equity leadership" /></div>
            <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div><Label>Applies to sections (comma-separated)</Label><Input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="LTSS, Quality" /></div>
            <Button type="submit" disabled={!title.trim()}>Add theme</Button>
          </form>
        </Card>
      )}
      {items.map((t) => (
        <Card key={t.id} className="border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</div>}
              {(t.section_names ?? []).length > 0 && (
                <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Applies to: {t.section_names.join(", ")}</div>
              )}
            </div>
            {isLeadership && <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        </Card>
      ))}
    </div>
  );
}
