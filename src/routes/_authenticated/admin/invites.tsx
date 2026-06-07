import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search, Mail, Loader2, Send, Link as LinkIcon, Trash2, UserPlus,
} from "lucide-react";
import {
  listTeamRoster,
  sendOfficialInvite,
  generateInviteLink,
  removeInviteFromRoster,
} from "@/lib/atlas-invites.functions";

export const Route = createFileRoute("/_authenticated/admin/invites")({
  component: InvitesPage,
});

type Roster = Awaited<ReturnType<typeof listTeamRoster>>;
type Entry = Roster[number];

function InvitesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listTeamRoster);
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["olympus-team-roster"],
    queryFn: () => listFn() as Promise<Roster>,
  });

  const invited = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter((e) => e.state === "invited" && e.invite_id)
      .filter((e) => {
        if (!q) return true;
        return (
          (e.display_name ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
        );
      });
  }, [roster, search]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["olympus-team-roster"] });
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Team</div>
          <h1 className="h1-display mt-1">Invites</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People who have been invited but have not yet completed onboarding.
            Use{" "}
            <a href="/admin/users" className="text-foreground underline underline-offset-4">
              Users
            </a>{" "}
            to load new people onto the roster.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invited people…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </header>

      <div className="rounded-[10px] border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Person</th>
              <th className="px-4 py-3 text-left">Invitation</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">One moment…</td></tr>
            )}
            {!isLoading && invited.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                  <UserPlus className="mx-auto mb-3 h-6 w-6 opacity-40" />
                  <div>No pending invitations.</div>
                  <div className="mt-1 text-[11px]">
                    Load a person on the Users page, then send their official invite.
                  </div>
                </td>
              </tr>
            )}
            {invited.map((e) => (
              <InvitedRow key={e.key} entry={e} onChanged={refresh} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitedRow({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const resendFn = useServerFn(sendOfficialInvite);
  const linkFn = useServerFn(generateInviteLink);
  const removeFn = useServerFn(removeInviteFromRoster);
  const [busy, setBusy] = useState<"resend" | "link" | "remove" | null>(null);

  async function doResend() {
    if (!entry.invite_id) return;
    setBusy("resend");
    try {
      await resendFn({ data: { id: entry.invite_id, baseUrl: window.location.origin } });
      toast.success(`Invitation re-sent to ${entry.display_name ?? entry.email}.`);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not resend invite");
    } finally {
      setBusy(null);
    }
  }

  async function doCopyLink() {
    if (!entry.invite_id) return;
    setBusy("link");
    try {
      const { url } = await linkFn({
        data: { id: entry.invite_id, baseUrl: window.location.origin },
      });
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied — expires in 72 hours.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not generate link");
    } finally {
      setBusy(null);
    }
  }

  async function doRemove() {
    if (!entry.invite_id) return;
    if (!window.confirm(`Remove ${entry.display_name ?? entry.email} from the roster? Outstanding invite links will be invalidated.`)) {
      return;
    }
    setBusy("remove");
    try {
      await removeFn({ data: { id: entry.invite_id } });
      toast.success("Removed from roster.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  const initials = (entry.display_name ?? entry.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <tr className="hover:bg-surface-hover">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{entry.display_name ?? "Unnamed"}</div>
            <div className="truncate text-[11px] text-muted-foreground">{entry.email || "—"}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-amber-300" />
          Invitation sent {entry.invite_sent_at
            ? new Date(entry.invite_sent_at).toLocaleDateString()
            : ""} — awaiting onboarding
        </span>
        {entry.mission_name && (
          <div className="mt-1 text-[11px]">
            For <span className="text-foreground">{entry.mission_name}</span>
            {entry.role ? ` · ${entry.role}` : ""}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <button
            onClick={doResend}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
          >
            {busy === "resend" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Resend
          </button>
          <button
            onClick={doCopyLink}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {busy === "link" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
            Copy Link
          </button>
          <button
            onClick={doRemove}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:border-red-500/40 hover:text-red-300 disabled:opacity-60"
          >
            {busy === "remove" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
