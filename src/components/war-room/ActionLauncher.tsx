import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Megaphone,
  HeartPulse,
  CheckCircle2,
  LayoutGrid,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  sosSchema,
  huddleSchema,
  broadcastSchema,
  pulseSchema,
  decisionSchema,
  riskSchema,
  heatmapSchema,
  validate,
  mapSupabaseError,
  summarizeServerErrors,
  type FieldErrors,
} from "./action-schemas";
import { AlertTriangle } from "lucide-react";


type TileKey =
  | "huddle"
  | "broadcast"
  | "pulse"
  | "decision"
  | "heatmap";

type Tile = {
  key: TileKey;
  label: string;
  desc: string;
  color: string;
  icon: ReactNode;
};

const TILES: Tile[] = [
  { key: "huddle", label: "Huddle", desc: "Schedule a working session", color: "#0F6E56", icon: <Users className="h-4 w-4" /> },
  { key: "broadcast", label: "Broadcast", desc: "Send a team-wide message", color: "#533AB7", icon: <Megaphone className="h-4 w-4" /> },
  { key: "pulse", label: "Pulse™", desc: "Log a client touchpoint", color: "#185FA5", icon: <HeartPulse className="h-4 w-4" /> },
  { key: "decision", label: "Decisions", desc: "Record a leadership call", color: "#3B6D11", icon: <CheckCircle2 className="h-4 w-4" /> },
  { key: "heatmap", label: "Delivery Map", desc: "Flag a writer/section issue", color: "#993C1D", icon: <LayoutGrid className="h-4 w-4" /> },
];

type Roster = { display_name: string; role: string }[];

export function ActionLauncher() {
  const { engagement, member, canWrite } = useEngagement();
  const { user } = useSession();
  const [active, setActive] = useState<TileKey | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("engagement_members")
      .select("display_name, role")
      .eq("engagement_id", engagement.id)
      .order("display_name")
      .then(({ data }) => setRoster((data as Roster) ?? []));
  }, [engagement?.id]);

  const activeTile = useMemo(() => TILES.find((t) => t.key === active) ?? null, [active]);

  function onSuccess(label: string) {
    setJustSaved(label);
    setActive(null);
    setTimeout(() => setJustSaved(null), 3500);
  }

  if (!engagement || !member || !user) return null;
  if (!canWrite) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-center text-sm text-muted-foreground">
        <div className="font-semibold text-foreground">Read-only access</div>
        <div className="mt-1 text-xs">Viewers can browse this engagement but cannot create new records.</div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Tiles column */}
      <div className="rounded-xl border border-border bg-surface p-2">
        <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Action Launcher
        </div>
        <ul className="flex flex-col gap-1">
          {TILES.map((t) => {
            const isActive = active === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : t.key)}
                  className="group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:bg-surface-hover"
                  style={
                    isActive
                      ? {
                          background: `color-mix(in oklab, ${t.color} 14%, transparent)`,
                          borderLeft: `3px solid ${t.color}`,
                          paddingLeft: "9px",
                        }
                      : undefined
                  }
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                    style={{ background: t.color }}
                  >
                    {t.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-tight">{t.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t.desc}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {justSaved && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[color:var(--green)]/40 bg-[color:color-mix(in_oklab,var(--green)_14%,transparent)] px-3 py-2 text-xs text-[color:var(--green)]">
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="font-medium">{justSaved}</span>
          </div>
        )}
      </div>

      {/* Form column */}
      <div className="rounded-xl border border-border bg-surface p-5">
        {!activeTile ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <span className="text-base font-semibold text-foreground">Pick an action</span>
            <span className="mt-1 max-w-xs">
              Choose a tile on the left to file an SOS, log a decision, broadcast to the team, and more — without leaving the Mission.
            </span>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                style={{ background: activeTile.color }}
              >
                {activeTile.icon}
              </span>
              <h3 className="text-base font-bold">{activeTile.label}</h3>
            </div>
            <ActiveForm
              tile={activeTile}
              engagementId={engagement.id}
              userId={user.id}
              memberName={member.display_name}
              roster={roster}
              onSuccess={onSuccess}
              onCancel={() => setActive(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ----- forms -----

export type FormProps = {
  tile?: Tile;
  engagementId: string;
  userId: string;
  memberName: string;
  roster: Roster;
  onSuccess: (label: string) => void;
  onCancel: () => void;
};

function ActiveForm(props: FormProps) {
  switch (props.tile!.key) {
    case "huddle": return <HuddleForm {...props} />;
    case "broadcast": return <BroadcastForm {...props} />;
    case "pulse": return <PulseForm {...props} />;
    case "decision": return <DecisionForm {...props} />;
    case "heatmap": return <HeatmapForm {...props} />;
  }
}

function FormActions({
  saving,
  disabled,
  onCancel,
}: {
  saving: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      {saving && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving — please don't close this window…</span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || disabled}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Submit"}
        </Button>
      </div>
    </>
  );
}

function RosterSelect({
  value,
  onChange,
  roster,
  placeholder = "Select a teammate",
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  roster: Roster;
  placeholder?: string;
  onBlur?: () => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onChange(v);
        onBlur?.();
      }}
    >
      <SelectTrigger onBlur={onBlur}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {roster.length === 0 ? (
          <SelectItem value="__none" disabled>No teammates yet</SelectItem>
        ) : (
          roster.map((m) => (
            <SelectItem key={m.display_name} value={m.display_name}>
              {m.display_name} {m.role ? `· ${m.role}` : ""}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// Reusable touched/attempted tracker for inline error reveal
function useTouched<K extends string>() {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const mark = (k: K) => setTouched((p) => ({ ...p, [k]: true }));
  const show = (k: K) => attempted || !!touched[k];
  return { setAttempted, mark, show };
}

// Server-side (Supabase) error state, mirrored into the same field-keys
// the zod schema uses so every modal renders failures consistently.
function useServerErrors<V extends Record<string, unknown>>() {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof V, string>>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const clearField = (k: keyof V) =>
    setFieldErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  const reset = () => {
    setFieldErrors({});
    setFormError(undefined);
  };
  const apply = (next: {
    fieldErrors: Partial<Record<keyof V, string>>;
    formError?: string;
  }) => {
    setFieldErrors(next.fieldErrors);
    setFormError(next.formError);
  };
  return { fieldErrors, formError, clearField, reset, apply };
}

function FormBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-[color:var(--red,#ef4444)]/40 bg-[color:color-mix(in_oklab,var(--red,#ef4444)_10%,transparent)] px-3 py-2 text-xs text-[color:var(--red,#ef4444)]"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{message}</span>
    </div>
  );
}

// Column maps: DB column name -> form field key. Used by mapSupabaseError
// so a Postgres error mentioning "description" surfaces under the user's
// "blocker" field, etc.
const SOS_COLUMNS = {
  description: "blocker", owner_name: "who", recommended_action: "by",
} as const;
const HUDDLE_COLUMNS = {
  notes: "focus",
} as const;
const BROADCAST_COLUMNS = {
  content: "message",
} as const;
const PULSE_COLUMNS = {
  summary: "completed", action_items: "inProgress", interaction_date: "period",
} as const;
const DECISION_COLUMNS = {
  title: "decision", impacted_areas: "decision",
  owner_name: "madeBy", rationale: "rationale", decision_date: "date",
} as const;
const RISK_COLUMNS = {
  title: "description", description: "description",
  likelihood: "likelihood", severity: "impact", owner_name: "owner",
} as const;
const HEATMAP_COLUMNS = {
  section_name: "section", notes: "notes", status: "issue",
} as const;


// ---- SOS ----
export function SosForm({ engagementId, userId, memberName, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState({ blocker: "", impact: "", who: "", by: "" });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const server = useServerErrors<typeof values>();
  const { success, errors, data } = validate(sosSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined) ?? server.fieldErrors[k];
  const set = <K extends keyof typeof values>(k: K, v: string) => {
    setValues((p) => ({ ...p, [k]: v }));
    server.clearField(k);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    server.reset();
    const desc = data.impact ? `${data.blocker}\n\nImpact: ${data.impact}` : data.blocker;
    const action = [data.who && `Owner: ${data.who}`, data.by && `Resolve by: ${data.by}`]
      .filter(Boolean).join(" · ");
    const { error } = await supabase.from("sos_alerts").insert({
      engagement_id: engagementId,
      submitted_by: userId,
      submitter_name: memberName,
      severity: "High",
      category: "Blocker",
      description: desc,
      owner_name: data.who || null,
      recommended_action: action || null,
      status: "Open",
    });
    setSaving(false);
    if (error) {
      const mapped = mapSupabaseError<typeof values>(error, SOS_COLUMNS);
      server.apply(mapped);
      return toast.error("Couldn't raise SOS", {
        description: summarizeServerErrors(mapped) ?? error.message,
      });
    }
    setValues({ blocker: "", impact: "", who: "", by: "" });
    onSuccess("SOS raised");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <FormBanner message={server.formError} />
      <Field label="What is the blocker?" error={err("blocker")}>
        <Textarea rows={3} value={values.blocker} onChange={(e) => set("blocker", e.target.value)} onBlur={() => t.mark("blocker")} />
      </Field>
      <Field label="Impact if unresolved" error={err("impact")}>
        <Textarea rows={2} value={values.impact} onChange={(e) => set("impact", e.target.value)} onBlur={() => t.mark("impact")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who needs to act?" error={err("who")}>
          <Input value={values.who} onChange={(e) => set("who", e.target.value)} onBlur={() => t.mark("who")} />
        </Field>
        <Field label="Resolve by" error={err("by")}>
          <Input value={values.by} onChange={(e) => set("by", e.target.value)} onBlur={() => t.mark("by")} placeholder="e.g. EOD Friday" />
        </Field>
      </div>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Huddle ----
export function HuddleForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState<{
    date: string; focus: string; attendees: string[]; flag: string;
  }>({
    date: new Date().toISOString().slice(0, 10),
    focus: "",
    attendees: [],
    flag: "",
  });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(huddleSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  function toggleAttendee(name: string) {
    setValues((p) => ({
      ...p,
      attendees: p.attendees.includes(name)
        ? p.attendees.filter((n) => n !== name)
        : [...p.attendees, name],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const notes = [
      `Date: ${data.date}`,
      data.attendees.length ? `Attendees: ${data.attendees.join(", ")}` : null,
      `Focus: ${data.focus}`,
      data.flag ? `Flag: ${data.flag}` : null,
    ].filter(Boolean).join("\n");
    const { error } = await supabase.from("huddles").insert({
      engagement_id: engagementId,
      submitted_by: userId,
      submitter_name: memberName,
      health: "Yellow",
      priority: "Working session scheduled",
      notes,
      needs_leadership: false,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't save huddle", { description: error.message });
    setValues((p) => ({ ...p, focus: "", attendees: [], flag: "" }));
    onSuccess("Huddle scheduled");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Date" error={err("date")}>
        <Input type="date" value={values.date} onChange={(e) => setValues((p) => ({ ...p, date: e.target.value }))} onBlur={() => t.mark("date")} />
      </Field>
      <Field label="Focus areas" error={err("focus")}>
        <Textarea rows={3} value={values.focus} onChange={(e) => setValues((p) => ({ ...p, focus: e.target.value }))} onBlur={() => t.mark("focus")} />
      </Field>
      <Field label="Attendees">
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2">
          {roster.length === 0 && <span className="text-xs text-muted-foreground">No teammates yet</span>}
          {roster.map((m) => {
            const sel = values.attendees.includes(m.display_name);
            return (
              <button
                type="button"
                key={m.display_name}
                onClick={() => toggleAttendee(m.display_name)}
                className={
                  "rounded-full border px-2.5 py-1 text-xs transition " +
                  (sel ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-hover")
                }
              >
                {m.display_name}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Anything to flag? (optional)" error={err("flag")}>
        <Textarea rows={2} value={values.flag} onChange={(e) => setValues((p) => ({ ...p, flag: e.target.value }))} onBlur={() => t.mark("flag")} />
      </Field>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Broadcast ----
export function BroadcastForm({ engagementId, userId, memberName, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState<{
    subject: string; message: string;
    tone: "Informational" | "Urgent" | "Encouraging" | "Reminder";
    audience: "Full team" | "SMEs only" | "Writers only" | "Leads only";
  }>({ subject: "", message: "", tone: "Informational", audience: "Full team" });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(broadcastSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const content = `${data.subject ? `**${data.subject}**\n` : ""}${data.message}\n\n— ${data.tone} · to ${data.audience}`;
    const { error } = await supabase.from("broadcasts").insert({
      engagement_id: engagementId,
      author_id: userId,
      author_name: memberName,
      content,
      pinned: data.tone === "Urgent",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't send broadcast", { description: error.message });
    setValues((p) => ({ ...p, subject: "", message: "" }));
    onSuccess("Broadcast sent");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Subject" error={err("subject")}>
        <Input value={values.subject} onChange={(e) => setValues((p) => ({ ...p, subject: e.target.value }))} onBlur={() => t.mark("subject")} />
      </Field>
      <Field label="Message" error={err("message")}>
        <Textarea rows={4} value={values.message} onChange={(e) => setValues((p) => ({ ...p, message: e.target.value }))} onBlur={() => t.mark("message")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tone">
          <Select value={values.tone} onValueChange={(v) => setValues((p) => ({ ...p, tone: v as typeof p.tone }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Informational", "Urgent", "Encouraging", "Reminder"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Send to">
          <Select value={values.audience} onValueChange={(v) => setValues((p) => ({ ...p, audience: v as typeof p.audience }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Full team", "SMEs only", "Writers only", "Leads only"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Pulse™ ----
export function PulseForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState({
    period: "", pullRoster: false, completed: "", inProgress: "", issues: "",
  });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(pulseSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const team = data.pullRoster && roster.length ? `\n\nTeam: ${roster.map((m) => m.display_name).join(", ")}` : "";
    const summary = `Period: ${data.period || "—"}\n\nCompleted:\n${data.completed}${team}`;
    const action_items = [
      data.inProgress && `In progress:\n${data.inProgress}`,
      data.issues && `Open issues / asks:\n${data.issues}`,
    ].filter(Boolean).join("\n\n");
    const { error } = await supabase.from("client_pulses").insert({
      engagement_id: engagementId,
      recorded_by: userId,
      recorder_name: memberName,
      summary,
      action_items: action_items || null,
      sentiment: "Neutral",
      interaction_date: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    if (error) return toast.error("Couldn't log client pulse", { description: error.message });
    setValues({ period: "", pullRoster: false, completed: "", inProgress: "", issues: "" });
    onSuccess("Client pulse logged");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Reporting period" error={err("period")}>
        <Input value={values.period} onChange={(e) => setValues((p) => ({ ...p, period: e.target.value }))} onBlur={() => t.mark("period")} placeholder="e.g. Week of Jan 15" />
      </Field>
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <Label htmlFor="pull-roster" className="cursor-pointer text-sm">Pull from roster?</Label>
        <Switch id="pull-roster" checked={values.pullRoster} onCheckedChange={(v) => setValues((p) => ({ ...p, pullRoster: v }))} />
      </div>
      <Field label="Sections completed" error={err("completed")}>
        <Textarea rows={3} value={values.completed} onChange={(e) => setValues((p) => ({ ...p, completed: e.target.value }))} onBlur={() => t.mark("completed")} />
      </Field>
      <Field label="In progress" error={err("inProgress")}>
        <Textarea rows={2} value={values.inProgress} onChange={(e) => setValues((p) => ({ ...p, inProgress: e.target.value }))} onBlur={() => t.mark("inProgress")} />
      </Field>
      <Field label="Open issues / asks" error={err("issues")}>
        <Textarea rows={2} value={values.issues} onChange={(e) => setValues((p) => ({ ...p, issues: e.target.value }))} onBlur={() => t.mark("issues")} />
      </Field>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Decisions ----
export function DecisionForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState({
    decision: "", madeBy: "", rationale: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(decisionSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const title = data.decision.split("\n")[0].slice(0, 140);
    const impacted = data.decision.length > title.length ? data.decision.slice(title.length).trim() : null;
    const { error } = await supabase.from("decisions").insert({
      engagement_id: engagementId,
      created_by: userId,
      title,
      impacted_areas: impacted,
      rationale: data.rationale || null,
      owner_name: data.madeBy || null,
      decision_date: data.date,
      status: "Final",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't record decision", { description: error.message });
    setValues((p) => ({ ...p, decision: "", madeBy: "", rationale: "" }));
    onSuccess("Decision recorded");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Decision" error={err("decision")}>
        <Textarea rows={3} value={values.decision} onChange={(e) => setValues((p) => ({ ...p, decision: e.target.value }))} onBlur={() => t.mark("decision")} />
      </Field>
      <Field label="Made by" error={err("madeBy")}>
        <RosterSelect value={values.madeBy} onChange={(v) => setValues((p) => ({ ...p, madeBy: v }))} roster={roster} onBlur={() => t.mark("madeBy")} />
      </Field>
      <Field label="Rationale" error={err("rationale")}>
        <Textarea rows={3} value={values.rationale} onChange={(e) => setValues((p) => ({ ...p, rationale: e.target.value }))} onBlur={() => t.mark("rationale")} />
      </Field>
      <Field label="Date" error={err("date")}>
        <Input type="date" value={values.date} onChange={(e) => setValues((p) => ({ ...p, date: e.target.value }))} onBlur={() => t.mark("date")} />
      </Field>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Risks ----
export function RiskForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState<{
    description: string; section: string;
    likelihood: "Low" | "Medium" | "High";
    impact: "Low" | "Medium" | "High" | "Critical";
    mitigation: string; owner: string;
  }>({
    description: "", section: "", likelihood: "Medium", impact: "Medium",
    mitigation: "", owner: "",
  });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(riskSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const title = data.description.split("\n")[0].slice(0, 140);
    const body = [
      data.section && `Section: ${data.section}`,
      data.description.length > title.length ? data.description : null,
      data.mitigation && `Mitigation: ${data.mitigation}`,
    ].filter(Boolean).join("\n\n");
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagementId,
      created_by: userId,
      title,
      description: body || null,
      likelihood: data.likelihood,
      severity: data.impact,
      owner_name: data.owner || null,
      status: "Open",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't log risk", { description: error.message });
    setValues((p) => ({ ...p, description: "", section: "", mitigation: "", owner: "" }));
    onSuccess("Risk logged");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Description" error={err("description")}>
        <Textarea rows={3} value={values.description} onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))} onBlur={() => t.mark("description")} />
      </Field>
      <Field label="Section affected" error={err("section")}>
        <Input value={values.section} onChange={(e) => setValues((p) => ({ ...p, section: e.target.value }))} onBlur={() => t.mark("section")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Likelihood">
          <Select value={values.likelihood} onValueChange={(v) => setValues((p) => ({ ...p, likelihood: v as typeof p.likelihood }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Impact">
          <Select value={values.impact} onValueChange={(v) => setValues((p) => ({ ...p, impact: v as typeof p.impact }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High", "Critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Mitigation" error={err("mitigation")}>
        <Textarea rows={2} value={values.mitigation} onChange={(e) => setValues((p) => ({ ...p, mitigation: e.target.value }))} onBlur={() => t.mark("mitigation")} />
      </Field>
      <Field label="Owner" error={err("owner")}>
        <RosterSelect value={values.owner} onChange={(v) => setValues((p) => ({ ...p, owner: v }))} roster={roster} onBlur={() => t.mark("owner")} />
      </Field>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

// ---- Delivery Map ----
export function HeatmapForm({ engagementId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [values, setValues] = useState<{
    writer: string;
    issue: "Completeness" | "Compliance risk" | "Win theme strength" | "Behind schedule";
    section: string; notes: string;
  }>({ writer: "", issue: "Completeness", section: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const t = useTouched<keyof typeof values>();
  const { success, errors, data } = validate(heatmapSchema, values);
  const err = (k: keyof typeof values): string | undefined =>
    (t.show(k) ? (errors as FieldErrors<typeof values>)[k] : undefined);

  const statusForIssue: Record<string, string> = {
    "Completeness": "Yellow",
    "Compliance risk": "Red",
    "Win theme strength": "Yellow",
    "Behind schedule": "Red",
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!success || !data) return;
    setSaving(true);
    const noteBody = [
      data.writer && `Writer: ${data.writer}`,
      `Issue: ${data.issue}`,
      data.notes,
    ].filter(Boolean).join("\n");
    const { error } = await supabase.from("heatmap_sections").insert({
      engagement_id: engagementId,
      section_name: data.section,
      status: statusForIssue[data.issue] ?? "Yellow",
      notes: noteBody,
      updated_by_name: memberName,
      sort_order: 999,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't update delivery map", { description: error.message });
    setValues((p) => ({ ...p, writer: "", section: "", notes: "" }));
    onSuccess("Heat map updated");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Writer">
        <RosterSelect value={values.writer} onChange={(v) => setValues((p) => ({ ...p, writer: v }))} roster={roster} />
      </Field>
      <Field label="Issue">
        <Select value={values.issue} onValueChange={(v) => setValues((p) => ({ ...p, issue: v as typeof p.issue }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Completeness", "Compliance risk", "Win theme strength", "Behind schedule"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Section" error={err("section")}>
        <Input value={values.section} onChange={(e) => setValues((p) => ({ ...p, section: e.target.value }))} onBlur={() => t.mark("section")} />
      </Field>
      <Field label="Notes (optional)" error={err("notes")}>
        <Textarea rows={2} value={values.notes} onChange={(e) => setValues((p) => ({ ...p, notes: e.target.value }))} onBlur={() => t.mark("notes")} />
      </Field>
      <FormActions saving={saving} disabled={!success} onCancel={onCancel} />
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {error && (
        <p className="text-[11px] font-medium text-[color:var(--red,#ef4444)]">{error}</p>
      )}
    </div>
  );
}
