import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Send, Trash2, UserPlus, CheckCircle2, Clock } from "lucide-react";
import {
  listAtlasInvites,
  createAtlasInvite,
  setContractSigned,
  sendAtlasInvite,
  deleteAtlasInvite,
} from "@/lib/atlas-invites.functions";
import { logOlympusAction } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/olympus/invites")({
  component: InvitesPage,
});

type Invite = {
  id: string;
  email: string;
  display_name: string | null;
  role_hint: string | null;
  notes: string | null;
  contract_signed: boolean;
  contract_signed_at: string | null;
  invite_sent_at: string | null;
  accepted_at: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  awaiting_contract: { label: "Awaiting contract", tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  ready_to_invite: { label: "Ready to invite", tone: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  invite_sent: { label: "Invite sent", tone: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
  accepted: { label: "Accepted", tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
};

function InvitesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAtlasInvites);
  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["atlas-invites"],
    queryFn: () => listFn() as Promise<Invite[]>,
  });

  return (
    <div className="mx-auto max-w-7xl px-8 py-8 space-y-8">
      <header>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Access</div>
        <h1 className="h1-display mt-1">Atlas Invites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stage people you plan to bring into Atlas. They won't have access until you mark their contract as signed and send the invite.
        </p>
      </header>

      <NewInvitePanel onCreated={() => qc.invalidateQueries({ queryKey: ["atlas-invites"] })} />

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Pending & sent invites
          <span className="text-xs text-muted-foreground">({invites.length})</span>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        ) : invites.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No invites yet. Add someone above to start the access list.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Person</th>
                <th className="px-4 py-3 text-left w-40">Status</th>
                <th className="px-4 py-3 text-left w-40">Contract</th>
                <th className="px-4 py-3 text-right w-72">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invites.map((i) => (
                <InviteRow key={i.id} invite={i} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewInvitePanel({ onCreated }: { onCreated: () => void }) {
  const createFn = useServerFn(createAtlasInvite);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleHint, setRoleHint] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Email is required");
    setBusy(true);
    try {
      await createFn({
        data: {
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          roleHint: roleHint.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      toast.success(`Added ${email.trim()} to the invite list`);
      await logOlympusAction({
        action_type: "invite.create",
        action_summary: `Added ${email.trim()} to Atlas invite list`,
        target_table: "atlas_invites",
      });
      setEmail(""); setDisplayName(""); setRoleHint(""); setNotes("");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        Add someone to the invite list
        <span className="text-xs text-muted-foreground">— no email is sent yet</span>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[1fr_1fr_180px_auto]">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Display name</label>
          <input
            type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Intended role</label>
          <input
            type="text" value={roleHint} onChange={(e) => setRoleHint(e.target.value)}
            placeholder="Lead Writer"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit" disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Contract status, who's handling onboarding, etc."
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </form>
    </div>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const qc = useQueryClient();
  const signFn = useServerFn(setContractSigned);
  const sendFn = useServerFn(sendAtlasInvite);
  const delFn = useServerFn(deleteAtlasInvite);
  const [busy, setBusy] = useState(false);

  async function toggleSigned() {
    setBusy(true);
    try {
      await signFn({ data: { id: invite.id, signed: !invite.contract_signed } });
      toast.success(invite.contract_signed ? "Contract marked unsigned" : "Contract marked signed");
      await logOlympusAction({
        action_type: "invite.contract_toggle",
        action_summary: `Set contract_signed=${!invite.contract_signed} for ${invite.email}`,
        target_table: "atlas_invites",
        target_id: invite.id,
      });
      qc.invalidateQueries({ queryKey: ["atlas-invites"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function send() {
    if (!confirm(`Send Atlas invite email to ${invite.email}? They'll be able to sign in once they accept.`)) return;
    setBusy(true);
    try {
      await sendFn({ data: { id: invite.id } });
      toast.success(`Invite sent to ${invite.email}`);
      await logOlympusAction({
        action_type: "invite.send",
        action_summary: `Sent Atlas invite to ${invite.email}`,
        target_table: "atlas_invites",
        target_id: invite.id,
      });
      qc.invalidateQueries({ queryKey: ["atlas-invites"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send invite");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Remove ${invite.email} from the invite list?`)) return;
    setBusy(true);
    try {
      await delFn({ data: { id: invite.id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["atlas-invites"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  const status = STATUS_LABELS[invite.status] ?? { label: invite.status, tone: "bg-muted text-muted-foreground border-border" };
  const canSend = invite.contract_signed && !invite.invite_sent_at;

  return (
    <tr className="hover:bg-surface-hover">
      <td className="px-4 py-3">
        <div className="font-medium">{invite.display_name ?? invite.email}</div>
        <div className="text-[11px] text-muted-foreground">
          {invite.email}{invite.role_hint ? ` · ${invite.role_hint}` : ""}
        </div>
        {invite.notes && <div className="text-[11px] text-muted-foreground mt-1 italic">{invite.notes}</div>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.tone}`}>
          {invite.status === "accepted" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {status.label}
        </span>
        {invite.invite_sent_at && (
          <div className="text-[10px] text-muted-foreground mt-1">
            Sent {new Date(invite.invite_sent_at).toLocaleDateString()}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={invite.contract_signed}
            onChange={toggleSigned}
            disabled={busy}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs">{invite.contract_signed ? "Signed" : "Not signed"}</span>
        </label>
        {invite.contract_signed_at && (
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(invite.contract_signed_at).toLocaleDateString()}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={send}
            disabled={!canSend || busy}
            title={canSend ? "Send Atlas invite email" : invite.invite_sent_at ? "Invite already sent" : "Mark contract signed first"}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3 w-3" />
            {invite.invite_sent_at ? "Sent" : "Send invite"}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
