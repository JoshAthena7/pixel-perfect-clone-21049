import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/section-assignments")({
  head: () => ({ meta: [{ title: "Section Assignments — Athena" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ section: typeof s.section === "string" ? s.section : undefined }),
  component: SectionAssignments,
});

function SectionAssignments() {
  const { engagement, isLeadership } = useEngagement();
  const { section: presetSection } = Route.useSearch();
  const [sections, setSections] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState(presetSection ?? "");
  const [userId, setUserId] = useState("");
  const [due, setDue] = useState("");

  useEffect(() => { if (presetSection) setSectionId(presetSection); }, [presetSection]);


  async function load() {
    if (!engagement) return;
    const [{ data: s }, { data: m }, { data: a }] = await Promise.all([
      supabase.from("heatmap_sections").select("id, section_name, sensitivity").eq("engagement_id", engagement.id).order("sort_order"),
      supabase.from("engagement_members").select("user_id, display_name, role").eq("engagement_id", engagement.id),
      supabase.from("section_assignments").select("id, section_id, user_id, status, due_date, heatmap_sections(section_name), engagement_members:engagement_members!inner(display_name)").eq("engagement_id", engagement.id),
    ]);
    setSections(s ?? []);
    setMembers((m ?? []).filter((x: any) => x.user_id));
    setAssignments(a ?? []);
  }
  useEffect(() => { load(); }, [engagement?.id]);

  async function toggleSensitivity(id: string, current: string) {
    const next = current === "restricted" ? "standard" : "restricted";
    const { error } = await (supabase as any).from("heatmap_sections").update({ sensitivity: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "restricted" ? "Section locked to leadership" : "Section unlocked for writers");
    load();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !sectionId || !userId) return;
    const { error } = await supabase.from("section_assignments").insert({
      engagement_id: engagement.id, section_id: sectionId, user_id: userId, due_date: due || null,
    });
    if (error) return toast.error(error.message);
    setSectionId(""); setUserId(""); setDue(""); load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("section_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  if (!isLeadership) return <div className="p-8 text-sm text-muted-foreground">Leadership only.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Section Assignments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Assign writers to sections. Writers see only sections assigned to them.</p>
      </div>
      <Card className="border-border bg-surface p-4">
        <form onSubmit={add} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue placeholder="Pick a section" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Writer</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Pick a teammate" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <Button type="submit" disabled={!sectionId || !userId}>Assign</Button>
          </div>
        </form>
      </Card>

      <Card className="border-border bg-surface p-4">
        <div className="mb-3">
          <h2 className="text-sm font-bold">Section sensitivity</h2>
          <p className="text-[11px] text-muted-foreground">Restricted sections are hidden from writers until unlocked.</p>
        </div>
        <div className="space-y-1.5">
          {sections.map((s: any) => {
            const restricted = s.sensitivity === "restricted";
            return (
              <div key={s.id} className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  {restricted ? <Lock className="h-3.5 w-3.5 text-[var(--gold)]" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>{s.section_name}</span>
                  {restricted && <Badge variant="outline" className="border-[var(--gold)]/50 text-[10px] text-[var(--gold)]">Restricted</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleSensitivity(s.id, s.sensitivity)}>
                  {restricted ? "Unlock for writers" : "Lock to leadership"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
      {assignments.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No assignments yet.</Card>
      ) : (
        assignments.map((a: any) => (
          <Card key={a.id} className="border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{a.heatmap_sections?.section_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {a.engagement_members?.display_name} · {a.status}{a.due_date ? ` · due ${a.due_date}` : ""}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
