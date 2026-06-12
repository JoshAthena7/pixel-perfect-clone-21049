import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Plus, X, Send, Save, Paperclip, Mail, MailOpen, ChevronDown, Check, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/messaging")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: MessagingPage,
});

type Scope = "all" | "mission" | "role" | "individual";

type Message = {
  id: string;
  sender_id: string;
  subject: string;
  body: string;
  recipient_scope: Scope;
  recipient_ids: string[];
  attachment_url: string | null;
  status: "draft" | "sent";
  sent_at: string | null;
  total_recipients: number;
  opened_count: number;
  created_at: string;
  updated_at: string;
};

const db = supabase as unknown as {
  from: (t: "admin_messages") => any;
};

function MessagingPage() {
  const [tab, setTab] = useState<"sent" | "drafts">("sent");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Message | null>(null);
  const qc = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["admin-messages", tab],
    queryFn: async (): Promise<Message[]> => {
      const { data } = await db.from("admin_messages")
        .select("*")
        .eq("status", tab === "sent" ? "sent" : "draft")
        .order(tab === "sent" ? "sent_at" : "updated_at", { ascending: false });
      return (data ?? []) as Message[];
    },
  });

  function openCompose(draft?: Message) {
    setEditingDraft(draft ?? null);
    setComposeOpen(true);
  }

  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Messaging</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              Broadcast announcements to staff across ATLAS.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCompose()}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            <Plus className="h-4 w-4" />
            New message
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {(["sent", "drafts"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="px-4 py-2.5 text-xs font-medium transition-colors capitalize"
                style={{
                  color: active ? "#c9a84c" : "rgba(255,255,255,0.5)",
                  borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="space-y-2">
          {isLoading && (
            <div className="rounded-lg p-6 text-sm" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              Loading messages…
            </div>
          )}
          {!isLoading && messages.length === 0 && tab === "sent" && (
            <SampleSentList />
          )}
          {!isLoading && messages.length === 0 && tab === "drafts" && (
            <div className="rounded-lg p-8 text-sm text-center" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              No drafts yet. Click <span style={{ color: "#c9a84c" }}>New message</span> and save one.
            </div>
          )}
          {messages.map((m) => (
            <MessageCard key={m.id} m={m} onClick={tab === "drafts" ? () => openCompose(m) : undefined} />
          ))}
        </div>
      </div>

      {composeOpen && (
        <ComposePanel
          draft={editingDraft}
          onClose={() => { setComposeOpen(false); setEditingDraft(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-messages"] });
          }}
        />
      )}
    </div>
  );
}

function MessageCard({ m, onClick }: { m: Message; onClick?: () => void }) {
  const scopeLabel = scopeDescriptor(m.recipient_scope);
  const sent = m.status === "sent";
  const openRate = m.total_recipients > 0 ? Math.round((m.opened_count / m.total_recipients) * 100) : 0;
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left rounded-lg px-4 py-3.5 transition-colors ${onClick ? "hover:cursor-pointer" : ""}`}
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "block",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: sent ? "rgba(34,197,94,0.12)" : "rgba(201,168,76,0.12)" }}
        >
          {sent ? <Mail className="h-4 w-4" style={{ color: "#22c55e" }} /> : <Save className="h-4 w-4" style={{ color: "#c9a84c" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">{m.subject || "(no subject)"}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
            {scopeLabel} · {m.total_recipients} recipient{m.total_recipients === 1 ? "" : "s"}
          </div>
          {m.body && (
            <div className="text-xs mt-1.5 line-clamp-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              {m.body}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
            {sent && m.sent_at
              ? formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })
              : formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}
          </span>
          {sent && (
            <span
              className="rounded-full text-[10px] font-semibold uppercase tracking-wider"
              style={{
                padding: "3px 9px",
                background: openRate >= 75 ? "rgba(34,197,94,0.12)" : openRate >= 40 ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.05)",
                color: openRate >= 75 ? "#22c55e" : openRate >= 40 ? "#c9a84c" : "rgba(255,255,255,0.5)",
                border: `1px solid ${openRate >= 75 ? "rgba(34,197,94,0.3)" : openRate >= 40 ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <MailOpen className="h-2.5 w-2.5 inline mr-1" />
              {m.opened_count} of {m.total_recipients} opened
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function SampleSentList() {
  // Decorative samples shown when no real messages exist yet.
  const samples: Array<Pick<Message, "id" | "subject" | "body" | "recipient_scope" | "total_recipients" | "opened_count" | "sent_at" | "status">> = [
    {
      id: "s1", subject: "Q3 Strategy Sync — All Hands",
      body: "Quick reminder that our quarterly strategy sync is on the calendar for next Wednesday.",
      recipient_scope: "all", total_recipients: 24, opened_count: 18,
      sent_at: new Date(Date.now() - 2 * 86400000).toISOString(), status: "sent",
    },
    {
      id: "s2", subject: "NJ CSOC Pens-Down — Final 48 Hours",
      body: "Pens down on Friday at 5pm ET. Compliance checklist must be 100% before then.",
      recipient_scope: "mission", total_recipients: 9, opened_count: 9,
      sent_at: new Date(Date.now() - 5 * 86400000).toISOString(), status: "sent",
    },
    {
      id: "s3", subject: "New SME onboarding workflow",
      body: "We've rolled out a new SME onboarding flow. Reviewers, please read.",
      recipient_scope: "role", total_recipients: 12, opened_count: 7,
      sent_at: new Date(Date.now() - 10 * 86400000).toISOString(), status: "sent",
    },
  ];
  return (
    <>
      {samples.map((s) => (
        <MessageCard
          key={s.id}
          m={{
            ...s,
            sender_id: "",
            recipient_ids: [],
            attachment_url: null,
            created_at: s.sent_at ?? new Date().toISOString(),
            updated_at: s.sent_at ?? new Date().toISOString(),
          } as Message}
        />
      ))}
    </>
  );
}

const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: "all", label: "All Staff", hint: "Every active ATLAS team member" },
  { value: "mission", label: "By Mission", hint: "Everyone on selected missions" },
  { value: "role", label: "By Role", hint: "Everyone with a chosen role" },
  { value: "individual", label: "Individual", hint: "Hand-pick specific staff" },
];

const ROLE_OPTIONS = ["admin", "engagement_lead", "writer", "sme", "reviewer", "unassigned"];

function scopeDescriptor(scope: Scope) {
  switch (scope) {
    case "all": return "All Staff";
    case "mission": return "By Mission";
    case "role": return "By Role";
    case "individual": return "Individual";
  }
}

function ComposePanel({
  draft,
  onClose,
  onSaved,
}: {
  draft: Message | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<Scope>(draft?.recipient_scope ?? "all");
  const [selectedIds, setSelectedIds] = useState<string[]>(draft?.recipient_ids ?? []);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);

  // Source data for resolving recipients
  const { data: staff = [] } = useQuery({
    queryKey: ["compose-staff"],
    queryFn: async () => {
      const { data } = await supabase
        .from("atlas_team_members")
        .select("id,first_name,last_name,email,atlas_role")
        .eq("is_removed", false);
      return data ?? [];
    },
  });
  const { data: missions = [] } = useQuery({
    queryKey: ["compose-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,status")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: missionMembers = [] } = useQuery({
    queryKey: ["compose-mission-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("mission_id,member_id");
      return data ?? [];
    },
  });

  // Compute recipients live
  const recipients = useMemo(() => {
    if (scope === "all") return staff.map((s: any) => s.id);
    if (scope === "individual") return selectedIds;
    if (scope === "role") {
      const set = new Set(selectedIds);
      return staff.filter((s: any) => set.has(s.atlas_role ?? "unassigned")).map((s: any) => s.id);
    }
    if (scope === "mission") {
      const set = new Set(selectedIds);
      const ids = new Set<string>();
      missionMembers.forEach((m: any) => {
        if (set.has(m.mission_id)) ids.add(m.member_id);
      });
      return Array.from(ids);
    }
    return [];
  }, [scope, selectedIds, staff, missionMembers]);

  const previewText = useMemo(() => {
    if (scope === "all") return `${recipients.length} staff (all active members)`;
    if (scope === "mission") {
      const m = selectedIds.length;
      return `${recipients.length} staff across ${m} mission${m === 1 ? "" : "s"}`;
    }
    if (scope === "role") {
      return `${recipients.length} staff in ${selectedIds.length} role${selectedIds.length === 1 ? "" : "s"}`;
    }
    return `${recipients.length} individual staff member${recipients.length === 1 ? "" : "s"}`;
  }, [recipients.length, scope, selectedIds.length]);

  const saveDraft = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const payload = {
        sender_id: u.user.id,
        subject: subject || "(no subject)",
        body,
        recipient_scope: scope,
        recipient_ids: selectedIds,
        total_recipients: recipients.length,
        status: "draft" as const,
      };
      if (draft?.id) {
        const { error } = await db.from("admin_messages").update(payload).eq("id", draft.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("admin_messages").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => { toast.success("Draft saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      if (!subject.trim()) throw new Error("Subject is required");
      if (recipients.length === 0) throw new Error("No recipients selected");
      const payload = {
        sender_id: u.user.id,
        subject,
        body,
        recipient_scope: scope,
        recipient_ids: scope === "all" ? recipients : selectedIds,
        total_recipients: recipients.length,
        opened_count: 0,
        status: "sent" as const,
        sent_at: new Date().toISOString(),
      };
      if (draft?.id) {
        const { error } = await db.from("admin_messages").update(payload).eq("id", draft.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("admin_messages").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => { toast.success(`Sent to ${recipients.length} staff`); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[71] w-full sm:w-[520px] flex flex-col"
        style={{ background: "#0a121f", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#c9a84c" }}>
            {draft ? "Edit draft" : "New message"}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "rgba(255,255,255,0.5)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* To */}
          <div>
            <Label>To</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setScopePickerOpen((o) => !o)}
                className="w-full text-left rounded-md px-3 py-2 flex items-center justify-between"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "white", fontSize: 13 }}
              >
                <span>{scopeDescriptor(scope)}</span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.4)" }} />
              </button>
              {scopePickerOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md overflow-hidden" style={{ background: "#0f1828", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {SCOPE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { setScope(o.value); setSelectedIds([]); setScopePickerOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.04] flex items-center gap-2"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-white">{o.label}</div>
                        <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{o.hint}</div>
                      </div>
                      {scope === o.value && <Check className="h-3.5 w-3.5" style={{ color: "#c9a84c" }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picker for mission / role / individual */}
            {scope !== "all" && (
              <div className="mt-2 rounded-md max-h-48 overflow-y-auto" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {scope === "mission" && missions.map((m: any) => (
                  <PickerRow
                    key={m.id}
                    label={m.name}
                    sub={m.status}
                    checked={selectedIds.includes(m.id)}
                    onToggle={() => toggle(setSelectedIds, m.id)}
                  />
                ))}
                {scope === "role" && ROLE_OPTIONS.map((r) => (
                  <PickerRow
                    key={r}
                    label={r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    sub={`${staff.filter((s: any) => (s.atlas_role ?? "unassigned") === r).length} staff`}
                    checked={selectedIds.includes(r)}
                    onToggle={() => toggle(setSelectedIds, r)}
                  />
                ))}
                {scope === "individual" && staff.map((s: any) => (
                  <PickerRow
                    key={s.id}
                    label={[s.first_name, s.last_name].filter(Boolean).join(" ") || s.email}
                    sub={s.email}
                    checked={selectedIds.includes(s.id)}
                    onToggle={() => toggle(setSelectedIds, s.id)}
                  />
                ))}
              </div>
            )}

            <div className="mt-2 text-xs rounded px-3 py-2" style={{ background: "rgba(201,168,76,0.08)", color: "#c9a84c" }}>
              → {previewText}
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label>Subject</Label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-[#c9a84c]/60"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "white" }}
            />
          </div>

          {/* Body */}
          <div>
            <Label>Message</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message…"
              className="w-full rounded-md px-3 py-2 text-sm outline-none focus:border-[#c9a84c]/60 resize-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "white", lineHeight: 1.5 }}
            />
          </div>

          {/* Attachment */}
          <div>
            <Label>Attachment (optional)</Label>
            <label
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs cursor-pointer hover:bg-white/[0.05]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate">{attachment ? attachment.name : "Attach a file"}</span>
              <input type="file" hidden onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            type="button"
            onClick={() => saveDraft.mutate()}
            disabled={saveDraft.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-white/[0.05]"
            style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {saveDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save draft
          </button>
          <button
            type="button"
            onClick={() => sendMessage.mutate()}
            disabled={sendMessage.isPending || !subject.trim() || recipients.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            {sendMessage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send to {recipients.length}
          </button>
        </div>
      </aside>
    </>
  );
}

function toggle(setter: (fn: (prev: string[]) => string[]) => void, value: string) {
  setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
      {children}
    </div>
  );
}

function PickerRow({ label, sub, checked, onToggle }: { label: string; sub?: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/[0.04]"
    >
      <div
        className="h-4 w-4 rounded shrink-0 flex items-center justify-center"
        style={{
          background: checked ? "#c9a84c" : "transparent",
          border: `1px solid ${checked ? "#c9a84c" : "rgba(255,255,255,0.2)"}`,
        }}
      >
        {checked && <Check className="h-3 w-3" style={{ color: "#080c14" }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{label}</div>
        {sub && <div className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{sub}</div>}
      </div>
    </button>
  );
}
