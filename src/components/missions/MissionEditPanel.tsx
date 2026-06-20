import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { logAudit } from "@/lib/mission-helpers";

const PROC_TYPES = ["RFP", "RFI", "RFQ", "IFB", "Sole Source", "Task Order", "Other"];

export type EditableMission = {
  id: string;
  name: string;
  client_name: string | null;
  procurement_type: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  contract_value: number | null;
  submission_deadline: string | null;
};

export function MissionEditPanel({
  missionId,
  open,
  onOpenChange,
}: {
  missionId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    client_name: "",
    procurement_type: "RFP",
    primary_contact_name: "",
    primary_contact_email: "",
    contract_value: "",
    submission_deadline: "",
  });

  useEffect(() => {
    if (!open || !missionId) return;
    setLoading(true);
    supabase
      .from("missions")
      .select("name,client_name,procurement_type,primary_contact_name,primary_contact_email,contract_value,submission_deadline")
      .eq("id", missionId)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) {
          toast.error(error?.message ?? "Couldn't load mission");
          return;
        }
        setForm({
          name: data.name ?? "",
          client_name: data.client_name ?? "",
          procurement_type: String(data.procurement_type ?? "RFP"),
          primary_contact_name: data.primary_contact_name ?? "",
          primary_contact_email: data.primary_contact_email ?? "",
          contract_value: data.contract_value?.toString() ?? "",
          submission_deadline: data.submission_deadline
            ? new Date(data.submission_deadline).toISOString().slice(0, 16)
            : "",
        });
      });
  }, [open, missionId]);

  const save = async () => {
    if (!missionId) return;
    setSaving(true);
    const { error } = await supabase
      .from("missions")
      .update({
        name: form.name,
        client_name: form.client_name || null,
        procurement_type: form.procurement_type,
        primary_contact_name: form.primary_contact_name || null,
        primary_contact_email: form.primary_contact_email || null,
        contract_value: form.contract_value ? Number(form.contract_value) : null,
        submission_deadline: form.submission_deadline
          ? new Date(form.submission_deadline).toISOString()
          : undefined,
      })
      .eq("id", missionId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit({ missionId, action: "Mission edited from card" });
    toast.success("Mission updated.");
    qc.invalidateQueries({ queryKey: ["missions-list"] });
    qc.invalidateQueries({ queryKey: ["mission-settings", missionId] });
    qc.invalidateQueries({ queryKey: ["mission-header", missionId] });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Mission</SheetTitle>
          <SheetDescription>Update mission details. Changes save immediately.</SheetDescription>
        </SheetHeader>
        {loading ? (
          <div className="py-10 text-[14px] text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4 py-4">
            <div>
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
              <Label>Submission Deadline</Label>
              <Input
                type="datetime-local"
                value={form.submission_deadline}
                onChange={(e) => setForm({ ...form, submission_deadline: e.target.value })}
              />
            </div>
            <div>
              <Label>Primary Contact Name</Label>
              <Input
                value={form.primary_contact_name}
                onChange={(e) => setForm({ ...form, primary_contact_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Primary Contact Email</Label>
              <Input
                type="email"
                value={form.primary_contact_email}
                onChange={(e) => setForm({ ...form, primary_contact_email: e.target.value })}
              />
            </div>
            <div>
              <Label>Estimated Contract Value</Label>
              <Input
                type="number"
                value={form.contract_value}
                onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
              />
            </div>
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
