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
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const i = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

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
      toast.success("Secure channel established. Check your inbox.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send magic link");
    } finally {
      setLoading(false);
    }
  }

  const utc = clock.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const sessionId = "ATLAS-" + clock.getTime().toString(36).toUpperCase().slice(-8);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070a] px-4 font-mono text-foreground">
      {/* Grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,160,200,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(120,160,200,0.25) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      {/* Radial vignette + amber glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.10),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0)_0%,rgba(0,0,0,0.7)_90%)]" />
      {/* Scanline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--athena-gold,#f59e0b)] to-transparent opacity-60 animate-[scan_6s_linear_infinite]" />
      {/* Noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Classification banners */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[color:var(--athena-gold,#f59e0b)]/40 bg-[color:var(--athena-gold,#f59e0b)]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.4em] text-[color:var(--athena-gold,#f59e0b)] backdrop-blur-sm">
        <span>// Classified · Athena Eyes Only</span>
        <span className="hidden sm:inline">Tier IV · Compartmented</span>
        <span>SCI · Need-to-Know</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-[color:var(--athena-gold,#f59e0b)]/40 bg-[color:var(--athena-gold,#f59e0b)]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.4em] text-[color:var(--athena-gold,#f59e0b)] backdrop-blur-sm">
        <span>{utc}</span>
        <span className="hidden sm:inline">SESSION {sessionId}</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Secure Channel
        </span>
      </div>

      {/* Card */}
      <div className="relative z-20 w-full max-w-md">
        {/* corner brackets */}
        <CornerBrackets />
        <div className="relative rounded-[2px] border border-[color:var(--athena-gold,#f59e0b)]/30 bg-[#0a0d12]/85 p-8 shadow-[0_0_60px_-10px_rgba(245,158,11,0.25),inset_0_0_60px_-30px_rgba(245,158,11,0.15)] backdrop-blur-xl">
          {/* top meta strip */}
          <div className="mb-6 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--athena-gold,#f59e0b)]" />
              DOC-001 / AUTH
            </span>
            <span>REV 24.06</span>
          </div>

          <div className="mb-7 text-center">
            <img src={athenaSgLogo.url} alt="Athena Strategy Group" className="mx-auto mb-5 h-14 object-contain opacity-90" />
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="text-2xl text-[color:var(--athena-gold,#f59e0b)] drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">⚡</span>
              <span className="text-3xl font-extrabold tracking-[0.32em] uppercase text-foreground">Atlas</span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">Command Console · IRIS Core</p>
            <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-[color:var(--athena-gold,#f59e0b)]/60 to-transparent" />
            <p className="mt-3 text-[11px] tracking-[0.12em] text-muted-foreground">
              Identity verification required to access mission intelligence.
            </p>
          </div>

          {sent ? (
            <div className="rounded-[2px] border border-emerald-500/30 bg-emerald-500/5 p-5 text-center text-sm">
              <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-emerald-400">// Transmission sent</p>
              <p className="text-foreground">Secure link dispatched to</p>
              <p className="mt-1 font-bold tracking-wider text-[color:var(--athena-gold,#f59e0b)]">{email}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Open the link from your inbox to complete authentication.
              </p>
              <button
                className="mt-4 text-xs uppercase tracking-[0.25em] text-emerald-400 hover:text-emerald-300"
                onClick={() => setSent(false)}
              >
                ← Use different identity
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  <span>Operator Identity</span>
                  <span className="text-[color:var(--athena-gold,#f59e0b)]/70">required</span>
                </label>
                <div className="group relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--athena-gold,#f59e0b)]/70">▸</span>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@athena.gov"
                    className="h-11 rounded-[2px] border-[color:var(--athena-gold,#f59e0b)]/25 bg-black/40 pl-8 font-mono tracking-wider text-foreground placeholder:text-muted-foreground/40 focus-visible:border-[color:var(--athena-gold,#f59e0b)]/70 focus-visible:ring-[color:var(--athena-gold,#f59e0b)]/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-[2px] border border-[color:var(--athena-gold,#f59e0b)]/60 bg-[color:var(--athena-gold,#f59e0b)]/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.35em] text-[color:var(--athena-gold,#f59e0b)] transition hover:bg-[color:var(--athena-gold,#f59e0b)]/20 hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.5)] disabled:opacity-50"
              >
                <span className="absolute inset-y-0 left-0 w-0.5 bg-[color:var(--athena-gold,#f59e0b)]" />
                <span className="absolute inset-y-0 right-0 w-0.5 bg-[color:var(--athena-gold,#f59e0b)]" />
                <span className="relative flex items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--athena-gold,#f59e0b)]" />
                      Establishing secure channel…
                    </>
                  ) : (
                    <>
                      <span>Initiate Authentication</span>
                      <span className="transition group-hover:translate-x-1">→</span>
                    </>
                  )}
                </span>
              </button>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" /> Zero-password protocol
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" /> End-to-end encrypted dispatch
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" /> Single-use credential, 15-min window
                </div>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] uppercase tracking-[0.32em] text-muted-foreground/70">
          Built by Athena · Powered by IRIS
        </p>
      </div>

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}

function CornerBrackets() {
  const c = "absolute h-4 w-4 border-[color:var(--athena-gold,#f59e0b)]/70";
  return (
    <>
      <span className={`${c} -left-1 -top-1 border-l-2 border-t-2`} />
      <span className={`${c} -right-1 -top-1 border-r-2 border-t-2`} />
      <span className={`${c} -left-1 -bottom-1 border-l-2 border-b-2`} />
      <span className={`${c} -right-1 -bottom-1 border-r-2 border-b-2`} />
    </>
  );
}
