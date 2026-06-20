import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const replaySplash = () => {
    try {
      sessionStorage.removeItem("atlas_splash_shown");
    } catch {
      // ignore
    }
    // Force a full reload at the current path so the root mounts fresh and
    // the SplashGate runs again. Using location.reload keeps the user where
    // they are while still re-triggering the splash overlay.
    window.location.reload();
  };

  return (
    <div className="p-8" style={{ background: "#080c14", minHeight: "100vh", color: "rgba(255,255,255,0.9)" }}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold mb-2" style={{ color: "#c9a84c" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Platform administration settings.
        </p>

        <div
          className="mt-8 rounded-lg p-5"
          style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="text-xs uppercase tracking-[0.25em]" style={{ color: "rgba(201,168,76,0.7)" }}>
            Developer Tools
          </div>

          <div className="mt-3 flex items-center justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-white">Screen Previewer & Dev Panel</div>
              <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Opens the full dev drawer: 8 categories of screens, role simulator, modal/animation triggers, quick actions.
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("atlas-devtools-open"))}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                background: "rgba(201,168,76,0.15)",
                color: "#c9a84c",
                border: "1px solid rgba(201,168,76,0.4)",
              }}
            >
              Open Developer Tools
            </button>
          </div>

          <div className="mt-4 pt-4 flex items-center justify-between gap-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <div className="text-sm font-medium text-white">Replay ATLAS splash</div>
              <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Clears the session flag and reloads so the constellation load screen plays again.
              </div>
            </div>
            <button
              onClick={replaySplash}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                background: "rgba(201,168,76,0.15)",
                color: "#c9a84c",
                border: "1px solid rgba(201,168,76,0.4)",
              }}
            >
              Replay splash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

