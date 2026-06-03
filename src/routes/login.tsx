import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import athenaSgBrand from "@/assets/athena-sg-transparent.png.asset.json";
import atlasLogo from "@/assets/atlas-logo.png.asset.json";
import irisLogo from "@/assets/iris-logo.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Atlas" }] }),
  component: LoginPage,
});

const IRIS_BRIEFINGS = [
  {
    label: "IRIS Briefing · 06:00",
    body: "Good morning. Three active missions require attention today. Two milestones are approaching. One risk signal needs review.",
  },
  {
    label: "IRIS Doctrine · 14",
    body: "Alignment is not agreement. Alignment is shared understanding.",
  },
  {
    label: "IRIS Doctrine · 27",
    body: "The fastest teams are not the busiest teams. They are the most aligned.",
  },
];

const PILLARS = [
  {
    id: "01",
    title: "Intelligence",
    body: "Mission intelligence, signals, decisions, and institutional memory.",
  },
  {
    id: "02",
    title: "Alignment",
    body: "Shared understanding across leaders, writers, SMEs, and stakeholders.",
  },
  {
    id: "03",
    title: "Execution",
    body: "Move work forward with clarity, accountability, and confidence.",
  },
];

function useClockUTC() {
  const [now, setNow] = useState<string>(() => formatUTC(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(formatUTC(new Date())), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatUTC(d: Date) {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [briefingIdx, setBriefingIdx] = useState(0);
  const clock = useClockUTC();

  useEffect(() => {
    const t = setInterval(() => {
      setBriefingIdx((i) => (i + 1) % IRIS_BRIEFINGS.length);
    }, 6500);
    return () => clearInterval(t);
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  const briefing = useMemo(() => IRIS_BRIEFINGS[briefingIdx], [briefingIdx]);

  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#050505] text-[#e0e0e0] selection:bg-amber-500/30"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Background telemetry layer */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.12]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, #333 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.05), transparent 60%)",
          }}
        />
        <div className="absolute left-10 top-24 hidden space-y-1 font-mono text-[10px] text-white/40 md:block">
          <p>SYS.INIT_SEQUENCING........ [OK]</p>
          <p>ATLAS_CORE_V4.2.1_STABLE</p>
          <p>UPLINK_STRENGTH: 98.4%</p>
          <p>ENCRYPTION: AES-256-GCM</p>
          <p>IRIS_HEURISTICS: ACTIVE</p>
          <p>LOC: 38.8977 N, 77.0365 W</p>
        </div>
        <div className="absolute bottom-28 right-10 hidden space-y-1 text-right font-mono text-[10px] text-white/40 md:block">
          <p>VECTOR_MAP_ALPHA: 0.00342</p>
          <p>MISSION_ENG_01: RUNNING</p>
          <p>STRAT_INTEL_LOAD: 12%</p>
          <p>SECURE_SHELL_INITIATED</p>
        </div>
      </div>

      {/* Top status bar */}
      <header className="relative z-20 flex h-12 items-center justify-between border-b border-white/10 bg-black/50 px-6 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="font-mono text-[10px] font-medium uppercase tracking-widest">
              System Live
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-widest text-white/40">
            {clock}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[10px] text-white/40 sm:inline">
            ATHENA STRATEGY GROUP
          </span>
          <div className="hidden h-3 w-px bg-white/20 sm:block" />
          <span className="font-mono text-[10px] uppercase tracking-tighter text-amber-500">
            IRIS ACTIVE
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* Left column: brand + IRIS briefing */}
          <div className="hidden space-y-10 lg:col-span-7 lg:block">
            {/* Header */}
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">
                  Strategic Intelligence Platform
                </span>
              </div>
              <h1
                className="text-7xl font-light leading-none tracking-tight text-white"
                style={{ letterSpacing: "0.06em" }}
              >
                ATLAS
              </h1>
              <p className="text-sm font-light uppercase tracking-[0.4em] text-white/50">
                Intelligence · Alignment · Execution
              </p>
              <p className="max-w-xl text-base font-light leading-relaxed text-white/70">
                ATLAS brings together intelligence, decisions, people, and work
                into a single source of truth. Powered by IRIS, every mission
                stays aligned, informed, and moving forward.
              </p>
            </div>

            {/* IRIS briefing — live rotator */}
            <div className="relative overflow-hidden border border-white/10 bg-black/40 backdrop-blur-sm">
              {/* corner accents */}
              <div className="absolute -left-px -top-px h-3 w-3 border-l border-t border-amber-500/60" />
              <div className="absolute -bottom-px -right-px h-3 w-3 border-b border-r border-amber-500/60" />

              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400/90">
                    {briefing.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {IRIS_BRIEFINGS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 w-4 transition-colors duration-500 ${
                        i === briefingIdx ? "bg-amber-400" : "bg-white/15"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="relative flex min-h-[110px] items-start gap-4 px-6 py-6">
                <img
                  src={irisLogo.url}
                  alt="IRIS"
                  className="mt-1 h-10 w-10 shrink-0 object-contain"
                />
                <p
                  key={briefingIdx}
                  className="iris-fade text-lg font-light leading-relaxed text-white"
                >
                  <span className="mr-2 text-amber-400/80">›</span>
                  {briefing.body}
                </p>
              </div>
            </div>

            {/* Pillars */}
            <div className="grid grid-cols-3 gap-px border border-white/10 bg-white/10">
              {PILLARS.map((p) => (
                <div
                  key={p.id}
                  className="group bg-[#0a0a0a] p-5 transition-colors hover:bg-[#0c0c0e]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-widest text-white/30">
                      {p.id}
                    </span>
                    <span className="h-px w-6 bg-amber-500/40 transition-all group-hover:w-10 group-hover:bg-amber-500" />
                  </div>
                  <h3 className="mb-2 text-base font-medium tracking-tight text-white">
                    {p.title}
                  </h3>
                  <p className="text-xs font-light leading-relaxed text-white/50">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: sign-in console */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md border border-white/10 bg-[#0a0a0a] p-10 shadow-2xl">
              {/* corner accents */}
              <div className="absolute -left-px -top-px h-4 w-4 border-l border-t border-amber-500/60" />
              <div className="absolute -right-px -top-px h-4 w-4 border-r border-t border-amber-500/60" />
              <div className="absolute -bottom-px -left-px h-4 w-4 border-b border-l border-amber-500/60" />
              <div className="absolute -bottom-px -right-px h-4 w-4 border-b border-r border-amber-500/60" />

              {/* Mobile header */}
              <div className="mb-8 space-y-2 lg:hidden">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">
                  Strategic Intelligence Platform
                </p>
                <h1
                  className="text-4xl font-light tracking-tight text-white"
                  style={{ letterSpacing: "0.06em" }}
                >
                  ATLAS
                </h1>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                  Intelligence · Alignment · Execution
                </p>
              </div>

              <div className="mb-8 space-y-2">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-px w-6 bg-amber-500" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-500">
                    Personnel Sign-in
                  </span>
                </div>
                <h2 className="text-3xl font-light tracking-tight text-white">
                  Welcome Back
                </h2>
                <p className="text-sm font-light text-white/50">
                  Resume command of your active missions.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block font-mono text-[10px] uppercase tracking-widest text-white/40"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@athenasg.com"
                    className="w-full rounded-none border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm text-white placeholder:text-white/20 transition-all focus:border-amber-500/50 focus:bg-white/[0.08] focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block font-mono text-[10px] uppercase tracking-widest text-white/40"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-none border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm tracking-widest text-white placeholder:text-white/20 transition-all focus:border-amber-500/50 focus:bg-white/[0.08] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden bg-amber-600 py-4 font-semibold text-black transition-all duration-300 hover:bg-amber-500 disabled:opacity-60"
                >
                  <span className="text-sm uppercase tracking-widest">
                    {loading ? "Authenticating…" : "Sign In"}
                  </span>
                  {!loading && (
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  )}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#0a0a0a] px-4 font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">
                      Authorized Access Only
                    </span>
                  </div>
                </div>
              </form>

              <p className="mt-6 text-center font-mono text-[10px] uppercase leading-relaxed text-white/20">
                Restricted access. All actions are logged and monitored.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 flex h-14 items-center justify-between border-t border-white/10 bg-black/60 px-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <img
            src={athenaSgBrand.url}
            alt="Athena Strategy Group"
            className="h-6 w-auto object-contain opacity-70"
          />
          <div className="hidden h-3 w-px bg-white/15 sm:block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-white/40 sm:inline">
            Athena Strategic Intelligence Platform
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            Powered by
          </span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-500">
            IRIS
          </span>
        </div>
      </footer>

      <style>{`
        .iris-fade {
          animation: irisFade 600ms ease-out;
        }
        @keyframes irisFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
