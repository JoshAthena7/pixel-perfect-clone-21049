import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Pin, ChevronDown, ChevronUp, Check, Minus } from "lucide-react";
import { logActivity } from "@/lib/activity-log";


export const Route = createFileRoute("/_authenticated/broadcasts")({
  head: () => ({ meta: [{ title: "Broadcasts — Athena" }] }),
  component: BroadcastsPage,
});

type Member = { id: string; display_name: string; role: string };

function BroadcastsPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [reads, setReads] = useState<Record<string, Set<string>>>({});
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(eid: string) {
    const [{ data: bcs }, { data: mems }, { data: rds }] = await Promise.all([
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("engagement_members").select("id, display_name, role").eq("engagement_id", eid),
      supabase.from("broadcast_reads").select("broadcast_id, member_id").eq("engagement_id", eid),
    ]);
    setItems(bcs ?? []);
    setMembers(((mems as Member[]) ?? []).filter((m) => m.role === "writer"));
    const map: Record<string, Set<string>> = {};
    (rds ?? []).forEach((r: any) => {
      if (!map[r.broadcast_id]) map[r.broadcast_id] = new Set();
      map[r.broadcast_id].add(r.member_id);
    });
    setReads(map);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`broadcasts:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_reads", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
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
    const nextPinned = !b.pinned;
    const { error } = await supabase.from("broadcasts").update({ pinned: nextPinned }).eq("id", b.id).eq("engagement_id", engagement?.id ?? "");
    if (error) return toast.error(error.message);
    if (nextPinned && engagement && member) {
      logActivity({
        engagementId: engagement.id,
        userId: member.user_id ?? null,
        actorName: member.display_name,
        action: "broadcast_pinned",
        targetTable: "broadcasts",
        targetId: b.id,
      });
    }
  }

  async function nudgeUnread(b: any) {
    if (!engagement || !member) return;
    const readSet = reads[b.id] ?? new Set();
    const unread = members.filter((m) => !readSet.has(m.id) && m.id !== member.id);
    if (unread.length === 0) {
      toast.info("Everyone has read this broadcast.");
      return;
    }
    const rows = unread.map((m) => ({
      engagement_id: engagement.id,
      sender_id: member.id,
      sender_name: member.display_name,
      recipient_id: m.id,
    }));
    const { error } = await supabase.from("nudges").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Nudged ${unread.length} unread writer${unread.length === 1 ? "" : "s"}.`);
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
            {items.map((b) => {
              const readSet = reads[b.id] ?? new Set<string>();
              const totalWriters = members.length;
              const readCount = members.filter((m) => readSet.has(m.id)).length;
              const isOpen = expanded === b.id;
              return (
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

                  {isLeadership && totalWriters > 0 && (
                    <div className="mt-3 border-t border-border/60 pt-2">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : b.id)}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {readCount} of {totalWriters} read
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-1">
                          {[...members]
                            .sort((a, b2) => {
                              const ar = readSet.has(a.id) ? 1 : 0;
                              const br = readSet.has(b2.id) ? 1 : 0;
                              if (ar !== br) return ar - br;
                              return a.display_name.localeCompare(b2.display_name);
                            })
                            .map((m) => {
                              const read = readSet.has(m.id);
                              return (
                                <div key={m.id} className="flex items-center gap-2 text-[12px]">
                                  {read ? <Check className="h-3 w-3 text-emerald-500" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
                                  <span className={read ? "text-foreground" : "text-muted-foreground"}>{m.display_name}</span>
                                </div>
                              );
                            })}
                          {readCount < totalWriters && (
                            <button
                              type="button"
                              onClick={() => nudgeUnread(b)}
                              className="mt-2 text-[11px] text-[var(--gold)] hover:underline"
                            >
                              Tap to nudge unread →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
