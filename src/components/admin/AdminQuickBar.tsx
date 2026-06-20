/**
 * Admin Quick Bar — replaces the writer-facing Assists Bar on Olympus pages
 * for platform admins. Four high-leverage actions: broadcast an announcement,
 * jump into threads, run a fast cross-mission report, and ping IRIS for a
 * portfolio-level intel briefing.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Megaphone, MessagesSquare, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C9A55C";

type Props = {
  onPrefillIris: (text: string) => void;
  onOpenIris: () => void;
};

export function AdminQuickBar({ onPrefillIris: _onPrefillIris, onOpenIris: _onOpenIris }: Props) {
  const navigate = useNavigate();
  const [announceOpen, setAnnounceOpen] = useState(false);


  return (
    <>
      <div className="fixed bottom-5 left-5 z-40 flex flex-col gap-2 bg-card/95 backdrop-blur border rounded-full px-2 py-2 shadow-lg">
        <ActionBtn label="Global Announcement" icon={<Megaphone className="h-4 w-4" />} onClick={() => setAnnounceOpen(true)} />
        <ActionBtn label="Threads" icon={<MessagesSquare className="h-4 w-4" />} onClick={() => navigate({ to: "/admin" as never })} />
        <ActionBtn label="Fast Report" icon={<BarChart3 className="h-4 w-4" />} onClick={() => navigate({ to: "/reports" as never })} />
      </div>

      <AnnouncementDialog open={announceOpen} onOpenChange={setAnnounceOpen} />
    </>
  );
}

function ActionBtn({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="group relative h-10 w-10 rounded-full flex items-center justify-center transition-colors"
      style={{ background: "rgba(201,165,92,0.12)", color: GOLD }}
    >
      {icon}
      <span className="absolute left-14 hidden group-hover:inline-block px-2 py-1 rounded text-xs bg-card text-foreground border whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

function AnnouncementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [fromName, setFromName] = useState("Athena Leadership");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Record the broadcast
      const { error: bErr } = await supabase.from("broadcasts").insert({
        from_name: fromName.trim() || "Athena Leadership",
        text: text.trim(),
        user_id: user?.id ?? null,
      });
      if (bErr) throw bErr;

      // 2. Fan out an in-app notification to every profile
      const { data: profs } = await supabase.from("profiles").select("id");
      const ids = Array.from(
        new Set(
          (profs ?? [])
            .map((p) => (p as { id: string | null }).id)
            .filter((v): v is string => !!v),
        ),
      );
      if (ids.length) {
        await supabase.from("atlas_notifications").insert(
          ids.map((id) => ({
            recipient_id: id,
            recipient_role: "user",
            type: "broadcast",
            message: `${fromName.trim() || "Leadership"}: ${text.slice(0, 240)}`,
            metadata: { broadcast: true, posted_by: user?.id ?? null },
          })),
        );
      }

      toast.success(`Announcement sent to ${ids.length} team member${ids.length === 1 ? "" : "s"}.`);
      setText("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Global Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Athena Leadership" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Message</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What does the whole organization need to know right now?"
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !text.trim()}>
            {busy ? "Sending…" : "Send to everyone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
