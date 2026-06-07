import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldOff, Search } from "lucide-react";
import {
  listPlatformAdmins,
  grantPlatformAdmin,
  revokePlatformAdmin,
} from "@/lib/platform-admins.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/admins")({
  component: AdminsPage,
});

type AdminUser = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarColor: string | null;
  isAdmin: boolean;
  grantedAt: string | null;
};

function AdminsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformAdmins);
  const grantFn = useServerFn(grantPlatformAdmin);
  const revokeFn = useServerFn(revokePlatformAdmin);
  const [filter, setFilter] = useState("");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["olympus-platform-admins"],
    queryFn: () => listFn(),
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }, [users, filter]);

  const admins = filtered.filter((u) => u.isAdmin);
  const nonAdmins = filtered.filter((u) => !u.isAdmin);

  const [grantTarget, setGrantTarget] = useState<AdminUser | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);
  const [selfRevokeBlocked, setSelfRevokeBlocked] = useState(false);

  async function doGrant() {
    if (!grantTarget) return;
    try {
      await grantFn({ data: { userId: grantTarget.id } });
      toast.success(`${grantTarget.displayName ?? grantTarget.email} promoted to admin`);
      qc.invalidateQueries({ queryKey: ["olympus-platform-admins"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to grant admin role");
    } finally {
      setGrantTarget(null);
    }
  }

  async function doRevoke() {
    if (!revokeTarget) return;
    try {
      await revokeFn({ data: { userId: revokeTarget.id } });
      toast.success(`${revokeTarget.displayName ?? revokeTarget.email} no longer has admin access`);
      qc.invalidateQueries({ queryKey: ["olympus-platform-admins"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to revoke admin role");
    } finally {
      setRevokeTarget(null);
    }
  }

  function onRevokeClick(u: AdminUser) {
    if (me && u.id === me) {
      setSelfRevokeBlocked(true);
      return;
    }
    setRevokeTarget(u);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Platform</div>
        <h1 className="h1-display mt-1">Admins</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who has platform-admin access. Admins can see every mission, access Olympus, and grant or revoke this role.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name or email"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading admin roster…</div>
      ) : (
        <>
          <Section title="Platform admins" count={admins.length} icon={<ShieldCheck className="h-4 w-4" />}>
            {admins.length === 0 ? (
              <Empty>No admins match this filter.</Empty>
            ) : (
              admins.map((u) => (
                <Row key={u.id} user={u} isSelf={me === u.id}
                  action={
                    <button
                      onClick={() => onRevokeClick(u)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                    >
                      <ShieldOff className="h-3 w-3" /> Revoke
                    </button>
                  }
                />
              ))
            )}
          </Section>

          <Section title="Other users" count={nonAdmins.length} icon={<Shield className="h-4 w-4" />}>
            {nonAdmins.length === 0 ? (
              <Empty>No other users match this filter.</Empty>
            ) : (
              nonAdmins.map((u) => (
                <Row key={u.id} user={u} isSelf={false}
                  action={
                    <button
                      onClick={() => setGrantTarget(u)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background hover:opacity-90"
                    >
                      <ShieldCheck className="h-3 w-3" /> Promote
                    </button>
                  }
                />
              ))
            )}
          </Section>
        </>
      )}

      {/* Promote confirmation */}
      <AlertDialog open={!!grantTarget} onOpenChange={(o) => !o && setGrantTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Grant {grantTarget?.displayName ?? grantTarget?.email} platform admin access?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be able to see all missions, access Olympus, and grant or revoke this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doGrant}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove admin access from {revokeTarget?.displayName ?? revokeTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to access Olympus or admin settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRevoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Self-revoke blocked */}
      <AlertDialog open={selfRevokeBlocked} onOpenChange={setSelfRevokeBlocked}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You can't revoke your own admin access</AlertDialogTitle>
            <AlertDialogDescription>
              Ask another admin to do this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSelfRevokeBlocked(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {icon}{title}<span className="text-[10px] text-muted-foreground/70">· {count}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({ user, action, isSelf }: { user: AdminUser; action: React.ReactNode; isSelf: boolean }) {
  const initials = (user.displayName ?? user.email ?? "?")
    .split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-background"
        style={{ background: user.avatarColor ?? "#64748b" }}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {user.displayName ?? user.email ?? "Unknown"}
          {isSelf && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">you</span>}
        </div>
        {user.email && <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>}
      </div>
      {user.grantedAt && (
        <div className="hidden sm:block text-[10px] text-muted-foreground">
          since {new Date(user.grantedAt).toLocaleDateString()}
        </div>
      )}
      <div>{action}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</div>;
}
