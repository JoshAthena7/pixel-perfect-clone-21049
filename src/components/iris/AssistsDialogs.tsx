/**
 * Reality + SOS dialogs used by the Flight Deck horizontal assists bar.
 * Extracted from the legacy floating AssistsBar (now removed).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export function UpdateRealityDialog({ open, onOpenChange, missionId, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null; onSent: () => void }) {
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

export function SOSDialog({ open, onOpenChange, missionId }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null }) {
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
