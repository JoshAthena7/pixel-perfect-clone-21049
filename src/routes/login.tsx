import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import athenaLogo from "@/assets/athena-logo-dark.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Athena War Room" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function routeForUser(userId: string) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", userId)
        .maybeSingle();
      const dest = prof?.is_platform_admin ? "/admin" : "/select-engagement?auto=1";
      navigate({ to: dest, replace: true });
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) routeForUser(s.user.id);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) routeForUser(data.session.user.id);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in oklab, var(--gold) 14%, transparent), transparent 60%), radial-gradient(ellipse at bottom, color-mix(in oklab, var(--primary) 18%, transparent), transparent 65%)",
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--gold)]/25 bg-surface/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-7 text-center">
          <img
            src={athenaLogo}
            alt="Athena Strategy Group"
            className="mx-auto mb-5 h-24 w-auto object-contain drop-shadow-[0_4px_20px_rgba(201,168,76,0.25)]"
          />
          <div className="mx-auto mb-3 h-px w-16 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
          <h1 className="text-xl font-semibold tracking-[0.2em] uppercase text-foreground">
            War Room Command
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--gold)]/90">
            Athena Strategy Group · Proprietary
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Executive command for live engagements
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>New here? <button className="text-primary hover:underline" onClick={() => setMode("signup")}>Create account</button></>
          ) : (
            <>Have an account? <button className="text-primary hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
