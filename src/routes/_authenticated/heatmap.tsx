import { createFileRoute, Link } from "@tanstack/react-router";
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

import { SectionThread } from "@/components/war-room/comms/SectionThread";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHealthTab } from "@/components/war-room/SectionHealthTab";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { SectionReviewQueue } from "@/components/war-room/SectionReviewQueue";
import { Watermark } from "@/components/war-room/Watermark";
import { Sparkles, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/heatmap")({
  head: () => ({ meta: [{ title: "Heat Map — Athena" }] }),
  component: HeatmapPage,
});

type Section = {
  id: string;
  section_name: string;
  status: StatusColor;
  notes: string | null;
  instructions: string | null;
  sort_order: number;
  updated_at: string | null;
  updated_by_name: string | null;
};

const STATUSES: StatusColor[] = ["Green", "Yellow", "Orange", "Red", "N/A"];

function HeatmapPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [sections, setSections] = useState<Section[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<StatusColor>("Green");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState(0);

  async function loadReviewCount(eid: string) {
    const { count } = await supabase
      .from("win_theme_mappings")
      .select("id", { count: "exact", head: true })
      .eq("engagement_id", eid)
      .eq("ai_suggested", true)
      .eq("confirmed", false);
    setReviewCount(count ?? 0);
  }

  async function load(eid: string) {
    setIsLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("heatmap_sections")
      .select("*")
      .eq("engagement_id", eid)
      .order("sort_order");
    setIsLoading(false);
    if (error) { setLoadError(error.message); return; }
    setSections((data as Section[]) ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    loadReviewCount(engagement.id);
    const ch = supabase
      .channel(`heat:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "heatmap_sections", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "win_theme_mappings", filter: `engagement_id=eq.${engagement.id}` },
        () => loadReviewCount(engagement.id),
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
    setDraftInstructions(s.instructions ?? "");
  }

  async function save(s: Section) {
    if (!user || !member) return;
    setSaving(true);
    const { error } = await supabase
      .from("heatmap_sections")
      .update({
        status: draftStatus,
        notes: draftNotes || null,
        instructions: draftInstructions || null,
        updated_at: new Date().toISOString(),
        updated_by_name: member.display_name,
      })
      .eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${s.section_name} updated`);
    setEditingId(null);
  }

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Watermark />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Heat Map</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Section-by-section health across the engagement.
            {!isLeadership && " View-only — leadership can update statuses."}
          </p>
        </div>
        {isLeadership && reviewCount > 0 && (
          <Link
            to="/win-themes"
            className="inline-flex items-center gap-2 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-500/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {reviewCount} win-theme mapping{reviewCount === 1 ? "" : "s"} to review
            <Badge variant="outline" className="ml-1 border-purple-500/40 bg-purple-500/20 text-[10px] text-purple-700">
              AI
            </Badge>
          </Link>
        )}
      </div>

      <ErrorBanner error={loadError} onRetry={() => engagement && load(engagement.id)} label="Couldn't load the heat map." />

      <Tabs defaultValue="map" className="space-y-6">
        <TabsList>
          <TabsTrigger value="map">Heat Map</TabsTrigger>
          <TabsTrigger value="health">Section Health</TabsTrigger>
          {isLeadership && <TabsTrigger value="review">Review Queue</TabsTrigger>}
        </TabsList>

        <TabsContent value="map" className="space-y-6">
          {isLoading && sections.length === 0 ? (
            <LoadingSkeleton label="Loading sections…" />
          ) : sections.length === 0 ? (
            <div className="rounded-md border border-border bg-surface/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No heat map sections yet. Sections are seeded automatically when an engagement is created.
            </div>
          ) : (
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
                        <div className="mt-4 flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => startEdit(s)}>
                            Update
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="flex-1">
                            <Link to="/section-assignments" search={{ section: s.id } as any}>
                              Assign writer
                            </Link>
                          </Button>
                        </div>
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
                      <div>
                        <Label htmlFor={`instructions-${s.id}`} className="text-xs">Instructions for writer (section brief)</Label>
                        <Textarea
                          id={`instructions-${s.id}`}
                          rows={3}
                          value={draftInstructions}
                          onChange={(e) => setDraftInstructions(e.target.value)}
                          placeholder="What does the writer need to know to draft this section?"
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

                  <SectionThread sectionId={s.id} />
                </Card>
              );
            })}
          </div>
          )}
        </TabsContent>

        <TabsContent value="health">
          <SectionHealthTab />
        </TabsContent>

        {isLeadership && (
          <TabsContent value="review">
            <SectionReviewQueue />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
