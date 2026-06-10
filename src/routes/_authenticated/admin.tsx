import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Home, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    // Platform admin (profiles flag) OR app-role admin (user_roles) may enter.
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) {
      throw redirect({ to: "/olympus/missions" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen bg-background px-8 py-8 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.28em]">Olympus</span>
        </div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Admin tools are being rebuilt after the legacy cleanup.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/admin/team"
            className="rounded-lg border p-4 hover:border-primary transition-colors block"
          >
            <div className="text-sm font-semibold">Athena Team Roster →</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Import the team from a TalentDesk CSV, or add members manually. Populates the Mission Wizard team pickers.
            </p>
          </Link>
        </div>

        <Link to="/missions" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <Home className="h-4 w-4" /> Back to missions
        </Link>
      </div>
    </div>
  );
}
