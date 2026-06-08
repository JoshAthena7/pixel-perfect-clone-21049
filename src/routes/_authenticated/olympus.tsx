import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useIsAdmin } from "@/hooks/useAccess";
import { StrategicOlympus } from "@/components/v2/StrategicOlympus";
import { supabase } from "@/integrations/supabase/client";

// Olympus is LOCKED to platform admins ONLY.
// Non-admins used to be silently redirected — now they see a diagnostic
// panel explaining exactly why Fast Reports / Olympus is hidden for them.
export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusStrategic,
});

function OlympusStrategic() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        One moment…
      </div>
    );
  }

  if (!isAdmin) {
    return <FastReportsAccessDiagnostic />;
  }

  return (
    <StrategicOlympus
      canSubmitDecisions={true}
      canResolveDecisions={true}
    />
  );
}

function FastReportsAccessDiagnostic() {
  const [info, setInfo] = useState<{
    userId: string | null;
    email: string | null;
  }>({ userId: null, email: null });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setInfo({
        userId: data.user?.id ?? null,
        email: data.user?.email ?? null,
      });
    });
  }, []);

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-2xl rounded-lg border border-white/10 bg-white/5 p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Access diagnostic
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Why can't I see Fast Reports?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Fast Reports lives in the <span className="font-mono">/olympus</span>{" "}
          header and is restricted to platform admins. Your account is signed
          in, but it does not have the <span className="font-mono">admin</span>{" "}
          role in <span className="font-mono">user_roles</span>, so the Olympus
          surface (and its Fast Reports menu) is hidden for you.
        </p>

        <dl className="mt-6 space-y-2 rounded-md border border-white/10 bg-black/30 p-4 text-[13px] font-mono">
          <Row label="Signed in" value="yes" tone="ok" />
          <Row
            label="Email"
            value={info.email ?? "—"}
          />
          <Row
            label="User ID"
            value={info.userId ?? "—"}
          />
          <Row label="Platform admin" value="no" tone="bad" />
          <Row label="Olympus access" value="denied" tone="bad" />
          <Row label="Fast Reports visible" value="no" tone="bad" />
        </dl>

        <div className="mt-6 rounded-md border border-white/10 bg-white/5 p-4 text-sm text-foreground/80">
          <div className="font-semibold text-foreground">To get access</div>
          <p className="mt-1 text-muted-foreground">
            Ask a platform admin to add the <span className="font-mono">admin</span>{" "}
            role to your user in <span className="font-mono">user_roles</span>.
            Once granted, reload this page — the Fast Reports menu will appear
            in the Olympus header (top right).
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            to="/home"
            className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm text-foreground hover:bg-white/10"
          >
            Back to Atrium
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm text-foreground hover:bg-white/10"
          >
            Re-check access
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-foreground/90";
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`truncate ${color}`}>{value}</dd>
    </div>
  );
}
