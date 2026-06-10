import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsAdmin, logAudit } from "@/lib/mission-helpers";

const PROC_TYPES = [
  "RFP", "RFI", "RFQ", "IFB", "Sole Source", "Task Order", "Other",
];

const ARCHIVABLE = ["submitted", "awarded", "not_awarded"];

export function MissionSettingsTab({ missionId }: { missionId: string }) {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: mission, isLoading } = useQuery({
    queryKey: ["mission-settings", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions").select("*").eq("id", missionId).single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "", client_name: "", procurement_type: "RFP",
    primary_contact_name: "", primary_contact_email: "", contract_value: "",
  });
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!mission) return;
    setForm({
      name: mission.name ?? "",
      client_name: mission.client_name ?? "",
      procurement_type: mission.procurement_type ?? "RFP",
      primary_contact_name: mission.primary_contact_name ?? "",
      primary_contact_email: mission.primary_contact_email ?? "",
      contract_value: mission.contract_value?.toString() ?? "",
    });
  }, [mission]);

  if (roleLoading || isLoading || !mission) {
    if (!roleLoading && !isAdmin) {
      return (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          This tab is restricted to mission administrators.
        </div>
      );
    }
    return <Skeleton className="h-96 w-full" />;
  }
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        This tab is restricted to mission administrators.
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("missions").update({
      name: form.name,
      client_name: form.client_name || null,
      procurement_type: form.procurement_type,
      primary_contact_name: form.primary_contact_name || null,
      primary_contact_email: form.primary_contact_email || null,
      contract_value: form.contract_value ? Number(form.contract_value) : null,
    }).eq("id", missionId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Mission settings updated" });
    toast.success("Mission settings saved.");
    qc.invalidateQueries({ queryKey: ["mission-settings", missionId] });
    qc.invalidateQueries({ queryKey: ["mission-header", missionId] });
  };

  const archive = async () => {
    const { error } = await supabase.from("missions").update({ status: "archived" }).eq("id", missionId);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Mission archived" });
    toast.success("Mission archived.");
    navigate({ to: "/olympus/missions" });
  };

  const deleteMission = async () => {
    const { error } = await supabase.from("missions").delete().eq("id", missionId);
    if (error) { toast.error(error.message); return; }
    toast.success("Mission deleted.");
    navigate({ to: "/olympus/missions" });
  };

  const canArchive = ARCHIVABLE.includes(mission.status ?? "");
  const canDelete = mission.status === "setup";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold">Mission Settings</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Mission Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Client Name</Label>
          <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
        </div>
        <div>
          <Label>Procurement Type</Label>
          <Select value={form.procurement_type} onValueChange={(v) => setForm({ ...form, procurement_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROC_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Primary Contact Name</Label>
          <Input value={form.primary_contact_name}
                 onChange={(e) => setForm({ ...form, primary_contact_name: e.target.value })} />
        </div>
        <div>
          <Label>Primary Contact Email</Label>
          <Input type="email" value={form.primary_contact_email}
                 onChange={(e) => setForm({ ...form, primary_contact_email: e.target.value })} />
        </div>
        <div>
          <Label>Estimated Contract Value</Label>
          <Input type="number" value={form.contract_value}
                 onChange={(e) => setForm({ ...form, contract_value: e.target.value })} />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div>
          <Label>Submission Deadline</Label>
          <p className="text-sm">
            {mission.submission_deadline
              ? format(new Date(mission.submission_deadline), "PPP p")
              : "Not set"}
          </p>
          <p className="text-xs text-muted-foreground">
            To change the submission deadline contact your system administrator.
          </p>
        </div>
        <div>
          <Label>Mission Status</Label>
          <div><Badge variant="outline" className="capitalize">{mission.status}</Badge></div>
        </div>
        <div>
          <Label>BLAST OFF Date</Label>
          <p className="text-sm">
            {mission.blast_off_at ? format(new Date(mission.blast_off_at), "PPP p") : "Not yet launched"}
          </p>
        </div>
        <div>
          <Label>Created At</Label>
          <p className="text-sm">{format(new Date(mission.created_at), "PPP p")}</p>
        </div>
      </div>

      <Button onClick={save} disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
        Save Changes
      </Button>

      <div className="rounded-lg border-2 border-red-500/50 p-4 space-y-3">
        <h3 className="text-red-500 font-semibold">Danger Zone</h3>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Archive Mission</p>
            <p className="text-xs text-muted-foreground">Available after submission outcome.</p>
          </div>
          <Button
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-500/10"
            disabled={!canArchive}
            title={!canArchive ? "Missions can only be archived after submission." : undefined}
            onClick={() => setArchiveOpen(true)}
          >
            Archive
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Delete Mission</p>
            <p className="text-xs text-muted-foreground">Only available in Setup status.</p>
          </div>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={!canDelete}
            title={!canDelete ? "Only missions in Setup status can be deleted." : undefined}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive mission?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving will hide this mission from the active list. Team access is preserved but no new work can be submitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setTypedName(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the mission and all related records. Type the mission name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Type "{mission.name}" to confirm:</Label>
            <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={typedName !== mission.name}
              onClick={deleteMission}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
