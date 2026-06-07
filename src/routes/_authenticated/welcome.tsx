import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { markOnboardingComplete } from "@/lib/atlas-invites.functions";
import atlasWordmark from "@/assets/atlas-wordmark-v2.png.asset.json";

export const Route = createFileRoute("/_authenticated/welcome")({
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();
  const completeFn = useServerFn(markOnboardingComplete);
  const [submitting, setSubmitting] = useState(false);

  async function onComplete() {
    setSubmitting(true);
    try {
      await completeFn();
      toast.success("Welcome to Atlas.");
      navigate({ to: "/flight-deck", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not complete onboarding");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div
      className="min-h-svh w-full flex items-center justify-center px-4 py-12 text-foreground"
      style={{
        background:
          "radial-gradient(ellipse at top, #0a1228 0%, #05070d 55%, #000 100%)",
      }}
    >
      <div className="w-full max-w-lg text-center">
        <img
          src={atlasWordmark.url}
          alt="ATLAS"
          className="mx-auto h-14 w-auto object-contain mb-4"
          style={{ filter: "brightness(1.15) drop-shadow(0 0 16px rgba(201,146,42,0.25))" }}
        />
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-100/60 mb-8">
          Intelligence · Coordination · Mission Execution
        </div>

        <div className="rounded-md border border-amber-200/20 bg-black/60 backdrop-blur p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-amber-50">
              Welcome to Athena Strategy Command
            </h1>
            <p className="mt-3 text-sm text-amber-100/70 leading-relaxed">
              Your account has been invited by an Atlas administrator. Once you
              complete onboarding, you'll be granted access to your assigned
              missions.
            </p>
          </div>

          <ol className="text-left space-y-3 text-sm text-amber-100/80">
            <li className="flex gap-3">
              <span className="text-amber-300 font-bold">1.</span>
              <span>Review and acknowledge the Atlas operating principles below.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-amber-300 font-bold">2.</span>
              <span>Complete your account activation by clicking the button.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-amber-300 font-bold">3.</span>
              <span>You'll be routed to your Flight Deck with your assigned work.</span>
            </li>
          </ol>

          <button
            onClick={onComplete}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center rounded-sm px-6 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-white shadow-[0_4px_24px_-8px_rgba(201,146,42,0.6)] transition hover:brightness-110 disabled:opacity-60"
            style={{ background: "#C9922A" }}
          >
            {submitting ? "Activating…" : "Complete Onboarding & Enter Atlas"}
          </button>

          <button
            onClick={onSignOut}
            className="text-[10px] uppercase tracking-[0.28em] text-amber-100/40 hover:text-amber-100/70"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
