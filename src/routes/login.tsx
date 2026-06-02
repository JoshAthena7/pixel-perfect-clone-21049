import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
      toast.success("Check your email for the sign-in link.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send magic link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-surface p-8">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-2xl text-[color:var(--athena-gold)]">⚡</span>
            <span className="text-2xl font-extrabold tracking-[0.22em] uppercase text-foreground">Atlas</span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">by Athena Strategy Group</p>
          <p className="mt-2 text-[12px] tracking-[0.08em] text-muted-foreground">Built by Athena. Powered by IRIS.</p>
        </div>


        {sent ? (
          <div className="rounded-[10px] border border-border bg-surface-hover p-5 text-center text-sm">
            <p className="text-foreground">Magic link sent to <strong>{email}</strong>.</p>
            <p className="mt-2 text-muted-foreground">Open the link from your inbox to sign in.</p>
            <button className="mt-4 text-primary hover:underline" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending link…" : "Send magic link"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">No passwords. We email you a one-time sign-in link.</p>
          </form>
        )}
      </div>
    </div>
  );
}
