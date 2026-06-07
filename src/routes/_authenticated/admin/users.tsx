import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  UserCog,
  Users as UsersIcon,
  Sparkles,
  Send,
  Mail,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  listTeamRoster,
  loadUser,
  sendOfficialInvite,
} from "@/lib/atlas-invites.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

type Roster = Awaited<ReturnType<typeof listTeamRoster>>;
type Entry = Roster[number];

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "loaded" | "invited" | "active">("all");

  const listFn = useServerFn(listTeamRoster);
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["olympus-team-roster"],
    queryFn: () => listFn() as Promise<Roster>,
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

      <AddToRosterCard onAdded={refresh} />

      <div className="mt-6 mb-3 flex items-center gap-1.5">
        {(["all", "loaded", "invited", "active"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
              filter === f
                ? "border-amber-300/60 bg-amber-300/10 text-amber-100"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} · {counts[f]}
          </button>
        ))}
      </div>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <UserCog className="mx-auto mb-2 h-6 w-6 opacity-60" /> No users match.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Person</th>
                <th className="px-4 py-3 text-left w-32">State</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right w-56">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((e) => (
                <RosterRow key={e.key} entry={e} onChanged={refresh} />
              ))}
            </tbody>
          </table>
        )}
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

  async function onInvite() {
    if (!entry.invite_id) return;
    setBusy(true);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/welcome` : undefined;
      await sendFn({ data: { id: entry.invite_id, redirectTo } });
      toast.success("Invitation sent.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send invite");
    } finally {
      setBusy(false);
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
      <td className="px-4 py-3">
        <StateBadge state={entry.state} />
      </td>
      <td className="px-4 py-3 text-[12px] text-muted-foreground">
        {entry.state === "loaded" && (
          <span>Added to roster · no email sent</span>
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
            onClick={onInvite}
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
            onClick={onInvite}
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
  );
}

function AddToRosterCard({ onAdded }: { onAdded: () => void }) {
  const loadFn = useServerFn(loadUser);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleHint, setRoleHint] = useState("");
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
          roleHint: roleHint.trim() || undefined,
        },
      });
      toast.success(`${email} loaded to roster.`);
      setEmail("");
      setDisplayName("");
      setRoleHint("");
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
      <div className="flex-1 min-w-[200px]">
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
      <div className="flex-1 min-w-[160px]">
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
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Role hint
        </label>
        <input
          value={roleHint}
          onChange={(e) => setRoleHint(e.target.value)}
          placeholder="Writer, SME…"
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
