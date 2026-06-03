import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import atlasIrisBrand from "@/assets/atlas-iris-brand.png.asset.json";
import athenaSgBrand from "@/assets/athena-sg-brand.png.asset.json";


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
      className="flex min-h-screen w-full select-none items-center justify-center bg-[#020203] p-4 md:p-8 text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] shadow-2xl shadow-black/80 md:grid-cols-2">
        {/* Left: brand immersion */}
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/5 bg-gradient-to-br from-[#0a0f14] to-[#020203] p-12 md:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400/90">
                Strategic Intelligence
              </span>
              <div className="h-px w-8 bg-amber-400/30" />
            </div>
            <h1 className="text-2xl font-light leading-snug tracking-tight text-white">
              Intelligence for{" "}
              <span className="text-amber-300">Elite Proposal Operations</span>
            </h1>
          </div>

          <div className="relative z-10 flex justify-center py-4">
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 -m-8 rounded-full bg-amber-500/10 blur-3xl" />
              <img
                src={atlasIrisBrand.url}
                alt="Atlas Remembers — IRIS Understands — Athena Command"
                className="relative w-full max-w-sm object-contain"
                style={{ filter: "drop-shadow(0 0 32px rgba(245,158,11,0.18))" }}
              />
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between gap-4">
            <img
              src={athenaSgBrand.url}
              alt="Athena Strategy Group"
              className="h-12 w-auto object-contain"
            />
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300/90">
                IRIS Active
              </span>
            </div>
          </div>
        </div>

        {/* Right: form */}
        <div className="flex flex-col justify-center bg-[#08080a] p-8 md:p-16">
          <div className="mb-10">
            <div className="mb-8 flex justify-center md:hidden">
              <img
                src={atlasIrisBrand.url}
                alt="Atlas — IRIS"
                className="w-full max-w-[260px] object-contain"
              />
            </div>
            <h2 className="mb-2 text-xl font-medium tracking-tight text-white">
              Personnel Sign-in
            </h2>
            <p className="text-sm text-white/50">
              Secure access via encrypted magic link.
            </p>
          </div>



          {sent ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center text-sm">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-emerald-400">Check your inbox</p>
              <p className="text-white">We sent a sign-in link to</p>
              <p className="mt-1 font-semibold text-amber-500">{email}</p>
              <p className="mt-3 text-xs text-white/50">
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
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="group space-y-2">
                <label
                  htmlFor="email"
                  className="ml-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-white/40 transition-colors group-focus-within:text-amber-400"
                >
                  Corporate Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@athenasg.com"
                  className="h-12 rounded-lg border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-white/20 focus-visible:border-amber-500/50 focus-visible:ring-1 focus-visible:ring-amber-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 py-3.5 font-semibold text-[#0a0a0b] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-500 hover:to-amber-400 active:scale-[0.98] disabled:opacity-60"
              >
                <span className="tracking-tight">
                  {loading ? "Sending link…" : "Send sign-in link"}
                </span>
                {!loading && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform group-hover:translate-x-1"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </form>
          )}

          <div className="mt-12 flex items-center justify-center gap-3">
            <div className="h-px w-10 bg-white/10" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/30">
              Authorized access only
            </span>
            <div className="h-px w-10 bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
