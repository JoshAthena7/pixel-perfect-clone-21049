import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { Pin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  head: () => ({ meta: [{ title: "Broadcasts — Athena" }] }),
  component: BroadcastsPage,
});

function BroadcastsPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("engagement_id", eid)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`broadcasts:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !content.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("broadcasts").insert({
      engagement_id: engagement.id,
      author_id: user.id,
      author_name: member.display_name,
      content: content.trim(),
      pinned,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setContent(""); setPinned(false);
    toast.success("Broadcast sent");
  }

  async function togglePin(b: any) {
    const { error } = await supabase.from("broadcasts").update({ pinned: !b.pinned }).eq("id", b.id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-5">
      {isLeadership && (
        <Card className="border-border bg-surface p-6 lg:col-span-2">
          <h1 className="text-xl font-bold">Send Broadcast</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team-wide announcement from leadership.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's the message?" />
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-hover/40 p-3">
              <div>
                <Label htmlFor="pin">Pin to top</Label>
                <p className="text-xs text-muted-foreground">Keeps message above the feed.</p>
              </div>
              <Switch id="pin" checked={pinned} onCheckedChange={setPinned} />
            </div>
            <Button type="submit" disabled={submitting || !content.trim()} className="w-full">
              {submitting ? "Sending…" : "Send Broadcast"}
            </Button>
          </form>
        </Card>
      )}

      <Card className={`border-border bg-surface p-6 ${isLeadership ? "lg:col-span-3" : "lg:col-span-5"}`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Feed</h2>
        {items.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">No broadcasts yet.</div>
        ) : (
          <ul className="mt-4 space-y-3 max-h-[75vh] overflow-auto">
            {items.map((b) => (
              <li key={b.id} className={`rounded-md border p-4 ${b.pinned ? "border-primary/50 bg-primary/5" : "border-border bg-surface-hover/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {b.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                    <span className="text-sm font-semibold">{b.author_name}</span>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(b.created_at)}</span>
                  </div>
                  {isLeadership && (
                    <button onClick={() => togglePin(b)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      {b.pinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{b.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
