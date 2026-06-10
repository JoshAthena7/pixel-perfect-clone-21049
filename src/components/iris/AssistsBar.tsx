/**
 * Floating Assists Bar — six quick actions. Lives on Flight Deck and
 * Mission Command pages. Most actions either open a modal or pop the
 * IRIS Dock with a pre-filled prompt; SOS / Update Reality also write
 * to atlas_notifications + mission_audit_log.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Bell, PencilLine, Phone, Sparkles, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "./IrisContext";
import { DailyPulseModal } from "./DailyPulseModal";

const GOLD = "#C9A55C";

type Props = {
  onPrefillIris: (text: string) => void;
  onOpenIris: () => void;
};

export function AssistsBar({ onPrefillIris, onOpenIris }: Props) {
  const navigate = useNavigate();
  const iris = useIris();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);

  const handleThread = () => {
    if (iris.current_question_id && iris.current_mission_id) {
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId: iris.current_mission_id },
        search: { tab: "questions", question: iris.current_question_id } as never,
      });
    } else if (iris.current_mission_id) {
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId: iris.current_mission_id },
        search: { tab: "questions" } as never,
      });
    } else {
      toast.info("Open a mission first to start a Thread.");
    }
  };

  return (
    <>
      <div className="fixed bottom-5 left-5 z-40 flex flex-col gap-2 bg-card/95 backdrop-blur border rounded-full px-2 py-2 shadow-lg">
        <ActionBtn label="Update Reality" icon={<PencilLine className="h-4 w-4" />} onClick={() => setUpdateOpen(true)} />
        <ActionBtn label="Phone a Friend" icon={<Phone className="h-4 w-4" />} onClick={() => { onPrefillIris("I need an SME for: "); }} />
        <ActionBtn label="Score Me" icon={<Sparkles className="h-4 w-4" />} onClick={() => { onPrefillIris("Score my draft: "); }} />
        <ActionBtn label="Daily Pulse" icon={<Bell className="h-4 w-4" />} onClick={() => setPulseOpen(true)} />
        <ActionBtn label="Thread" icon={<MessagesSquare className="h-4 w-4" />} onClick={handleThread} />
        <ActionBtn label="SOS" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setSosOpen(true)} danger />
      </div>

      <UpdateRealityDialog open={updateOpen} onOpenChange={setUpdateOpen} missionId={iris.current_mission_id} onSent={() => { onOpenIris(); }} />
      <SOSDialog open={sosOpen} onOpenChange={setSosOpen} missionId={iris.current_mission_id} />
      <DailyPulseModal open={pulseOpen} onOpenChange={setPulseOpen} missionId={iris.current_mission_id} />
    </>
  );
}

function ActionBtn({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="group h-10 w-10 rounded-full flex items-center justify-center transition-colors"
      style={{ background: danger ? "rgba(220,38,38,0.15)" : "rgba(201,165,92,0.12)", color: danger ? "#fca5a5" : GOLD }}
    >
      {icon}
      <span className="absolute left-14 hidden group-hover:inline-block px-2 py-1 rounded text-xs bg-card text-foreground border whitespace-nowrap">{label}</span>
    </button>
  );
}

function UpdateRealityDialog({ open, onOpenChange, missionId, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    if (!missionId) { toast.error("No active mission."); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: team } = await supabase.from("mission_team_members").select("member_id").eq("mission_id", missionId);
      const recipients = (team ?? []).map((t) => (t as { member_id: string }).member_id);
      if (recipients.length) {
        await supabase.from("atlas_notifications").insert(recipients.map((id) => ({
          recipient_id: id,
          recipient_role: "user",
          type: "reality_update",
          message: `Reality update: ${text.slice(0, 240)}`,
          metadata: { mission_id: missionId, posted_by: user?.id ?? null },
        })));
      }
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        action: "reality_update_posted",
        actor_id: user?.id ?? null,
        details: { text },
      } as never);
      toast.success("Reality update sent to the team.");
      setText("");
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Update Reality</DialogTitle></DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed?" rows={5} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send to team"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SOSDialog({ open, onOpenChange, missionId }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "medium">("high");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    if (!missionId) { toast.error("No active mission."); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [admins, leads] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", missionId),
      ]);
      const ids = new Set<string>();
      (admins.data ?? []).forEach((r) => ids.add((r as { user_id: string }).user_id));
      (leads.data ?? []).forEach((r) => {
        const role = (r as { mission_role: string | null }).mission_role ?? "";
        if (/engagement|lead|principal/i.test(role)) ids.add((r as { member_id: string }).member_id);
      });
      if (ids.size) {
        await supabase.from("atlas_notifications").insert(Array.from(ids).map((id) => ({
          recipient_id: id,
          recipient_role: "user",
          type: "sos",
          message: `SOS (${priority}): ${text.slice(0, 240)}`,
          metadata: { mission_id: missionId, priority, raised_by: user?.id ?? null },
        })));
      }
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        action: "SOS triggered",
        actor_id: user?.id ?? null,
        details: { text, priority },
      } as never);
      toast.success("Your Engagement Lead and mission admins have been notified immediately.");
      setText("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-destructive">SOS</DialogTitle></DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the emergency or blocker" rows={5} />
        <div className="flex gap-2 text-sm">
          <span className="text-muted-foreground">Priority:</span>
          {(["critical", "high", "medium"] as const).map((p) => (
            <button key={p} onClick={() => setPriority(p)} className={`px-2 py-0.5 rounded text-xs border ${priority === p ? "bg-destructive text-destructive-foreground border-destructive" : "border-border"}`}>
              {p}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !text.trim()}>{busy ? "Notifying…" : "Raise SOS"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
