import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, Hash, Radio, Pencil, X, Check, Upload } from "lucide-react";

const VALID_ROLES = new Set(["founder", "pm", "engagement_lead", "writer", "reviewer", "viewer"]);

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
  head: () => ({ meta: [{ title: "Team Roster — Athena War Room" }] }),
  component: TeamPage,
});

type Member = {
  id: string;
  user_id: string;
  display_name: string;
  role: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  slack_handle: string | null;
  timezone: string | null;
  on_call: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

function roleAccent(role: string) {
  if (role === "founder") return "border-[var(--gold)]/50 bg-[var(--gold)]/10 text-[var(--gold)]";
  if (role === "pm" || role === "engagement_lead") return "border-primary/40 bg-primary/15 text-primary";
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
  const [members, setMembers] = useState<Member[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Member>>({});

  async function load(eid: string) {
    const { data } = await supabase
      .from("engagement_members")
      .select("id, user_id, display_name, role, title, email, phone, slack_handle, timezone, on_call")
      .eq("engagement_id", eid)
      .order("on_call", { ascending: false })
      .order("role")
      .order("display_name");
    setMembers((data as Member[]) ?? []);
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
      .eq("id", editingId);
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
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    if (engagement) load(engagement.id);
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !engagement) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("CSV needs a header row and at least one data row."); return; }
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name: string) => headers.indexOf(name);
      const iName = idx("display_name");
      const iRole = idx("role");
      if (iName === -1 || iRole === -1) { toast.error("CSV must include 'display_name' and 'role' columns."); return; }
      const iTitle = idx("title"), iEmail = idx("email"), iPhone = idx("phone");
      const iSlack = idx("slack_handle"), iTz = idx("timezone"), iOnCall = idx("on_call");

      const records = rows.slice(1).map((r) => {
        const role = (r[iRole] ?? "").trim().toLowerCase();
        return {
          engagement_id: engagement.id,
          user_id: crypto.randomUUID(),
          display_name: (r[iName] ?? "").trim(),
          role: VALID_ROLES.has(role) ? role : "viewer",
          title: iTitle >= 0 ? (r[iTitle] ?? "").trim() || null : null,
          email: iEmail >= 0 ? (r[iEmail] ?? "").trim() || null : null,
          phone: iPhone >= 0 ? (r[iPhone] ?? "").trim() || null : null,
          slack_handle: iSlack >= 0 ? (r[iSlack] ?? "").trim() || null : null,
          timezone: iTz >= 0 ? (r[iTz] ?? "").trim() || null : null,
          on_call: iOnCall >= 0 ? parseBool(r[iOnCall]) : false,
        };
      }).filter((r) => r.display_name);

      if (!records.length) { toast.error("No valid rows found."); return; }
      const { error } = await supabase.from("engagement_members").insert(records);
      if (error) { toast.error(error.message); return; }
      toast.success(`Imported ${records.length} member${records.length === 1 ? "" : "s"}.`);
      load(engagement.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to parse CSV.");
    }
  }

  const onCall = members.filter((m) => m.on_call);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Roster</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who's on this engagement — and how to reach them right now.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isLeadership && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-hover">
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVUpload} />
            </label>
          )}
          <div className="text-right text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"} • {onCall.length} on call
          </div>
        </div>
      </div>

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
                        <span className="text-base font-semibold">{m.display_name}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleAccent(m.role)}`}>
                          {ROLE_LABEL[m.role] ?? m.role}
                        </span>
                        {m.on_call && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--gold)]">
                            <Radio className="h-3 w-3" /> On call
                          </span>
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
                      </div>
                    )}
                  </div>
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
          Tip: To add new teammates, invite them via the engagement settings — they'll appear here once they accept.
        </p>
      )}
    </div>
  );
}
