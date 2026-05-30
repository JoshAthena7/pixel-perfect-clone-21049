import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { CheckCircle2, RotateCcw, FileText } from "lucide-react";
import { logActivity } from "@/lib/activity-log";

type ReviewRow = {
  id: string;
  body: string;
  word_count: number;
  version: number;
  status: string;
  updated_at: string;
  section_id: string;
  author_id: string;
  section?: { section_name: string } | null;
};

export function SectionReviewQueue() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<ReviewRow | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!engagement) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("section_drafts")
      .select("id, body, word_count, version, status, updated_at, section_id, author_id, heatmap_sections!inner(section_name)")
      .eq("engagement_id", engagement.id)
      .eq("status", "in_review")
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows(((data as any[]) ?? []).map((r) => ({ ...r, section: r.heatmap_sections })));
  }, [engagement?.id]);

  useEffect(() => { load(); }, [load]);

  async function approve(row: ReviewRow) {
    if (!user) return;
    setWorking(true);
    try {
      const { error } = await supabase
        .from("section_drafts")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      await supabase
        .from("section_assignments")
        .update({ status: "Complete", updated_at: new Date().toISOString() })
        .eq("engagement_id", engagement!.id)
        .eq("section_id", row.section_id)
        .eq("user_id", row.author_id);
      await supabase
        .from("heatmap_sections")
        .update({ status: "Green", updated_at: new Date().toISOString(), updated_by_name: member?.display_name ?? "Leadership" })
        .eq("id", row.section_id);
      logActivity({
        engagementId: engagement!.id,
        userId: user.id,
        action: "approved section draft",
        actorName: member?.display_name ?? "Leadership",
        targetTable: "section_drafts",
        targetId: row.id,
        metadata: { section_id: row.section_id, section_name: row.section?.section_name },
      });
      toast.success("Approved");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to approve");
    } finally {
      setWorking(false);
    }
  }

  async function returnDraft() {
    if (!returnFor || !user) return;
    if (!returnNote.trim()) { toast.error("Add a return note"); return; }
    setWorking(true);
    try {
      const { error } = await supabase
        .from("section_drafts")
        .update({ status: "returned", return_note: returnNote.trim(), updated_at: new Date().toISOString() })
        .eq("id", returnFor.id);
      if (error) throw error;
      await supabase
        .from("section_assignments")
        .update({ status: "In Progress", updated_at: new Date().toISOString() })
        .eq("engagement_id", engagement!.id)
        .eq("section_id", returnFor.section_id)
        .eq("user_id", returnFor.author_id);
      logActivity({
        engagementId: engagement!.id,
        userId: user.id,
        action: "returned section draft",
        actorName: member?.display_name ?? "Leadership",
        targetTable: "section_drafts",
        targetId: returnFor.id,
        metadata: { section_id: returnFor.section_id, note: returnNote.trim() },
      });
      toast.success("Returned to writer");
      setReturnFor(null);
      setReturnNote("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to return");
    } finally {
      setWorking(false);
    }
  }

  if (loading && rows.length === 0) {
    return <div className="text-sm text-muted-foreground">Loading review queue…</div>;
  }
  if (rows.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-6 text-center text-sm text-emerald-300">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />
        No drafts awaiting review.
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {rows.map((r) => {
          const isOpen = expanded === r.id;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{r.section?.section_name ?? "Section"}</span>
                    <Badge variant="outline">v{r.version}</Badge>
                    <Badge className="bg-blue-500/20 text-blue-300">in review</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.word_count} words • updated {relativeTime(r.updated_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setExpanded(isOpen ? null : r.id)}>
                    {isOpen ? "Hide" : "Read draft"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReturnFor(r)} disabled={working}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Return
                  </Button>
                  <Button size="sm" onClick={() => approve(r)} disabled={working}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                  </Button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-background/40 p-3 text-sm leading-relaxed">
                  {r.body || <span className="italic text-muted-foreground">Empty draft.</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!returnFor} onOpenChange={(o) => { if (!o) { setReturnFor(null); setReturnNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return draft to writer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Returning <span className="font-semibold">{returnFor?.section?.section_name}</span>. Add a note explaining what's needed.
          </p>
          <Textarea
            rows={5}
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            placeholder="e.g. Strengthen the staffing plan and address evaluation criterion 3.2."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReturnFor(null); setReturnNote(""); }}>Cancel</Button>
            <Button onClick={returnDraft} disabled={working || !returnNote.trim()}>Send back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
