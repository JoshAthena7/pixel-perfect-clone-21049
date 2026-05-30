import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { createIssue } from "@/lib/flag-issue";

export const Route = createFileRoute("/_authenticated/huddle")({
  head: () => ({ meta: [{ title: "Daily Huddle — Athena" }] }),
  component: HuddlePage,
});

const HEALTH: StatusColor[] = ["Green", "Yellow", "Red"];
const PRIORITY = ["On Track", "Pushing Hard", "At Risk", "Blocked"];

function HuddlePage() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();

  const [health, setHealth] = useState<StatusColor>("Green");
  const [priority, setPriority] = useState(PRIORITY[0]);
  const [risk, setRisk] = useState("");
  const [clientConcern, setClientConcern] = useState("");
  const [writerConcern, setWriterConcern] = useState("");
  const [needsLeadership, setNeedsLeadership] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [huddles, setHuddles] = useState<any[]>([]);

  async function load(eid: string) {
    const { data } = await supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(20);
    setHuddles(data ?? []);
  }

  useEffect(() => {
    if (engagement) load(engagement.id);
  }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    setSubmitting(true);
    const { error } = await supabase.from("huddles").insert({
      engagement_id: engagement.id,
      submitted_by: user.id,
      submitter_name: member.display_name,
      health,
      priority,
      risk: risk || null,
      client_concern: clientConcern || null,
      writer_concern: writerConcern || null,
      needs_leadership: needsLeadership,
      notes: notes || null,
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Edge 8: if needs_leadership and no leadership is currently available,
    // auto-create an SOS so the flag surfaces in NeedsAttentionPanel.
    if (needsLeadership) {
      try {
        const { data: leaders } = await supabase
          .from("engagement_members")
          .select("user_id")
          .eq("engagement_id", engagement.id)
          .in("role", ["founder", "pm", "engagement_lead"]);
        const leaderUserIds = ((leaders as { user_id: string | null }[]) ?? [])
          .map((l) => l.user_id)
          .filter((id): id is string => !!id);

        let anyAvailable = false;
        if (leaderUserIds.length > 0) {
          const { data: pres } = await supabase
            .from("presence")
            .select("user_id, availability_status, last_seen")
            .eq("engagement_id", engagement.id)
            .in("user_id", leaderUserIds)
            .eq("availability_status", "available");
          // Treat presence rows updated within the last 5 minutes as live.
          const cutoff = Date.now() - 5 * 60 * 1000;
          anyAvailable = ((pres as { last_seen: string }[]) ?? []).some(
            (p) => new Date(p.last_seen).getTime() >= cutoff,
          );
        }

        if (!anyAvailable) {
          await createIssue({
            type: "sos",
            severity: "Yellow",
            engagementId: engagement.id,
            userId: user.id,
            memberName: member.display_name,
            category: "Leadership Needed",
            description:
              (notes && notes.trim()) ||
              `Huddle from ${member.display_name} flagged for leadership attention.`,
          });
          toast.success(
            "Your request has been flagged. No leadership is currently online — they will be notified.",
          );
        } else {
          toast.success("Huddle submitted");
        }
      } catch {
        toast.success("Huddle submitted");
      }
    } else {
      toast.success("Huddle submitted");
    }

    setSubmitting(false);
    setRisk(""); setClientConcern(""); setWriterConcern(""); setNotes(""); setNeedsLeadership(false);
    load(engagement.id);
  }


  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-5">
      <Card className="border-border bg-surface p-6 lg:col-span-3">
        <h1 className="text-xl font-bold">Daily Huddle</h1>
        <p className="mt-1 text-sm text-muted-foreground">60-second status from the front line.</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <Label className="mb-2 block">Health</Label>
            <div className="flex gap-2">
              {HEALTH.map((h) => (
                <button key={h} type="button" onClick={() => setHealth(h)} className={`rounded-md px-3 py-1.5 text-sm transition ${health === h ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}>
                  <StatusPill status={h} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Priority</Label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY.map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${priority === p ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="risk">Top risk</Label>
              <Textarea id="risk" rows={3} value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="What could derail us?" />
            </div>
            <div>
              <Label htmlFor="client">Client concern</Label>
              <Textarea id="client" rows={3} value={clientConcern} onChange={(e) => setClientConcern(e.target.value)} placeholder="What's the client worried about?" />
            </div>
            <div>
              <Label htmlFor="writer">Writer concern</Label>
              <Textarea id="writer" rows={3} value={writerConcern} onChange={(e) => setWriterConcern(e.target.value)} placeholder="What's the writer stuck on?" />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else worth flagging" />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface-hover/40 p-3">
            <div>
              <Label htmlFor="needs">Needs leadership attention</Label>
              <p className="text-xs text-muted-foreground">Flag this huddle for founder/PM review.</p>
            </div>
            <Switch id="needs" checked={needsLeadership} onCheckedChange={setNeedsLeadership} />
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : "Submit Huddle"}
          </Button>
        </form>
      </Card>

      <Card className="border-border bg-surface p-6 lg:col-span-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Huddles</h2>
        {huddles.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">No huddles yet.</div>
        ) : (
          <ul className="mt-4 space-y-3 max-h-[70vh] overflow-auto">
            {huddles.map((h) => (
              <li key={h.id} className="rounded-md border border-border bg-surface-hover/40 p-3">
                <div className="flex items-center gap-2">
                  <StatusPill status={h.health as StatusColor} />
                  <span className="text-sm font-medium">{h.priority}</span>
                  {h.needs_leadership && <StatusPill status="Orange" label="Needs Leadership" />}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {h.risk && <div><span className="text-muted-foreground">Risk:</span> {h.risk}</div>}
                  {h.client_concern && <div><span className="text-muted-foreground">Client:</span> {h.client_concern}</div>}
                  {h.writer_concern && <div><span className="text-muted-foreground">Writer:</span> {h.writer_concern}</div>}
                  {h.notes && <div className="text-muted-foreground">{h.notes}</div>}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{h.submitter_name} • {relativeTime(h.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
