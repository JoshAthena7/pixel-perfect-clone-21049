import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: AdminActivityPage,
});

function AdminActivityPage() {
  return (
    <div className="p-8" style={{ background: "#080c14", minHeight: "100vh", color: "rgba(255,255,255,0.9)" }}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-medium mb-2" style={{ color: "#c9a84c" }}>
          Activity
        </h1>
        <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          Platform-wide activity log.
        </p>
      </div>
    </div>
  );
}
