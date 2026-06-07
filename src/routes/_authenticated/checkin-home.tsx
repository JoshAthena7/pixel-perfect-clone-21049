// Phase 3 — simplified landing for checkin_only users.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/checkin-home")({
  component: CheckInHome,
});

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CheckInHome() {
  const { data: me } = useQuery({
    queryKey: ["checkin-home-me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["checkin-home-rows", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,status,pens_down_date,missions:mission_id(name)")
        .or(`assigned_writer_id.eq.${me!.id},assigned_sme_id.eq.${me!.id}`)
        .order("pens_down_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as any[];
    },
  });

  const firstName = (me?.user_metadata?.full_name ?? me?.email ?? "there").split(/[\s@]/)[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
          ATLAS Check-In
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {firstName}.</h1>

        <div className="mt-8">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your current assignments
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">One moment…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border bg-surface/40 px-6 py-10 text-center text-sm text-muted-foreground">
              You have no active assignments. Contact your PM.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border bg-card">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">{r.missions?.name ?? "Mission"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium">Section {r.question_number}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Due {fmtDate(r.pens_down_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          <Link
            to="/checkin/$token"
            params={{ token: "current" }}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            <ClipboardCheck className="h-4 w-4" />
            Submit Weekly Check-In →
          </Link>
        </div>
      </div>
    </div>
  );
}
