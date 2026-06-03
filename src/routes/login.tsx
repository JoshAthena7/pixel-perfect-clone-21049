import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import athenaSgLogo from "@/assets/athena-sg-lockup.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Atlas" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your inbox for the sign-in link.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send sign-in link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 text-foreground"
      style={{
        background: "#060b14",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Soft amber glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.08),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0)_0%,rgba(0,0,0,0.5)_90%)]" />

      {/* Card */}
      <div className="relative z-20 w-full max-w-md">
        <div
          className="relative rounded-[16px] border p-9 backdrop-blur-xl"
          style={{
            background: "linear-gradient(145deg, #0f1520 0%, #0a0e1a 60%)",
            borderColor: "rgba(245,158,11,0.20)",
            boxShadow: "inset 0 0 80px rgba(245,158,11,0.05), 0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div className="mb-8 text-center">
            <img src={athenaSgLogo.url} alt="Athena Strategy Group" className="mx-auto mb-6 h-12 object-contain opacity-90" />
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="text-xl text-[color:var(--athena-gold,#f59e0b)] drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">⚡</span>
              <span className="text-2xl font-extrabold tracking-[0.18em] text-foreground" style={{ letterSpacing: "0.18em" }}>
                ATLAS
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              by Athena Strategy Group
            </p>
          </div>

          {sent ? (
            <div className="rounded-[10px] border border-emerald-500/30 bg-emerald-500/5 p-5 text-center text-sm">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-emerald-400">Check your inbox</p>
              <p className="text-foreground">We sent a sign-in link to</p>
              <p className="mt-1 font-semibold text-[color:var(--athena-gold,#f59e0b)]">{email}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Open the link from your inbox to finish signing in.
              </p>
              <button
                className="mt-4 text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => setSent(false)}
              >
                ← Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@athenasg.com"
                  className="h-11 rounded-[8px] border-[color:var(--athena-gold,#f59e0b)]/25 bg-black/30 text-foreground placeholder:text-muted-foreground/40 focus-visible:border-[color:var(--athena-gold,#f59e0b)]/60 focus-visible:ring-[color:var(--athena-gold,#f59e0b)]/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[8px] border px-4 py-3 text-[12px] font-semibold transition disabled:opacity-50"
                style={{
                  color: "var(--athena-gold, #f59e0b)",
                  background: "rgba(245,158,11,0.10)",
                  borderColor: "rgba(245,158,11,0.45)",
                }}
              >
                {loading ? "Sending link…" : "Send sign-in link →"}
              </button>

              <p className="pt-1 text-center text-[11px] text-muted-foreground">
                We'll email you a single-use link. No password required.
              </p>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Atlas. Built by Athena. Powered by IRIS.
        </p>
      </div>
    </div>
  );
}
