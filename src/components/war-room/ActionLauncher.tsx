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
  AlertTriangle,
} from "lucide-react";
import {
  sosSchema,
  huddleSchema,
  broadcastSchema,
  pulseSchema,
  decisionSchema,
  riskSchema,
  heatmapSchema,
} from "./action-schemas";
import { useSchemaForm } from "./useSchemaForm";


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
  const f = useSchemaForm({
    schema: sosSchema,
    initialValues: { blocker: "", impact: "", who: "", by: "", requestType: "sos" as const },
    columnMap: SOS_COLUMNS,
    errorToast: "Couldn't raise request",
    successLabel: "Request raised",
    onSuccess,
    resetTo: { blocker: "", impact: "", who: "", by: "", requestType: "sos" as const },
    onSubmit: async (data) => {
      const desc = data.impact ? `${data.blocker}\n\nImpact: ${data.impact}` : data.blocker;
      const action = [data.who && `Owner: ${data.who}`, data.by && `Resolve by: ${data.by}`]
        .filter(Boolean).join(" · ");
      const isSos = data.requestType === "sos";
      return supabase.from("sos_alerts").insert({
        engagement_id: engagementId,
        submitted_by: userId,
        submitter_name: memberName,
        severity: isSos ? "High" : "Medium",
        category: "Other",
        request_type: data.requestType,
        description: desc,
        owner_name: data.who || null,
        recommended_action: action || null,
        status: "Open",
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Request type">
        <div className="flex gap-2">
          {([
            { value: "sos", label: "🚨 SOS — urgent" },
            { value: "support", label: "🤝 Support request" },
          ] as const).map((opt) => {
            const active = f.values.requestType === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => f.setField("requestType", opt.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition ${
                  active
                    ? opt.value === "sos"
                      ? "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
                      : "border-primary bg-primary/10 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label={f.values.requestType === "sos" ? "What is the blocker?" : "What do you need help with?"} error={f.err("blocker")}>
        <Textarea rows={3} value={f.values.blocker} onChange={(e) => f.setField("blocker", e.target.value)} onBlur={() => f.mark("blocker")} />
      </Field>
      <Field label={f.values.requestType === "sos" ? "Impact if unresolved" : "Context (optional)"} error={f.err("impact")}>
        <Textarea rows={2} value={f.values.impact} onChange={(e) => f.setField("impact", e.target.value)} onBlur={() => f.mark("impact")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who needs to act?" error={f.err("who")}>
          <Input value={f.values.who} onChange={(e) => f.setField("who", e.target.value)} onBlur={() => f.mark("who")} />
        </Field>
        <Field label={f.values.requestType === "sos" ? "Resolve by" : "Needed by"} error={f.err("by")}>
          <Input value={f.values.by} onChange={(e) => f.setField("by", e.target.value)} onBlur={() => f.mark("by")} placeholder="e.g. EOD Friday" />
        </Field>
      </div>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Huddle ----
export function HuddleForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm<{
    date: string; focus: string; attendees: string[]; flag: string;
  }>({
    schema: huddleSchema,
    initialValues: {
      date: new Date().toISOString().slice(0, 10),
      focus: "",
      attendees: [],
      flag: "",
    },
    columnMap: HUDDLE_COLUMNS,
    errorToast: "Couldn't save huddle",
    successLabel: "Huddle scheduled",
    onSuccess,
    resetTo: { focus: "", attendees: [], flag: "" },
    onSubmit: async (data) => {
      const notes = [
        `Date: ${data.date}`,
        data.attendees.length ? `Attendees: ${data.attendees.join(", ")}` : null,
        `Focus: ${data.focus}`,
        data.flag ? `Flag: ${data.flag}` : null,
      ].filter(Boolean).join("\n");
      return supabase.from("huddles").insert({
        engagement_id: engagementId,
        submitted_by: userId,
        submitter_name: memberName,
        health: "Yellow",
        priority: "Working session scheduled",
        notes,
        needs_leadership: false,
      });
    },
  });

  function toggleAttendee(name: string) {
    const next = f.values.attendees.includes(name)
      ? f.values.attendees.filter((n) => n !== name)
      : [...f.values.attendees, name];
    f.setField("attendees", next);
  }

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Date" error={f.err("date")}>
        <Input type="date" value={f.values.date} onChange={(e) => f.setField("date", e.target.value)} onBlur={() => f.mark("date")} />
      </Field>
      <Field label="Focus areas" error={f.err("focus")}>
        <Textarea rows={3} value={f.values.focus} onChange={(e) => f.setField("focus", e.target.value)} onBlur={() => f.mark("focus")} />
      </Field>
      <Field label="Attendees">
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2">
          {roster.length === 0 && <span className="text-xs text-muted-foreground">No teammates yet</span>}
          {roster.map((m) => {
            const sel = f.values.attendees.includes(m.display_name);
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
      <Field label="Anything to flag? (optional)" error={f.err("flag")}>
        <Textarea rows={2} value={f.values.flag} onChange={(e) => f.setField("flag", e.target.value)} onBlur={() => f.mark("flag")} />
      </Field>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Broadcast ----
export function BroadcastForm({ engagementId, userId, memberName, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm<{
    subject: string; message: string;
    tone: "Informational" | "Urgent" | "Encouraging" | "Reminder";
    audience: "Full team" | "SMEs only" | "Writers only" | "Leads only";
  }>({
    schema: broadcastSchema,
    initialValues: { subject: "", message: "", tone: "Informational", audience: "Full team" },
    columnMap: BROADCAST_COLUMNS,
    errorToast: "Couldn't send broadcast",
    successLabel: "Broadcast sent",
    onSuccess,
    resetTo: { subject: "", message: "" },
    onSubmit: async (data) => {
      const content = `${data.subject ? `**${data.subject}**\n` : ""}${data.message}\n\n— ${data.tone} · to ${data.audience}`;
      return supabase.from("broadcasts").insert({
        engagement_id: engagementId,
        author_id: userId,
        author_name: memberName,
        content,
        pinned: data.tone === "Urgent",
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Subject" error={f.err("subject")}>
        <Input value={f.values.subject} onChange={(e) => f.setField("subject", e.target.value)} onBlur={() => f.mark("subject")} />
      </Field>
      <Field label="Message" error={f.err("message")}>
        <Textarea rows={4} value={f.values.message} onChange={(e) => f.setField("message", e.target.value)} onBlur={() => f.mark("message")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tone">
          <Select value={f.values.tone} onValueChange={(v) => f.setField("tone", v as typeof f.values.tone)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Informational", "Urgent", "Encouraging", "Reminder"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Send to">
          <Select value={f.values.audience} onValueChange={(v) => f.setField("audience", v as typeof f.values.audience)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Full team", "SMEs only", "Writers only", "Leads only"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Pulse™ ----
export function PulseForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm<{
    period: string; pullRoster: boolean; completed: string; inProgress: string; issues: string;
  }>({
    schema: pulseSchema,
    initialValues: { period: "", pullRoster: false, completed: "", inProgress: "", issues: "" },
    columnMap: PULSE_COLUMNS,
    errorToast: "Couldn't log client pulse",
    successLabel: "Client pulse logged",
    onSuccess,
    resetTo: { period: "", pullRoster: false, completed: "", inProgress: "", issues: "" },
    onSubmit: async (data) => {
      const team = data.pullRoster && roster.length ? `\n\nTeam: ${roster.map((m) => m.display_name).join(", ")}` : "";
      const summary = `Period: ${data.period || "—"}\n\nCompleted:\n${data.completed}${team}`;
      const action_items = [
        data.inProgress && `In progress:\n${data.inProgress}`,
        data.issues && `Open issues / asks:\n${data.issues}`,
      ].filter(Boolean).join("\n\n");
      return supabase.from("client_pulses").insert({
        engagement_id: engagementId,
        recorded_by: userId,
        recorder_name: memberName,
        summary,
        action_items: action_items || null,
        sentiment: "Neutral",
        interaction_date: new Date().toISOString().slice(0, 10),
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Reporting period" error={f.err("period")}>
        <Input value={f.values.period} onChange={(e) => f.setField("period", e.target.value)} onBlur={() => f.mark("period")} placeholder="e.g. Week of Jan 15" />
      </Field>
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <Label htmlFor="pull-roster" className="cursor-pointer text-sm">Pull from roster?</Label>
        <Switch id="pull-roster" checked={f.values.pullRoster} onCheckedChange={(v) => f.setField("pullRoster", v)} />
      </div>
      <Field label="Sections completed" error={f.err("completed")}>
        <Textarea rows={3} value={f.values.completed} onChange={(e) => f.setField("completed", e.target.value)} onBlur={() => f.mark("completed")} />
      </Field>
      <Field label="In progress" error={f.err("inProgress")}>
        <Textarea rows={2} value={f.values.inProgress} onChange={(e) => f.setField("inProgress", e.target.value)} onBlur={() => f.mark("inProgress")} />
      </Field>
      <Field label="Open issues / asks" error={f.err("issues")}>
        <Textarea rows={2} value={f.values.issues} onChange={(e) => f.setField("issues", e.target.value)} onBlur={() => f.mark("issues")} />
      </Field>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Decisions ----
export function DecisionForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm({
    schema: decisionSchema,
    initialValues: {
      decision: "", madeBy: "", rationale: "",
      date: new Date().toISOString().slice(0, 10),
    },
    columnMap: DECISION_COLUMNS,
    errorToast: "Couldn't record decision",
    successLabel: "Decision recorded",
    onSuccess,
    resetTo: { decision: "", madeBy: "", rationale: "" },
    onSubmit: async (data) => {
      const title = data.decision.split("\n")[0].slice(0, 140);
      const impacted = data.decision.length > title.length ? data.decision.slice(title.length).trim() : null;
      return supabase.from("decisions").insert({
        engagement_id: engagementId,
        created_by: userId,
        title,
        impacted_areas: impacted,
        rationale: data.rationale || null,
        owner_name: data.madeBy || null,
        decision_date: data.date,
        status: "Final",
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Decision" error={f.err("decision")}>
        <Textarea rows={3} value={f.values.decision} onChange={(e) => f.setField("decision", e.target.value)} onBlur={() => f.mark("decision")} />
      </Field>
      <Field label="Made by" error={f.err("madeBy")}>
        <RosterSelect value={f.values.madeBy} onChange={(v) => f.setField("madeBy", v)} roster={roster} onBlur={() => f.mark("madeBy")} />
      </Field>
      <Field label="Rationale" error={f.err("rationale")}>
        <Textarea rows={3} value={f.values.rationale} onChange={(e) => f.setField("rationale", e.target.value)} onBlur={() => f.mark("rationale")} />
      </Field>
      <Field label="Date" error={f.err("date")}>
        <Input type="date" value={f.values.date} onChange={(e) => f.setField("date", e.target.value)} onBlur={() => f.mark("date")} />
      </Field>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Risks ----
export function RiskForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm<{
    description: string; section: string;
    likelihood: "Low" | "Medium" | "High";
    impact: "Low" | "Medium" | "High" | "Critical";
    mitigation: string; owner: string;
  }>({
    schema: riskSchema,
    initialValues: {
      description: "", section: "", likelihood: "Medium", impact: "Medium",
      mitigation: "", owner: "",
    },
    columnMap: RISK_COLUMNS,
    errorToast: "Couldn't log risk",
    successLabel: "Risk logged",
    onSuccess,
    resetTo: { description: "", section: "", mitigation: "", owner: "" },
    onSubmit: async (data) => {
      const title = data.description.split("\n")[0].slice(0, 140);
      const body = [
        data.section && `Section: ${data.section}`,
        data.description.length > title.length ? data.description : null,
        data.mitigation && `Mitigation: ${data.mitigation}`,
      ].filter(Boolean).join("\n\n");
      return supabase.from("risks").insert({
        engagement_id: engagementId,
        created_by: userId,
        title,
        description: body || null,
        likelihood: data.likelihood,
        severity: data.impact,
        owner_name: data.owner || null,
        status: "Open",
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Description" error={f.err("description")}>
        <Textarea rows={3} value={f.values.description} onChange={(e) => f.setField("description", e.target.value)} onBlur={() => f.mark("description")} />
      </Field>
      <Field label="Section affected" error={f.err("section")}>
        <Input value={f.values.section} onChange={(e) => f.setField("section", e.target.value)} onBlur={() => f.mark("section")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Likelihood">
          <Select value={f.values.likelihood} onValueChange={(v) => f.setField("likelihood", v as typeof f.values.likelihood)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Impact">
          <Select value={f.values.impact} onValueChange={(v) => f.setField("impact", v as typeof f.values.impact)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High", "Critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Mitigation" error={f.err("mitigation")}>
        <Textarea rows={2} value={f.values.mitigation} onChange={(e) => f.setField("mitigation", e.target.value)} onBlur={() => f.mark("mitigation")} />
      </Field>
      <Field label="Owner" error={f.err("owner")}>
        <RosterSelect value={f.values.owner} onChange={(v) => f.setField("owner", v)} roster={roster} onBlur={() => f.mark("owner")} />
      </Field>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Delivery Map ----
export function HeatmapForm({ engagementId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const f = useSchemaForm<{
    writer: string;
    issue: "Completeness" | "Compliance risk" | "Win theme strength" | "Behind schedule";
    section: string; notes: string;
  }>({
    schema: heatmapSchema,
    initialValues: { writer: "", issue: "Completeness", section: "", notes: "" },
    columnMap: HEATMAP_COLUMNS,
    errorToast: "Couldn't update delivery map",
    successLabel: "Heat map updated",
    onSuccess,
    resetTo: { writer: "", section: "", notes: "" },
    onSubmit: async (data) => {
      const statusForIssue: Record<string, string> = {
        "Completeness": "Yellow",
        "Compliance risk": "Red",
        "Win theme strength": "Yellow",
        "Behind schedule": "Red",
      };
      const noteBody = [
        data.writer && `Writer: ${data.writer}`,
        `Issue: ${data.issue}`,
        data.notes,
      ].filter(Boolean).join("\n");
      return supabase.from("heatmap_sections").insert({
        engagement_id: engagementId,
        section_name: data.section,
        status: statusForIssue[data.issue] ?? "Yellow",
        notes: noteBody,
        updated_by_name: memberName,
        sort_order: 999,
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-3" noValidate>
      <FormBanner message={f.formError} />
      <Field label="Writer">
        <RosterSelect value={f.values.writer} onChange={(v) => f.setField("writer", v)} roster={roster} />
      </Field>
      <Field label="Issue">
        <Select value={f.values.issue} onValueChange={(v) => f.setField("issue", v as typeof f.values.issue)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Completeness", "Compliance risk", "Win theme strength", "Behind schedule"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Section" error={f.err("section")}>
        <Input value={f.values.section} onChange={(e) => f.setField("section", e.target.value)} onBlur={() => f.mark("section")} />
      </Field>
      <Field label="Notes (optional)" error={f.err("notes")}>
        <Textarea rows={2} value={f.values.notes} onChange={(e) => f.setField("notes", e.target.value)} onBlur={() => f.mark("notes")} />
      </Field>
      <FormActions saving={f.saving} disabled={!f.valid} onCancel={onCancel} />
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
