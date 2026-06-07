import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  Users as UsersIcon,
  Sparkles,
  Send,
  Mail,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import {
  listTeamRoster,
  listMissionsForRoster,
  loadUser,
  sendOfficialInvite,
} from "@/lib/atlas-invites.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

type Roster = Awaited<ReturnType<typeof listTeamRoster>>;
type Entry = Roster[number];
type MissionOpt = { id: string; name: string };

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "loaded" | "invited" | "active">("all");

  const listFn = useServerFn(listTeamRoster);
  const missionsFn = useServerFn(listMissionsForRoster);
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["olympus-team-roster"],
    queryFn: () => listFn() as Promise<Roster>,
  });
  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-missions-list"],
    queryFn: () => missionsFn() as Promise<MissionOpt[]>,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((e) => {
      if (filter !== "all" && e.state !== filter) return false;
      if (!q) return true;
      return (
        (e.display_name ?? "").toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [roster, search, filter]);

  const counts = useMemo(() => {
    const c = { all: roster.length, loaded: 0, invited: 0, active: 0 };
    for (const e of roster) c[e.state] += 1;
    return c;
  }, [roster]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["olympus-team-roster"] });
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Team</div>
          <h1 className="h1-display mt-1">Users & Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Three-state roster: <span className="text-foreground">Loaded</span> →
            {" "}<span className="text-foreground">Invited</span> →
            {" "}<span className="text-foreground">Active</span>. Only Active users can reach mission content.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </header>

      <div className="mb-4 inline-flex items-center gap-0.5 rounded-lg border bg-white/[0.04] p-[3px]" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-4 text-[12px] font-semibold tracking-wide text-foreground"
          style={{ borderColor: "var(--border-default, rgba(255,255,255,0.08))" }}
        >
          <UsersIcon className="h-3 w-3" /> Users
        </span>
        <Link
          to="/admin/expertise"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-4 text-[12px] font-semibold tracking-wide text-muted-foreground hover:text-foreground"
        >
          <Sparkles className="h-3 w-3" /> Expertise
        </Link>
      </div>

      <AddToRosterCard onAdded={refresh} missions={missions} />

      <div className="mt-4 mb-3 flex items-center gap-2">
        {(["all", "loaded", "invited", "active"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
              filter === f
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f} <span className="ml-1 opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-[10px] border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Person</th>
              <th className="px-4 py-3 text-left">State</th>
              <th className="px-4 py-3 text-left">Activity</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            )}
            {visible.map((e) => (
              <RosterRow key={e.key} entry={e} onChanged={refresh} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: Entry["state"] }) {
  const map = {
    loaded: { label: "LOADED", cls: "bg-white/5 text-muted-foreground border-white/15" },
    invited: { label: "INVITED", cls: "bg-amber-500/10 text-amber-200 border-amber-500/30" },
    active: { label: "ACTIVE", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  } as const;
  const m = map[state];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function RosterRow({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const sendFn = useServerFn(sendOfficialInvite);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doSend() {
    if (!entry.invite_id) return;
    setBusy(true);
    try {
      const baseUrl = window.location.origin;
      await sendFn({ data: { id: entry.invite_id, baseUrl } });
      toast.success(
        `Invitation sent to ${entry.display_name ?? entry.email}. They will appear as Invited until onboarding is complete.`,
      );
      setConfirmOpen(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  const initials = (entry.display_name ?? entry.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <>
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
        <td className="px-4 py-3">
          <StateBadge state={entry.state} />
        </td>
        <td className="px-4 py-3 text-[12px] text-muted-foreground">
          {entry.state === "loaded" && (
            <span>
              {entry.mission_name ? (
                <>
                  Assigned to <span className="text-foreground">{entry.mission_name}</span>
                  {entry.role ? ` · ${entry.role}` : ""} · no email sent
                </>
              ) : (
                "Added to roster · no email sent"
              )}
            </span>
          )}
          {entry.state === "invited" && (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-amber-300" />
              Invitation sent {entry.invite_sent_at
                ? new Date(entry.invite_sent_at).toLocaleDateString()
                : ""} — awaiting onboarding
            </span>
          )}
          {entry.state === "active" && (
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-300/80">
                <CheckCircle2 className="h-3 w-3" />
                Last login {entry.last_login_at
                  ? new Date(entry.last_login_at).toLocaleDateString()
                  : "—"}
              </span>
              <span className="text-foreground/80">
                {entry.active_missions} active mission{entry.active_missions === 1 ? "" : "s"}
              </span>
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {entry.state === "loaded" && entry.invite_id && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white shadow-[0_4px_20px_-8px_rgba(201,146,42,0.6)] transition hover:brightness-110 disabled:opacity-60"
              style={{ background: "#C9922A" }}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Official Invite
            </button>
          )}
          {entry.state === "invited" && entry.invite_id && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Resend
            </button>
          )}
          {entry.state === "active" && (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {confirmOpen && (
        <ConfirmInviteModal
          entry={entry}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSend}
        />
      )}
    </>
  );
}

function ConfirmInviteModal({
  entry,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: Entry;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = entry.display_name ?? entry.email ?? "this user";
  return (
    <tr>
      <td colSpan={4} className="p-0">
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Activate {name} for Mission Access?
              </h3>
              <button
                onClick={onCancel}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-muted-foreground">
              <p>
                This will send an invitation email to{" "}
                <span className="text-foreground font-medium">{entry.email}</span> and
                initiate their account creation. They will not have mission access until
                they complete onboarding.
              </p>
              <div className="rounded-md border border-border bg-background/40 p-3 space-y-2 text-[12px]">
                <Row label="Mission" value={entry.mission_name ?? "— (no mission assigned)"} />
                <Row label="Role" value={entry.role ?? entry.role_hint ?? "—"} />
                <Row
                  label="Expected Start"
                  value={
                    entry.expected_start_date
                      ? new Date(entry.expected_start_date + "T00:00:00").toLocaleDateString()
                      : "TBD"
                  }
                />
                <Row label="Engagement Lead" value={entry.engagement_lead_name ?? "—"} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                The invitation link expires in 72 hours.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
              <button
                onClick={onCancel}
                disabled={busy}
                className="rounded-md border border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Not Yet
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white disabled:opacity-60"
                style={{ background: "#C9922A" }}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send Official Invite
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

function AddToRosterCard({
  onAdded,
  missions,
}: {
  onAdded: () => void;
  missions: MissionOpt[];
}) {
  const loadFn = useServerFn(loadUser);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [missionId, setMissionId] = useState("");
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await loadFn({
        data: {
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          role: role.trim() || undefined,
          roleHint: role.trim() || undefined,
          missionId: missionId || undefined,
          expectedStartDate: expectedStartDate || undefined,
        },
      });
      toast.success(`${email} loaded to roster.`);
      setEmail("");
      setDisplayName("");
      setRole("");
      setMissionId("");
      setExpectedStartDate("");
      onAdded();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[10px] border border-border bg-surface p-4 flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-[180px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@org.com"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Display name
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Optional"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Mission
        </label>
        <select
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">— Select mission —</option>
          {missions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Role
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Writer, SME…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Expected start
        </label>
        <input
          type="date"
          value={expectedStartDate}
          onChange={(e) => setExpectedStartDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-surface-hover disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Load to roster
      </button>
    </form>
  );
}
