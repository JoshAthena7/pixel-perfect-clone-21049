import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { TriviaLeaderboard, useTriviaLeaderboard } from "@/components/war-room/writer/TriviaLeaderboard";

export function DeclareTriviaWinnerCard() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const { entries, winnerId } = useTriviaLeaderboard();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [prize, setPrize] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isLeadership) return null;

  const top = entries[0];

  async function declare() {
    if (!engagement || !user || !member) return;
    const winner = entries.find((e) => e.member_id === (selectedId ?? top?.member_id));
    if (!winner) return toast.error("Pick a winner first.");
    setSaving(true);
    const { error: wErr } = await supabase.from("trivia_winners").upsert(
      {
        engagement_id: engagement.id,
        winner_member_id: winner.member_id,
        winner_name: winner.first_name,
        message: message.trim() || null,
        prize: prize.trim() || null,
        declared_by: user.id,
        declared_by_name: member.display_name,
        declared_at: new Date().toISOString(),
      },
      { onConflict: "engagement_id" },
    );
    if (wErr) { setSaving(false); return toast.error(wErr.message); }

    const parts = [`🏆 Congratulations to ${winner.first_name} — Indiana Trivia Champion!`];
    if (message.trim()) parts.push(message.trim());
    if (prize.trim()) parts.push(prize.trim());
    const { error: bErr } = await supabase.from("broadcasts").insert({
      engagement_id: engagement.id,
      author_id: user.id,
      author_name: member.display_name,
      content: parts.join(" "),
      pinned: true,
    });
    setSaving(false);
    if (bErr) return toast.error(bErr.message);
    toast.success("Champion declared and broadcast posted.");
    setOpen(false);
    setMessage(""); setPrize(""); setSelectedId(null);
  }

  return (
    <>
      <Card className="border-[var(--gold)]/40 bg-surface p-4 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--gold)]" />
            <div>
              <div className="text-sm font-semibold">Indiana Trivia Contest</div>
              <div className="text-xs text-muted-foreground">
                {winnerId
                  ? `Champion declared: ${entries.find((e) => e.member_id === winnerId)?.first_name ?? "—"}`
                  : "Declare a champion when you're ready to wrap the contest."}
              </div>
            </div>
          </div>
          <Button
            variant={winnerId ? "outline" : "default"}
            size="sm"
            onClick={() => { setSelectedId(winnerId ?? top?.member_id ?? null); setOpen(true); }}
            disabled={entries.length === 0}
          >
            {winnerId ? "Re-declare Winner" : "Declare Trivia Winner"}
          </Button>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-[var(--gold)]" /> Declare Trivia Champion</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <TriviaLeaderboard />

            <div>
              <Label className="text-xs">Winner</Label>
              <div className="mt-1 grid gap-1.5 max-h-40 overflow-auto rounded-md border border-border p-2">
                {entries.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No answers yet.</div>
                ) : entries.map((e) => (
                  <label key={e.member_id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="winner"
                      checked={(selectedId ?? top?.member_id) === e.member_id}
                      onChange={() => setSelectedId(e.member_id)}
                      className="accent-[var(--gold)]"
                    />
                    <span>#{e.rank} {e.first_name}</span>
                    <span className="text-xs text-muted-foreground">{e.correct} correct / {e.answered} answered</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="t-message" className="text-xs">Personal message (optional)</Label>
              <Textarea id="t-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Great work all engagement!" />
            </div>

            <div>
              <Label htmlFor="t-prize" className="text-xs">Prize description (optional)</Label>
              <Input id="t-prize" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Amazon gift card on its way!" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={declare} disabled={saving || entries.length === 0}>
              {saving ? "Posting…" : "Confirm & Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
