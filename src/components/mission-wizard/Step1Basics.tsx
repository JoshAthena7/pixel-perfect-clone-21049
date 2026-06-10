import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logAuditEvent } from "@/lib/mission-audit";

export type Step1Values = {
  name: string;
  client_name: string;
  procurement_type: string;
  submission_deadline: string; // datetime-local
  primary_contact_name: string;
  primary_contact_email: string;
  contract_value: string;
};

const EMPTY: Step1Values = {
  name: "",
  client_name: "",
  procurement_type: "",
  submission_deadline: "",
  primary_contact_name: "",
  primary_contact_email: "",
  contract_value: "",
};

const PROCUREMENT_TYPES = [
  { v: "managed_care_rfp", l: "Managed Care RFP" },
  { v: "csa", l: "CSA" },
  { v: "bpo", l: "BPO" },
  { v: "consulting", l: "Consulting" },
  { v: "other", l: "Other" },
];

export function Step1Basics({
  initial,
  missionId,
}: {
  initial?: Partial<Step1Values>;
  missionId?: string;
}) {
  const navigate = useNavigate();
  const [v, setV] = useState<Step1Values>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shake, setShake] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) setV((cur) => ({ ...cur, ...initial }));
  }, [initial]);

  const required = ["name", "client_name", "procurement_type", "submission_deadline"] as const;
  const isValid = required.every((k) => String(v[k] ?? "").trim().length > 0);

  const set = <K extends keyof Step1Values>(k: K, val: Step1Values[K]) => {
    setV((cur) => ({ ...cur, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: false }));
  };

  async function handleNext() {
    const newErr: Record<string, boolean> = {};
    const newShake: Record<string, boolean> = {};
    for (const k of required) {
      if (!String(v[k] ?? "").trim()) {
        newErr[k] = true;
        newShake[k] = true;
      }
    }
    if (Object.keys(newErr).length) {
      setErrors(newErr);
      setShake(newShake);
      setTimeout(() => setShake({}), 500);
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const payload = {
        name: v.name.trim(),
        client_name: v.client_name.trim(),
        procurement_type: v.procurement_type,
        submission_deadline: new Date(v.submission_deadline).toISOString(),
        primary_contact_name: v.primary_contact_name.trim() || null,
        primary_contact_email: v.primary_contact_email.trim() || null,
        contract_value: v.contract_value ? Number(v.contract_value) : null,
        status: "setup" as const,
      };

      let id = missionId;
      if (missionId) {
        const { error } = await supabase.from("missions").update(payload).eq("id", missionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("missions")
          .insert({ ...payload, created_by: uid })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
        void logAuditEvent(id!, "Mission created", uid, null, {
          mission_name: payload.name,
          client_name: payload.client_name,
        });
      }
      navigate({
        to: "/olympus/missions/$missionId/wizard",
        params: { missionId: id! },
        search: { step: 2 },
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to create mission. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Let's build your mission.</h1>
        <p className="text-muted-foreground">Start with the basics. Everything else flows from here.</p>
      </div>

      <div className="space-y-5">
        <Field label="Mission Name" required error={errors.name} shake={shake.name}>
          <Input
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. NJ CSOC RFP"
          />
        </Field>

        <Field label="Client Name" required error={errors.client_name} shake={shake.client_name}>
          <Input
            value={v.client_name}
            onChange={(e) => set("client_name", e.target.value)}
            placeholder="Full legal name of the procuring entity"
          />
        </Field>

        <Field
          label="Procurement Type"
          required
          error={errors.procurement_type}
          shake={shake.procurement_type}
        >
          <Select value={v.procurement_type} onValueChange={(val) => set("procurement_type", val)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select procurement type" />
            </SelectTrigger>
            <SelectContent>
              {PROCUREMENT_TYPES.map((p) => (
                <SelectItem key={p.v} value={p.v}>
                  {p.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Submission Deadline"
          required
          error={errors.submission_deadline}
          shake={shake.submission_deadline}
          helper="Everything in this mission cascades from this date. Set it carefully."
        >
          <Input
            type="datetime-local"
            value={v.submission_deadline}
            onChange={(e) => set("submission_deadline", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Primary Contact Name">
            <Input
              value={v.primary_contact_name}
              onChange={(e) => set("primary_contact_name", e.target.value)}
              placeholder="Client point of contact"
            />
          </Field>
          <Field label="Primary Contact Email">
            <Input
              type="email"
              value={v.primary_contact_email}
              onChange={(e) => set("primary_contact_email", e.target.value)}
              placeholder="contact@agency.gov"
            />
          </Field>
        </div>

        <Field
          label="Estimated Contract Value"
          helper="Used for mission prioritization. Optional."
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              min="0"
              value={v.contract_value}
              onChange={(e) => set("contract_value", e.target.value)}
              placeholder="0"
              className="pl-7"
            />
          </div>
        </Field>
      </div>

      <div className="flex justify-center pt-2">
        <Button
          onClick={handleNext}
          disabled={!isValid || saving}
          className={cn(
            "w-full sm:w-auto sm:min-w-[260px] bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]",
            (!isValid || saving) && "opacity-40",
          )}
        >
          {saving ? "Saving…" : "Next — Upload RFP →"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  shake,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  shake?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", shake && "animate-[wizard-shake_0.4s_ease-in-out]")}>
      <Label className="text-sm">
        {label}
        {required && <span className="text-[var(--athena-gold)] ml-0.5">*</span>}
      </Label>
      {children}
      {helper && !error && <p className="text-xs text-muted-foreground">{helper}</p>}
      {error && <p className="text-xs text-destructive">This field is required.</p>}
    </div>
  );
}
