import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import atlasLoginBg from "@/assets/atlas-login-bg.png.asset.json";

export function AtlasLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function routeAfterAuth(userId: string) {
    try {
      const { data: memberships } = await supabase
        .from("mission_members")
        .select("role,mission_id,missions:mission_id(id,status)")
        .eq("user_id", userId);
      const active = (memberships ?? []).filter((m: any) => m.missions?.status === "Active");
      const roles = active.map((m: any) => m.role);
      const isLeader = roles.includes("admin") || roles.includes("lead");
      if (!isLeader && active.length === 1) {
        navigate({ to: "/missions/$missionId/questions", params: { missionId: active[0].mission_id }, replace: true });
        return;
      }
    } catch {
      // fall through
    }
    navigate({ to: "/atrium", replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) routeAfterAuth(data.user.id);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in.");
      if (data.user) await routeAfterAuth(data.user.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh w-full bg-black text-foreground flex items-center justify-center overflow-hidden">
      <div
        className="relative w-full max-w-[1536px]"
        style={{ aspectRatio: "1536 / 1024" }}
      >
        {/* Full-bleed branded backdrop */}
        <img
          src={atlasLoginBg.url}
          alt="ATLAS — Athena Strategy Group"
          className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
          draggable={false}
        />

        {/* Form overlay — sits over the WELCOME BACK panel in the artwork */}
        <div
          className="absolute"
          style={{ left: "33%", right: "33%", top: "36%", bottom: "27%" }}
        >
          <form
            onSubmit={onSubmit}
            className="flex h-full w-full flex-col justify-center gap-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/80"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-sm border border-amber-200/30 bg-black/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/80"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-sm border border-amber-200/30 bg-black/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex items-center justify-center rounded-sm bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.3em] text-black shadow-[0_4px_24px_-8px_rgba(251,191,36,0.6)] transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Entering…" : "Enter Atlas"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
