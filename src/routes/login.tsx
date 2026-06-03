import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import loginBg from "@/assets/atlas-login-bg.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Atlas" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function routeAfterAuth(userId: string) {
    const { data: memberships = [] } = await supabase
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
    navigate({ to: "/home", replace: true });
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) routeAfterAuth(s.user.id);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) routeAfterAuth(data.user.id);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#040814] text-white">
      {/* Aspect-locked stage holds both the reference graphic and the interactive overlay so they always align */}
      <div
        className="relative w-full"
        style={{ aspectRatio: "1536 / 1024", maxHeight: "100vh", maxWidth: "calc(100vh * 1536 / 1024)" }}
      >
        <img
          src={loginBg.url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />

        {/* Interactive form overlay — covers the WELCOME BACK panel in the graphic */}
        <div
          className="absolute"
          style={{ left: "34.2%", right: "34.2%", top: "36.2%", bottom: "32.8%" }}
        >
            <div className="relative h-full w-full overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-b from-[#0b1733] to-[#050b1a] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
              <form onSubmit={onSubmit} className="flex h-full w-full flex-col px-7 py-5">
                <h2 className="mb-4 text-center text-[15px] font-semibold uppercase tracking-[0.35em] text-amber-400">
                  Welcome Back
                </h2>

                <label className="mb-3 block">
                  <span className="mb-1 block text-[12px] font-medium text-white/85">Email</span>
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full rounded-md border border-amber-500/20 bg-[#0a1428] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/35 transition focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                    />
                  </div>
                </label>

                <label className="mb-4 block">
                  <span className="mb-1 block text-[12px] font-medium text-white/85">Password</span>
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c1.1 0 2 .9 2 2v3a2 2 0 11-4 0v-3c0-1.1.9-2 2-2zm6-3V7a6 6 0 10-12 0v1H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-9a2 2 0 00-2-2h-1z" /></svg>
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-md border border-amber-500/20 bg-[#0a1428] py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-white/35 transition focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/60 hover:text-amber-300"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" strokeWidth={1.5} /></svg>
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="group mt-auto flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#1a1206] shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition hover:from-amber-200 hover:to-amber-500 disabled:opacity-60"
                >
                  {loading ? "Entering…" : "Enter Atlas"}
                  {!loading && (
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
  );
}
