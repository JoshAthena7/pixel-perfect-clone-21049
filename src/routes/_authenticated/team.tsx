import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "@/lib/email/send";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, Hash, Radio, Pencil, X, Check, Upload, AlertTriangle, UserPlus, Copy, Link as LinkIcon, ShieldCheck, ShieldAlert } from "lucide-react";
import { RecognitionSummary, MemberRecognitionPanel, usePulses, type FormKind } from "@/components/war-room/Recognition";
import { PresenceDot } from "@/components/war-room/comms/PresenceDot";
import { NudgeButton } from "@/components/war-room/comms/NudgeButton";
import { useComms } from "@/hooks/use-comms";
import { useTriviaWinnerId } from "@/hooks/use-trivia-winner";
import { MoraleCard } from "@/components/war-room/MoraleCard";

const VALID_ROLES = new Set(["founder", "pm", "engagement_lead", "writer", "reviewer", "viewer"]);

// Map free-text role/title strings (e.g. "Project Executive", "SME — LTSS Lead",
// "Graphic Artist", "Proposal Quality Manager") to a permission token.
// Returns null when no confident mapping is possible.
function mapFreeTextRole(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (VALID_ROLES.has(s)) return s;
  // Executive / founder level
  if (/\b(project\s+executive|executive\s+lead|founder|principal|managing\s+partner|ceo)\b/.test(s)) return "founder";
  // Project Manager / PMO
  if (/\b(project\s+manager|pmo|program\s+manager|capture\s+manager)\b/.test(s)) return "pm";
  // Quality / engagement lead
  if (/\b(quality\s+(manager|lead)|proposal\s+quality|engagement\s+(quality\s+)?lead|review\s+lead)\b/.test(s)) return "engagement_lead";
  // Content contributors → writer bucket
  if (/\b(sme|writer|graphic\s+artist|graphics?\s+lead|designer|illustrator|editor|analyst|consultant)\b/.test(s)) return "writer";
  // Read-only buckets
  if (/\breviewer\b/.test(s)) return "reviewer";
  if (/\bviewer\b/.test(s)) return "viewer";
  return null;
}

// 5 leader presets — map display label to the underlying RLS role token + a default title.
const INVITE_PRESETS = [
  { key: "executive_lead", label: "Executive Lead", role: "founder", title: "Executive Lead" },
  { key: "engagement_quality_lead", label: "Engagement Quality Lead", role: "engagement_lead", title: "Engagement Quality Lead" },
  { key: "project_manager", label: "Project Manager", role: "pm", title: "Project Manager" },
  { key: "graphics_lead", label: "Graphics Lead", role: "writer", title: "Graphics Lead" },
  { key: "lead_writer", label: "Lead Writer", role: "writer", title: "Lead Writer" },
] as const;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  return /^(true|yes|y|1)$/i.test(v.trim());
}

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Collective™ — Athena Command™" }] }),
  component: TeamPage,
});

type Member = {
  id: string;
  user_id: string | null;
  display_name: string;
  role: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  slack_handle: string | null;
  timezone: string | null;
  on_call: boolean;
  nda_required: boolean;
  nda_confirmed: boolean;
  nda_confirmed_at: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  reviewer: "Reviewer",
  viewer: "Viewer",
  exec: "Executive",
  sme: "SME",
  partner: "External Partner",
};

// Canonical roles writeable from the UI. Legacy values (founder, reviewer,
// viewer) are still readable but not offered as new assignments.
const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "engagement_lead", label: "Engagement Lead", hint: "Full access" },
  { value: "pm", label: "Project Manager", hint: "Ops + signals + library" },
  { value: "writer", label: "Writer", hint: "Pulse + read briefing" },
  { value: "sme", label: "SME", hint: "Briefing notes + alignment read" },
  { value: "exec", label: "Executive", hint: "Lobby + read-only command" },
  { value: "partner", label: "External Partner", hint: "RFP + policy docs only" },
];

function roleAccent(role: string) {
  if (role === "founder" || role === "engagement_lead") return "border-[var(--gold)]/50 bg-[var(--gold)]/10 text-[var(--gold)]";
  if (role === "pm") return "border-primary/40 bg-primary/15 text-primary";
  if (role === "exec") return "border-purple-500/40 bg-purple-500/15 text-purple-300";
  if (role === "sme") return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  if (role === "partner") return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-border bg-surface-hover text-muted-foreground";
}

function telHref(phone: string | null) {
  if (!phone) return null;
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
function smsHref(phone: string | null) {
  if (!phone) return null;
  return `sms:${phone.replace(/[^\d+]/g, "")}`;
}

function TeamPage() {
  const { engagement, isLeadership, member: me } = useEngagement();
  const triviaWinnerId = useTriviaWinnerId();
  const [members, setMembers] = useState<Member[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Member>>({});
  const { pulses, refresh: refreshPulses } = usePulses(engagement?.id);
  const [openPulseForm, setOpenPulseForm] = useState<{ memberId: string; kind: FormKind } | null>(null);

  async function load(eid: string) {
    const { data } = await supabase
      .from("engagement_members")
      .select("id, user_id, display_name, role, title, email, phone, slack_handle, timezone, on_call, nda_required, nda_confirmed, nda_confirmed_at")
      .eq("engagement_id", eid)
      .order("on_call", { ascending: false })
      .order("role")
      .order("display_name");
    setMembers((data as Member[]) ?? []);
  }

  async function toggleNda(m: Member) {
    if (!isLeadership) return;
    const next = !m.nda_confirmed;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("engagement_members")
      .update({
        nda_confirmed: next,
        nda_confirmed_at: next ? new Date().toISOString() : null,
        nda_confirmed_by: next ? (u.user?.id ?? null) : null,
      })
      .eq("id", m.id)
      .eq("engagement_id", engagement?.id ?? "");
    if (error) return toast.error(error.message);
    toast.success(next ? "NDA confirmed" : "NDA confirmation revoked");
    if (engagement) load(engagement.id);
  }

  useEffect(() => {
    if (engagement) load(engagement.id);
  }, [engagement?.id]);

  function startEdit(m: Member) {
    setEditingId(m.id);
    setDraft({ ...m });
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }
  async function saveEdit() {
    if (!editingId) return;
    const { error } = await supabase
      .from("engagement_members")
      .update({
        display_name: draft.display_name?.trim() || "Unnamed",
        title: draft.title?.trim() || null,
        email: draft.email?.trim() || null,
        phone: draft.phone?.trim() || null,
        slack_handle: draft.slack_handle?.trim() || null,
        timezone: draft.timezone?.trim() || null,
        on_call: !!draft.on_call,
      })
      .eq("id", editingId)
      .eq("engagement_id", engagement?.id ?? "");
    if (error) return toast.error(error.message);
    toast.success("Saved");
    cancelEdit();
    if (engagement) load(engagement.id);
  }

  async function toggleOnCall(m: Member) {
    if (!isLeadership) return;
    const { error } = await supabase
      .from("engagement_members")
      .update({ on_call: !m.on_call })
      .eq("id", m.id)
      .eq("engagement_id", engagement?.id ?? "");
    if (error) return toast.error(error.message);
    if (engagement) load(engagement.id);
  }

  type PendingRow = {
    display_name: string;
    role: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    slack_handle: string | null;
    timezone: string | null;
    on_call: boolean;
    _issues: string[];
  };
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  // ===== Invite flow =====
  type InviteRow = {
    id: string;
    email: string;
    display_name: string;
    role: string;
    title: string | null;
    token: string;
    created_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  };
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    preset: INVITE_PRESETS[0].key as (typeof INVITE_PRESETS)[number]["key"],
    display_name: "",
    email: "",
  });
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  async function loadInvites(eid: string) {
    const { data } = await supabase
      .from("engagement_invites")
      .select("id, email, display_name, role, title, token, created_at, accepted_at, revoked_at")
      .eq("engagement_id", eid)
      .order("created_at", { ascending: false });
    setInvites((data as InviteRow[]) ?? []);
  }
  useEffect(() => { if (engagement && isLeadership) loadInvites(engagement.id); }, [engagement?.id, isLeadership]);

  function inviteLinkFor(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/accept-invite?token=${token}`;
  }

  async function createInvite() {
    if (!engagement || !me) return;
    const preset = INVITE_PRESETS.find((p) => p.key === inviteForm.preset)!;
    const name = inviteForm.display_name.trim();
    const email = inviteForm.email.trim().toLowerCase();
    if (!name) return toast.error("Enter the leader's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email.");
    setInviteSaving(true);
    const { data, error } = await supabase
      .from("engagement_invites")
      .insert({
        engagement_id: engagement.id,
        email,
        display_name: name,
        role: preset.role,
        title: preset.title,
        invited_by: (await supabase.auth.getUser()).data.user!.id,
        invited_by_name: me.display_name,
      })
      .select("token")
      .single();
    if (error) { setInviteSaving(false); return toast.error(error.message); }
    const link = inviteLinkFor(data.token);
    setLastInviteLink(link);
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard may be blocked */ }

    // Fire-and-await email send
    try {
      await sendTransactionalEmail({
        templateName: "engagement-invite",
        recipientEmail: email,
        idempotencyKey: `invite-${data.token}`,
        templateData: {
          recipientName: name,
          inviterName: me.display_name,
          engagementName: engagement.name,
          client: engagement.client ?? "",
          roleLabel: preset.label,
          acceptUrl: link,
        },
      });
      toast.success(`Invite emailed to ${email}`);
    } catch (e: any) {
      toast.warning(`Invite created, but email send failed: ${e.message ?? e}. Use Copy link to share manually.`);
    }
    setInviteSaving(false);
    setInviteForm({ preset: INVITE_PRESETS[0].key, display_name: "", email: "" });
    loadInvites(engagement.id);
  }

  async function revokeInvite(id: string) {
    if (!engagement) return;
    const { error } = await supabase
      .from("engagement_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
    loadInvites(engagement.id);
  }

  async function copyLink(token: string) {
    const link = inviteLinkFor(token);
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy — link: " + link); }
  }


  function rowsToPending(rows: string[][]): PendingRow[] {
    const headers = rows[0].map((h) => String(h).trim().toLowerCase());
    const idx = (name: string) => headers.indexOf(name);
    const iName = idx("display_name"), iRole = idx("role");
    const iTitle = idx("title"), iEmail = idx("email"), iPhone = idx("phone");
    const iSlack = idx("slack_handle"), iTz = idx("timezone"), iOnCall = idx("on_call");
    if (iName === -1 || iRole === -1) throw new Error("File must include 'display_name' and 'role' columns.");
    const get = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

    return rows.slice(1)
      .filter((r) => r.some((v) => String(v ?? "").trim().length > 0))
      .map((r) => {
        const display_name = get(r, iName);
        const rawRole = get(r, iRole);
        const rawTitle = get(r, iTitle);
        const issues: string[] = [];
        if (!display_name) issues.push("missing display_name");

        // 1. exact token match, else 2. heuristic mapping of role text,
        // else 3. heuristic mapping of title text, else viewer fallback.
        let mappedRole = VALID_ROLES.has(rawRole.toLowerCase()) ? rawRole.toLowerCase() : null;
        if (!mappedRole) mappedRole = mapFreeTextRole(rawRole);
        if (!mappedRole) mappedRole = mapFreeTextRole(rawTitle);
        if (!mappedRole) {
          mappedRole = "viewer";
          issues.push(`unmapped role '${rawRole || "—"}' → viewer`);
        }

        // If role column held free text and title column was empty, preserve
        // the human-readable role text in title so context isn't lost.
        const finalTitle = rawTitle || (rawRole && !VALID_ROLES.has(rawRole.toLowerCase()) ? rawRole : "") || null;

        const email = get(r, iEmail) || null;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("invalid email");
        return {
          display_name,
          role: mappedRole,
          title: finalTitle,
          email,
          phone: get(r, iPhone) || null,
          slack_handle: get(r, iSlack) || null,
          timezone: get(r, iTz) || null,
          on_call: iOnCall >= 0 ? parseBool(get(r, iOnCall)) : false,
          _issues: issues,
        };
      });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !engagement) return;
    try {
      let rows: string[][];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as string[][];
      } else {
        rows = parseCSV(await file.text());
      }
      if (rows.length < 2) { toast.error("File needs a header row and at least one data row."); return; }
      const parsed = rowsToPending(rows);
      if (!parsed.length) { toast.error("No data rows found."); return; }
      setPending(parsed);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to parse file.");
    }
  }

  async function confirmImport() {
    if (!pending || !engagement) return;
    const valid = pending.filter((p) => p.display_name);
    if (!valid.length) { toast.error("Nothing to import — all rows missing display_name."); return; }
    setImporting(true);
    const records = valid.map((p) => ({
      engagement_id: engagement.id,
      display_name: p.display_name,
      role: p.role,
      title: p.title,
      email: p.email,
      phone: p.phone,
      slack_handle: p.slack_handle,
      timezone: p.timezone,
      on_call: p.on_call,
    }));
    const { error } = await supabase.from("engagement_members").insert(records);
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${records.length} member${records.length === 1 ? "" : "s"}.`);
    setPending(null);
    load(engagement.id);
  }


  const onCall = members.filter((m) => m.on_call);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collective™</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who's on this engagement — and how to reach them right now.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isLeadership && (
            <Button size="sm" onClick={() => { setLastInviteLink(null); setInviteOpen(true); }}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite Leader
            </Button>
          )}
          {isLeadership && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-hover">
              <Upload className="h-3.5 w-3.5" />
              Upload CSV / XLSX
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={handleFileUpload} />
            </label>
          )}
          <div className="text-right text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"} • {onCall.length} on call
          </div>
        </div>
      </div>

      {isLeadership && <MoraleCard />}



      {onCall.length > 0 && (
        <Card className="border-[var(--gold)]/40 bg-[var(--gold)]/[0.06] p-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
            <Radio className="h-3.5 w-3.5" /> On call now
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {onCall.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{m.display_name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {ROLE_LABEL[m.role] ?? m.role}{m.title ? ` • ${m.title}` : ""}
                  </div>
                </div>
                {m.phone && (
                  <a
                    href={telHref(m.phone)!}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLeadership && members.length > 0 && (
        <RecognitionSummary
          members={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
          pulses={pulses}
        />
      )}

      <Card className="border-border bg-surface p-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const editing = editingId === m.id;
            const canEdit = isLeadership || (me && m.user_id === me?.display_name); // leadership only really
            return (
              <li key={m.id} className="p-4 md:p-5">
                {editing ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Display name</Label>
                      <Input value={draft.display_name ?? ""} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Title</Label>
                      <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Capture Manager" />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+1 555 123 4567" />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Slack handle</Label>
                      <Input value={draft.slack_handle ?? ""} onChange={(e) => setDraft({ ...draft, slack_handle: e.target.value })} placeholder="@jane" />
                    </div>
                    <div>
                      <Label className="text-xs">Timezone</Label>
                      <Input value={draft.timezone ?? ""} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} placeholder="America/New_York" />
                    </div>
                    <label className="flex items-center gap-2 text-sm md:col-span-2">
                      <input
                        type="checkbox"
                        checked={!!draft.on_call}
                        onChange={(e) => setDraft({ ...draft, on_call: e.target.checked })}
                        className="h-4 w-4 accent-[var(--gold)]"
                      />
                      <Radio className="h-3.5 w-3.5 text-[var(--gold)]" />
                      <span>On call now</span>
                    </label>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <Button variant="outline" size="sm" onClick={cancelEdit}>
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={saveEdit}>
                        <Check className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PresenceDot memberId={m.id} />
                        <span className="font-semibold">{m.display_name}{triviaWinnerId === m.id && <span title="Indiana Trivia Champion" className="ml-1">🏆</span>}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleAccent(m.role)}`}>
                          {ROLE_LABEL[m.role] ?? m.role}
                        </span>
                        <NudgeButton memberId={m.id} displayName={m.display_name} />
                        {m.on_call && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--gold)]">
                            <Radio className="h-3 w-3" /> On call
                          </span>
                        )}
                        {m.nda_required && (
                          m.nda_confirmed ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400" title={m.nda_confirmed_at ? `Confirmed ${new Date(m.nda_confirmed_at).toLocaleDateString()}` : "NDA on file"}>
                              <ShieldCheck className="h-3 w-3" /> NDA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400" title="Access locked until NDA confirmed">
                              <ShieldAlert className="h-3 w-3" /> NDA pending
                            </span>
                          )
                        )}
                      </div>
                      {(m.title || m.timezone) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {m.title}{m.title && m.timezone ? " • " : ""}{m.timezone}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {m.phone && (
                          <>
                            <a href={telHref(m.phone)!} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2.5 py-1.5 font-medium hover:border-primary hover:text-primary">
                              <Phone className="h-3.5 w-3.5" /> {m.phone}
                            </a>
                            <a href={smsHref(m.phone)!} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2.5 py-1.5 font-medium hover:border-primary hover:text-primary">
                              <MessageSquare className="h-3.5 w-3.5" /> Text
                            </a>
                          </>
                        )}
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2.5 py-1.5 font-medium hover:border-primary hover:text-primary">
                            <Mail className="h-3.5 w-3.5" /> {m.email}
                          </a>
                        )}
                        {m.slack_handle && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2.5 py-1.5 font-medium text-muted-foreground">
                            <Hash className="h-3.5 w-3.5" /> {m.slack_handle}
                          </span>
                        )}
                        {!m.phone && !m.email && !m.slack_handle && (
                          <span className="text-muted-foreground italic">No contact info yet</span>
                        )}
                      </div>
                    </div>
                    {isLeadership && (
                      <div className="flex flex-col gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => startEdit(m)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleOnCall(m)} className="text-xs">
                          {m.on_call ? "Clear on-call" : "Mark on-call"}
                        </Button>
                        {m.nda_required && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleNda(m)}
                            className={`text-xs ${m.nda_confirmed ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"}`}
                          >
                            {m.nda_confirmed ? (
                              <><ShieldAlert className="h-3.5 w-3.5 mr-1" /> Revoke NDA</>
                            ) : (
                              <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Confirm NDA</>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isLeadership && !editing && (
                  <MemberRecognitionPanel
                    member={{ id: m.id, display_name: m.display_name }}
                    engagementId={engagement!.id}
                    pulse={pulses[m.id]}
                    openForm={openPulseForm?.memberId === m.id ? openPulseForm.kind : null}
                    onOpen={(kind) => setOpenPulseForm({ memberId: m.id, kind })}
                    onClose={() => setOpenPulseForm(null)}
                    onSaved={async () => { await refreshPulses(); }}
                  />
                )}
              </li>
            );
          })}
          {members.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">No team members yet.</li>
          )}
        </ul>
      </Card>

      {isLeadership && (
        <p className="text-xs text-muted-foreground">
          Tip: Upload a CSV or XLSX to bulk-add the roster. Required columns: <code>display_name</code>, <code>role</code>. Optional: <code>title, email, phone, slack_handle, timezone, on_call</code>. You'll see a preview before anything is inserted.
        </p>
      )}

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Preview import</DialogTitle>
            <DialogDescription>
              {pending?.length ?? 0} row{(pending?.length ?? 0) === 1 ? "" : "s"} parsed. Review, then confirm to add them to this engagement.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Slack</th>
                  <th className="p-2">On call</th>
                  <th className="p-2">Issues</th>
                </tr>
              </thead>
              <tbody>
                {pending?.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 font-medium">{p.display_name || <span className="text-destructive">—</span>}</td>
                    <td className="p-2">{p.role}</td>
                    <td className="p-2">{p.title ?? ""}</td>
                    <td className="p-2">{p.email ?? ""}</td>
                    <td className="p-2">{p.phone ?? ""}</td>
                    <td className="p-2">{p.slack_handle ?? ""}</td>
                    <td className="p-2">{p.on_call ? "Yes" : ""}</td>
                    <td className="p-2">
                      {p._issues.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[var(--gold)]">
                          <AlertTriangle className="h-3 w-3" /> {p._issues.join("; ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={importing}>Cancel</Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${pending?.filter((p) => p.display_name).length ?? 0} member${(pending?.filter((p) => p.display_name).length ?? 0) === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLeadership && invites.filter((i) => !i.accepted_at && !i.revoked_at).length > 0 && (
        <Card className="border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <LinkIcon className="h-3.5 w-3.5" /> Pending invitations
          </div>
          <ul className="divide-y divide-border">
            {invites.filter((i) => !i.accepted_at && !i.revoked_at).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{i.display_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{i.email} • {i.title ?? ROLE_LABEL[i.role] ?? i.role}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyLink(i.token)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => revokeInvite(i.id)} className="text-destructive">
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a leader</DialogTitle>
            <DialogDescription>
              They'll get a one-click link to join this engagement. Email/password or Google sign-in both work.
            </DialogDescription>
          </DialogHeader>
          {lastInviteLink ? (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Invitation sent — email delivered and link copied to your clipboard as a backup.
              </div>
              <div className="rounded-md border border-border bg-surface-hover p-2 text-xs break-all">{lastInviteLink}</div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setLastInviteLink(null); }}>
                  Invite another
                </Button>
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Role</Label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  value={inviteForm.preset}
                  onChange={(e) => setInviteForm({ ...inviteForm, preset: e.target.value as typeof inviteForm.preset })}
                >
                  {INVITE_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Full name</Label>
                <Input value={inviteForm.display_name} onChange={(e) => setInviteForm({ ...inviteForm, display_name: e.target.value })} placeholder="Jane Smith" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="jane@firm.com" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSaving}>Cancel</Button>
                <Button onClick={createInvite} disabled={inviteSaving}>
                  {inviteSaving ? "Creating…" : "Create invite link"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function TeamMemberName({ id, name }: { id: string; name: string }) {
  const { openChatWith } = useComms();
  return (
    <button onClick={() => openChatWith(id, name)} className="text-base font-semibold hover:text-[var(--gold)]">
      {name}
    </button>
  );
}
