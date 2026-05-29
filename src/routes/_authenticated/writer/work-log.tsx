import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/writer/work-log")({
  head: () => ({ meta: [{ title: "Work Log — Writer Portal" }] }),
  component: WriterWorkLog,
});

function WriterWorkLog() {
  const { engagement } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [desc, setDesc] = useState("");
  const [section, setSection] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!engagement || !user) return;
    const { data } = await supabase
      .from("work_log")
      .select("*")
      .eq("engagement_id", engagement.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, [engagement?.id, user?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !desc.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("work_log").insert({
      engagement_id: engagement.id,
      user_id: user.id,
      description: desc.trim(),
      section: section || null,
      time_spent: time || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setDesc(""); setSection(""); setTime("");
    toast.success("Logged");
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use this as a reference when submitting time in Talent Desk. Visible only to you.</p>
      </div>
      <Card className="border-border bg-surface p-4">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>What did you work on?</Label>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe what you did…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Section</Label>
              <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. LTSS" />
            </div>
            <div>
              <Label>Time spent</Label>
              <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 2h" />
            </div>
          </div>
          <Button type="submit" disabled={saving || !desc.trim()}>{saving ? "Saving…" : "Log entry"}</Button>
        </form>
      </Card>
      {items.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No entries yet.</Card>
      ) : (
        items.map((it) => (
          <Card key={it.id} className="border-border bg-surface p-4">
            <div className="text-sm whitespace-pre-wrap">{it.description}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {it.section && <>{it.section} · </>}
              {it.time_spent && <>{it.time_spent} · </>}
              {format(new Date(it.created_at), "MMM d, yyyy h:mm a")}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
