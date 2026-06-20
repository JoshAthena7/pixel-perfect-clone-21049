import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/insights")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: AdminInsightsPage,
});

function AdminInsightsPage() {
  return (
    <div className="p-8" style={{ background: "#080c14", minHeight: "100vh", color: "rgba(255,255,255,0.9)" }}>
      <div className="max-w-4xl">
        <div className="uppercase tracking-[0.16em] text-[10px] mb-1" style={{ color: "#c9a84c" }}>
          ADMIN · INSIGHTS
        </div>
        <h1 className="text-2xl font-semibold text-white">Debriefs</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Platform-wide post-mission debriefs and lessons learned. Coming in V2.
        </p>
      </div>
    </div>
  );
}
