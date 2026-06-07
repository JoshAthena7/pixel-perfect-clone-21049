import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import athenaMark from "@/assets/athena-mark-dark.png.asset.json";
import atlasWordmark from "@/assets/atlas-wordmark-dark.png.asset.json";
import athenaSgLockup from "@/assets/athena-sg-lockup-dark.png.asset.json";



export function AtlasLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function routeAfterAuth(_userId: string) {
    navigate({ to: "/missions", replace: true });
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
      if (data.user) {
        // Stamp last login (RLS: profiles_self_update allows this).
        supabase
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", data.user.id)
          .then(() => undefined);
        await routeAfterAuth(data.user.id);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-svh w-full flex items-center justify-center px-4 py-12 text-foreground"
      style={{
        background:
          "radial-gradient(ellipse at top, #0a1228 0%, #05070d 55%, #000 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8 px-2">
          <img
            src={athenaSgLockup.url}
            alt="Athena Strategy Group"
            className="mx-auto h-10 w-auto object-contain mb-8 opacity-95 select-none"
            draggable={false}
            style={{ filter: "brightness(1.05)" }}
          />
          <div
            className="flex items-center justify-center gap-4 mb-3 select-none"
            style={{ filter: "drop-shadow(0 0 10px rgba(201,168,76,0.22))" }}
          >
            <img
              src={athenaMark.url}
              alt="Athena"
              className="h-16 w-16 object-contain"
              draggable={false}
            />
            <div
              aria-hidden
              className="h-10 w-px"
              style={{ background: "linear-gradient(180deg, transparent, rgba(201,168,76,0.55), transparent)" }}
            />
            <img
              src={atlasWordmark.url}
              alt="ATLAS"
              className="h-16 w-auto object-contain"
              draggable={false}
              style={{ filter: "brightness(1.08)" }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-[0.32em] text-amber-100/55">
            Intelligence · Alignment · Execution
          </div>
        </div>

        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="rounded-md border border-amber-200/20 bg-black/60 backdrop-blur p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] space-y-5"
        >
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/80">
            Welcome Back
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm border border-amber-200/25 bg-black/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-amber-200/25 bg-black/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-sm px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.3em] text-white shadow-[0_4px_24px_-8px_rgba(201,146,42,0.6)] transition hover:brightness-110 disabled:opacity-60"
            style={{ background: "#C9922A" }}
          >
            {loading ? "Entering…" : "Enter Atlas"}
          </button>
        </form>

        <div className="text-center mt-6 text-[10px] uppercase tracking-[0.28em] text-amber-100/40">
          The operating environment for high stakes work
        </div>
      </div>
    </div>
  );
}
