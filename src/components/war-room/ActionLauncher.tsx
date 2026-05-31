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

// ---- validation helpers ----
type Errors = Record<string, string | undefined>;

function required(v: string, label = "Required"): string | undefined {
  return v.trim().length === 0 ? label : undefined;
}
function maxLen(v: string, max: number): string | undefined {
  return v.length > max ? `Keep under ${max} characters (${v.length})` : undefined;
}
function isoDate(v: string): string | undefined {
  if (!v) return "Pick a date";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
    ? undefined
    : "Use a valid date";
}
function firstError(...errs: (string | undefined)[]): string | undefined {
  return errs.find(Boolean);
}
function isValid(errors: Errors): boolean {
  return Object.values(errors).every((e) => !e);
}
function useTouched<K extends string>() {
  const [touched, setTouched] = useState<Record<K, boolean>>({} as Record<K, boolean>);
  const [attempted, setAttempted] = useState(false);
  const mark = (k: K) => setTouched((p) => ({ ...p, [k]: true }));
  const show = (k: K) => attempted || touched[k];
  return { touched, attempted, setAttempted, mark, show };
}

// ---- SOS ----
export function SosForm({ engagementId, userId, memberName, onSuccess, onCancel }: FormProps) {
  const [blocker, setBlocker] = useState("");
  const [impact, setImpact] = useState("");
  const [who, setWho] = useState("");
  const [by, setBy] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"blocker" | "impact" | "who" | "by">();

  const errors: Errors = {
    blocker: firstError(required(blocker, "Describe the blocker"), maxLen(blocker, 2000)),
    impact: maxLen(impact, 2000),
    who: maxLen(who, 120),
    by: maxLen(by, 120),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const desc = impact ? `${blocker}\n\nImpact: ${impact}` : blocker;
    const action = [who && `Owner: ${who}`, by && `Resolve by: ${by}`].filter(Boolean).join(" · ");
    const { error } = await supabase.from("sos_alerts").insert({
      engagement_id: engagementId,
      submitted_by: userId,
      submitter_name: memberName,
      severity: "High",
      category: "Blocker",
      description: desc,
      owner_name: who || null,
      recommended_action: action || null,
      status: "Open",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't raise SOS", { description: error.message });
    setBlocker(""); setImpact(""); setWho(""); setBy("");
    onSuccess("SOS raised");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="What is the blocker?" error={t.show("blocker") ? errors.blocker : undefined}>
        <Textarea rows={3} value={blocker} onChange={(e) => setBlocker(e.target.value)} onBlur={() => t.mark("blocker")} />
      </Field>
      <Field label="Impact if unresolved" error={t.show("impact") ? errors.impact : undefined}>
        <Textarea rows={2} value={impact} onChange={(e) => setImpact(e.target.value)} onBlur={() => t.mark("impact")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who needs to act?" error={t.show("who") ? errors.who : undefined}>
          <Input value={who} onChange={(e) => setWho(e.target.value)} onBlur={() => t.mark("who")} />
        </Field>
        <Field label="Resolve by" error={t.show("by") ? errors.by : undefined}>
          <Input value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => t.mark("by")} placeholder="e.g. EOD Friday" />
        </Field>
      </div>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Huddle ----
export function HuddleForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [focus, setFocus] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [flag, setFlag] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"date" | "focus" | "flag">();

  const errors: Errors = {
    date: isoDate(date),
    focus: firstError(required(focus, "Add focus areas"), maxLen(focus, 2000)),
    flag: maxLen(flag, 2000),
  };
  const valid = isValid(errors);

  function toggleAttendee(name: string) {
    setAttendees((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const notes = [
      `Date: ${date}`,
      attendees.length ? `Attendees: ${attendees.join(", ")}` : null,
      `Focus: ${focus}`,
      flag ? `Flag: ${flag}` : null,
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
    setFocus(""); setAttendees([]); setFlag("");
    onSuccess("Huddle scheduled");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Date" error={t.show("date") ? errors.date : undefined}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => t.mark("date")} />
      </Field>
      <Field label="Focus areas" error={t.show("focus") ? errors.focus : undefined}>
        <Textarea rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} onBlur={() => t.mark("focus")} />
      </Field>
      <Field label="Attendees">
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2">
          {roster.length === 0 && <span className="text-xs text-muted-foreground">No teammates yet</span>}
          {roster.map((m) => {
            const sel = attendees.includes(m.display_name);
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
      <Field label="Anything to flag? (optional)" error={t.show("flag") ? errors.flag : undefined}>
        <Textarea rows={2} value={flag} onChange={(e) => setFlag(e.target.value)} onBlur={() => t.mark("flag")} />
      </Field>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Broadcast ----
export function BroadcastForm({ engagementId, userId, memberName, onSuccess, onCancel }: FormProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("Informational");
  const [audience, setAudience] = useState("Full team");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"subject" | "message">();

  const errors: Errors = {
    subject: maxLen(subject, 140),
    message: firstError(required(message, "Write a message"), maxLen(message, 4000)),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const content = `${subject ? `**${subject}**\n` : ""}${message}\n\n— ${tone} · to ${audience}`;
    const { error } = await supabase.from("broadcasts").insert({
      engagement_id: engagementId,
      author_id: userId,
      author_name: memberName,
      content,
      pinned: tone === "Urgent",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't send broadcast", { description: error.message });
    setSubject(""); setMessage("");
    onSuccess("Broadcast sent");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Subject" error={t.show("subject") ? errors.subject : undefined}>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={() => t.mark("subject")} />
      </Field>
      <Field label="Message" error={t.show("message") ? errors.message : undefined}>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} onBlur={() => t.mark("message")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tone">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Informational", "Urgent", "Encouraging", "Reminder"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Send to">
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Full team", "SMEs only", "Writers only", "Leads only"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Pulse™ ----
export function PulseForm({ engagementId, userId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [period, setPeriod] = useState("");
  const [pullRoster, setPullRoster] = useState(false);
  const [completed, setCompleted] = useState("");
  const [inProgress, setInProgress] = useState("");
  const [issues, setIssues] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"period" | "completed" | "inProgress" | "issues">();

  const errors: Errors = {
    period: maxLen(period, 140),
    completed: firstError(required(completed, "Fill in sections completed"), maxLen(completed, 4000)),
    inProgress: maxLen(inProgress, 4000),
    issues: maxLen(issues, 4000),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const team = pullRoster && roster.length ? `\n\nTeam: ${roster.map((m) => m.display_name).join(", ")}` : "";
    const summary = `Period: ${period || "—"}\n\nCompleted:\n${completed}${team}`;
    const action_items = [
      inProgress && `In progress:\n${inProgress}`,
      issues && `Open issues / asks:\n${issues}`,
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
    setPeriod(""); setCompleted(""); setInProgress(""); setIssues(""); setPullRoster(false);
    onSuccess("Client pulse logged");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Reporting period" error={t.show("period") ? errors.period : undefined}>
        <Input value={period} onChange={(e) => setPeriod(e.target.value)} onBlur={() => t.mark("period")} placeholder="e.g. Week of Jan 15" />
      </Field>
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <Label htmlFor="pull-roster" className="cursor-pointer text-sm">Pull from roster?</Label>
        <Switch id="pull-roster" checked={pullRoster} onCheckedChange={setPullRoster} />
      </div>
      <Field label="Sections completed" error={t.show("completed") ? errors.completed : undefined}>
        <Textarea rows={3} value={completed} onChange={(e) => setCompleted(e.target.value)} onBlur={() => t.mark("completed")} />
      </Field>
      <Field label="In progress" error={t.show("inProgress") ? errors.inProgress : undefined}>
        <Textarea rows={2} value={inProgress} onChange={(e) => setInProgress(e.target.value)} onBlur={() => t.mark("inProgress")} />
      </Field>
      <Field label="Open issues / asks" error={t.show("issues") ? errors.issues : undefined}>
        <Textarea rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} onBlur={() => t.mark("issues")} />
      </Field>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Decisions ----
export function DecisionForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const [decision, setDecision] = useState("");
  const [madeBy, setMadeBy] = useState("");
  const [rationale, setRationale] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const t = useTouched<"decision" | "madeBy" | "rationale" | "date">();

  const errors: Errors = {
    decision: firstError(required(decision, "Describe the decision"), maxLen(decision, 2000)),
    madeBy: required(madeBy, "Pick who made the call"),
    rationale: maxLen(rationale, 2000),
    date: isoDate(date),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const title = decision.split("\n")[0].slice(0, 140);
    const impacted = decision.length > title.length ? decision.slice(title.length).trim() : null;
    const { error } = await supabase.from("decisions").insert({
      engagement_id: engagementId,
      created_by: userId,
      title,
      impacted_areas: impacted,
      rationale: rationale || null,
      owner_name: madeBy || null,
      decision_date: date,
      status: "Final",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't record decision", { description: error.message });
    setDecision(""); setMadeBy(""); setRationale("");
    onSuccess("Decision recorded");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Decision" error={t.show("decision") ? errors.decision : undefined}>
        <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} onBlur={() => t.mark("decision")} />
      </Field>
      <Field label="Made by" error={t.show("madeBy") ? errors.madeBy : undefined}>
        <RosterSelect value={madeBy} onChange={setMadeBy} roster={roster} onBlur={() => t.mark("madeBy")} />
      </Field>
      <Field label="Rationale" error={t.show("rationale") ? errors.rationale : undefined}>
        <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={() => t.mark("rationale")} />
      </Field>
      <Field label="Date" error={t.show("date") ? errors.date : undefined}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => t.mark("date")} />
      </Field>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Risks ----
export function RiskForm({ engagementId, userId, roster, onSuccess, onCancel }: FormProps) {
  const [description, setDescription] = useState("");
  const [section, setSection] = useState("");
  const [likelihood, setLikelihood] = useState("Medium");
  const [impact, setImpact] = useState("Medium");
  const [mitigation, setMitigation] = useState("");
  const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"description" | "section" | "mitigation" | "owner">();

  const errors: Errors = {
    description: firstError(required(description, "Describe the risk"), maxLen(description, 2000)),
    section: maxLen(section, 140),
    mitigation: maxLen(mitigation, 2000),
    owner: maxLen(owner, 120),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const title = description.split("\n")[0].slice(0, 140);
    const body = [
      section && `Section: ${section}`,
      description.length > title.length ? description : null,
      mitigation && `Mitigation: ${mitigation}`,
    ].filter(Boolean).join("\n\n");
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagementId,
      created_by: userId,
      title,
      description: body || null,
      likelihood,
      severity: impact,
      owner_name: owner || null,
      status: "Open",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't log risk", { description: error.message });
    setDescription(""); setSection(""); setMitigation(""); setOwner("");
    onSuccess("Risk logged");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Description" error={t.show("description") ? errors.description : undefined}>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => t.mark("description")} />
      </Field>
      <Field label="Section affected" error={t.show("section") ? errors.section : undefined}>
        <Input value={section} onChange={(e) => setSection(e.target.value)} onBlur={() => t.mark("section")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Likelihood">
          <Select value={likelihood} onValueChange={setLikelihood}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Impact">
          <Select value={impact} onValueChange={setImpact}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Low", "Medium", "High", "Critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Mitigation" error={t.show("mitigation") ? errors.mitigation : undefined}>
        <Textarea rows={2} value={mitigation} onChange={(e) => setMitigation(e.target.value)} onBlur={() => t.mark("mitigation")} />
      </Field>
      <Field label="Owner" error={t.show("owner") ? errors.owner : undefined}>
        <RosterSelect value={owner} onChange={setOwner} roster={roster} onBlur={() => t.mark("owner")} />
      </Field>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
    </form>
  );
}

// ---- Delivery Map ----
export function HeatmapForm({ engagementId, memberName, roster, onSuccess, onCancel }: FormProps) {
  const [writer, setWriter] = useState("");
  const [issue, setIssue] = useState("Completeness");
  const [section, setSection] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTouched<"section" | "notes">();

  const statusForIssue: Record<string, string> = {
    "Completeness": "Yellow",
    "Compliance risk": "Red",
    "Win theme strength": "Yellow",
    "Behind schedule": "Red",
  };

  const errors: Errors = {
    section: firstError(required(section, "Add a section"), maxLen(section, 140)),
    notes: maxLen(notes, 2000),
  };
  const valid = isValid(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    t.setAttempted(true);
    if (!valid) return;
    setSaving(true);
    const noteBody = [
      writer && `Writer: ${writer}`,
      `Issue: ${issue}`,
      notes,
    ].filter(Boolean).join("\n");
    const { error } = await supabase.from("heatmap_sections").insert({
      engagement_id: engagementId,
      section_name: section,
      status: statusForIssue[issue] ?? "Yellow",
      notes: noteBody,
      updated_by_name: memberName,
      sort_order: 999,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't update delivery map", { description: error.message });
    setWriter(""); setSection(""); setNotes("");
    onSuccess("Heat map updated");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Writer">
        <RosterSelect value={writer} onChange={setWriter} roster={roster} />
      </Field>
      <Field label="Issue">
        <Select value={issue} onValueChange={setIssue}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Completeness", "Compliance risk", "Win theme strength", "Behind schedule"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Section" error={t.show("section") ? errors.section : undefined}>
        <Input value={section} onChange={(e) => setSection(e.target.value)} onBlur={() => t.mark("section")} />
      </Field>
      <Field label="Notes (optional)" error={t.show("notes") ? errors.notes : undefined}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => t.mark("notes")} />
      </Field>
      <FormActions saving={saving} disabled={!valid} onCancel={onCancel} />
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
