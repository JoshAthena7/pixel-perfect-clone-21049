import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { notifySlack } from "@/lib/api/slack.functions";

export const Route = createFileRoute("/_authenticated/heatmap")({
  head: () => ({ meta: [{ title: "Heat Map — Athena" }] }),
  component: HeatmapPage,
});

type Section = {
  id: string;
  section_name: string;
  status: StatusColor;
  notes: string | null;
  sort_order: number;
  updated_at: string | null;
  updated_by_name: string | null;
};

const STATUSES: StatusColor[] = ["Green", "Yellow", "Orange", "Red"];

function HeatmapPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [sections, setSections] = useState<Section[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<StatusColor>("Green");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase
      .from("heatmap_sections")
      .select("*")
      .eq("engagement_id", eid)
      .order("sort_order");
    setSections((data as Section[]) ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`heat:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "heatmap_sections", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [engagement?.id]);

  function startEdit(s: Section) {
    setEditingId(s.id);
    setDraftStatus(s.status);
    setDraftNotes(s.notes ?? "");
  }

  async function save(s: Section) {
    if (!user || !member) return;
    setSaving(true);
    const { error } = await supabase
      .from("heatmap_sections")
      .update({
        status: draftStatus,
        notes: draftNotes || null,
        updated_at: new Date().toISOString(),
        updated_by_name: member.display_name,
      })
      .eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${s.section_name} updated`);
    if (draftStatus === "Red" && s.status !== "Red") {
      notifySlack({
        data: {
          engagementId: engagement!.id,
          event: "heatmap_red",
          title: `${s.section_name} went Red`,
          body: draftNotes || undefined,
          author: member.display_name,
        },
      }).catch(() => {});
    }
    setEditingId(null);
  }

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Heat Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Section-by-section health across the engagement.
          {!isLeadership && " View-only — leadership can update statuses."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const isEditing = editingId === s.id;
          return (
            <Card key={s.id} className="border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Section</div>
                  <div className="text-lg font-bold">{s.section_name}</div>
                </div>
                <StatusPill status={s.status} />
              </div>

              {!isEditing && (
                <>
                  {s.notes && <p className="mt-3 text-sm text-muted-foreground">{s.notes}</p>}
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    {s.updated_by_name ? `${s.updated_by_name} • ${relativeTime(s.updated_at)}` : "No updates yet"}
                  </div>
                  {isLeadership && (
                    <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => startEdit(s)}>
                      Update
                    </Button>
                  )}
                </>
              )}

              {isEditing && (
                <div className="mt-4 space-y-3">
                  <div>
                    <Label className="mb-2 block text-xs">Status</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setDraftStatus(st)}
                          className={`rounded-md px-2 py-1 transition ${draftStatus === st ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}
                        >
                          <StatusPill status={st} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`notes-${s.id}`} className="text-xs">Notes</Label>
                    <Textarea
                      id={`notes-${s.id}`}
                      rows={3}
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      placeholder="What's driving this status?"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(s)} disabled={saving} className="flex-1">
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
