import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  validateInviteToken,
  claimInviteToken,
} from "@/lib/atlas-invites.functions";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/onboarding")({
  validateSearch: searchSchema,
  component: OnboardingPage,
});

type ValidationState =
  | { status: "loading" }
  | {
      status: "valid";
      email: string;
      displayName: string | null;
      missionName: string | null;
      role: string | null;
    }
  | { status: "invalid"; reason: "invalid" | "expired" | "used" | "missing" };

function OnboardingPage() {
  const { token } = useSearch({ from: "/onboarding" });
  const navigate = useNavigate();
  const validateFn = useServerFn(validateInviteToken);
  const claimFn = useServerFn(claimInviteToken);

  const [state, setState] = useState<ValidationState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setState({ status: "invalid", reason: "missing" });
      return;
    }
    (async () => {
      try {
        const res = (await validateFn({ data: { token } })) as any;
        if (!mounted) return;
        if (res.valid) {
          setState({
            status: "valid",
            email: res.email,
            displayName: res.displayName,
            missionName: res.missionName,
            role: res.role,
          });
        } else {
          setState({ status: "invalid", reason: res.reason });
        }
      } catch {
        if (mounted) setState({ status: "invalid", reason: "invalid" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, validateFn]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== "valid" || !token) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPwd) {
      toast.error("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await claimFn({ data: { token, password } });
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: state.email,
        password,
      });
      if (signInErr) throw signInErr;
      toast.success("Welcome to Atlas.");
      navigate({ to: "/welcome", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-svh w-full flex items-center justify-center px-4 py-12 text-foreground"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(201,146,42,0.10), transparent 55%), linear-gradient(180deg, #0B0F14 0%, #050708 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div
            className="text-[10px] font-bold tracking-[0.42em]"
            style={{ color: "#C9922A" }}
          >
            ATHENA STRATEGY COMMAND
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Mission Onboarding</h1>
        </div>

        {state.status === "loading" && (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Verifying your invitation…</p>
          </div>
        )}

        {state.status === "invalid" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
            <h2 className="mt-3 text-base font-semibold">
              {state.reason === "expired"
                ? "Invitation expired"
                : state.reason === "used"
                  ? "Invitation already used"
                  : "Invalid invitation link"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.reason === "expired"
                ? "This invitation link has expired (links are valid for 72 hours)."
                : state.reason === "used"
                  ? "This invitation has already been redeemed."
                  : "We couldn't verify this invitation link."}
              <br />
              Please contact your Engagement Lead to request a new invitation.
            </p>
            <Link
              to="/login"
              className="mt-5 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-surface-hover"
            >
              Go to login
            </Link>
          </div>
        )}

        {state.status === "valid" && (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-lg border border-border bg-surface p-6"
          >
            <div className="rounded-md border border-border/60 bg-background/40 p-3 text-[12px]">
              <div className="text-muted-foreground">Account email</div>
              <div className="text-foreground font-medium">{state.email}</div>
              {state.missionName && (
                <>
                  <div className="mt-2 text-muted-foreground">Mission</div>
                  <div className="text-foreground">{state.missionName}</div>
                </>
              )}
              {state.role && (
                <>
                  <div className="mt-2 text-muted-foreground">Role</div>
                  <div className="text-foreground">{state.role}</div>
                </>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Create password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Confirm password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white disabled:opacity-60"
              style={{ background: "#C9922A" }}
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Create account & continue
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
