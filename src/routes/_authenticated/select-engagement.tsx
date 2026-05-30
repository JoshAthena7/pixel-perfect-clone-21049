import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useEngagement, type Membership } from "@/hooks/use-engagement";
import { supabase } from "@/integrations/supabase/client";
import athenaLogo from "@/assets/athena-logo-dark.png";
import { LogOut, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/select-engagement")({
  head: () => ({ meta: [{ title: "Select engagement — Athena" }] }),
  component: SelectEngagementPage,
});

const ROLE_BADGE: Record<string, string> = {
  founder: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  pm: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  engagement_lead: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  writer: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  viewer: "bg-zinc-500/15 text-zinc-200 border-zinc-500/40",
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  viewer: "Viewer",
};

function routeForRole(role: string): string {
  if (role === "writer") return "/writer/my-sections";
  return "/command";
}

function SelectEngagementPage() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const navigate = useNavigate();

  // Auto-route: 0 memberships shows empty state; 1 routes immediately;
  // founder/pm with 3+ goes to cross-engagement overview.
  useEffect(() => {
    if (loading) return;
    if (memberships.length === 1) {
      const m = memberships[0];
      switchEngagement(m.engagement.id);
      navigate({ to: routeForRole(m.role), replace: true });
      return;
    }
    const hasLeadership = memberships.some((m) => m.role === "founder" || m.role === "pm");
    if (memberships.length >= 3 && hasLeadership) {
      navigate({ to: "/overview", replace: true });
    }
  }, [loading, memberships, navigate, switchEngagement]);

  function pick(m: Membership) {
    switchEngagement(m.engagement.id);
    navigate({ to: routeForRole(m.role), replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading engagements…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={athenaLogo} alt="Athena" className="h-10 w-auto" />
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--gold)]">Athena</div>
              <h1 className="text-xl font-bold">Select an engagement</h1>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>

        {memberships.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center">
            <h2 className="text-lg font-semibold">No engagements yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask a founder or PM to invite you to an engagement.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {memberships.map((m) => (
              <button
                key={m.engagement.id}
                onClick={() => pick(m)}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 text-left transition hover:border-[var(--gold)]/60 hover:bg-surface-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold">{m.engagement.name}</div>
                    <div className="truncate text-sm text-muted-foreground">{m.engagement.client}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${ROLE_BADGE[m.role] ?? ""}`}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded bg-surface-hover px-1.5 py-0.5">{m.engagement.status}</span>
                  {m.engagement.submission_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(m.engagement.submission_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
