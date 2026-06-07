import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Map as MapIcon,
  FileText,
  Plane,
  Database,
  Archive,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { markOnboardingComplete } from "@/lib/atlas-invites.functions";
import atlasWordmark from "@/assets/atlas-wordmark-v2.png.asset.json";

export const Route = createFileRoute("/_authenticated/welcome")({
  component: WelcomePage,
});

type FirstMission = {
  id: string;
  name: string;
  role: string;
  client: string | null;
};

function WelcomePage() {
  const navigate = useNavigate();
  const completeFn = useServerFn(markOnboardingComplete);
  const [submitting, setSubmitting] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["welcome-me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("id", user.id)
        .maybeSingle();
      return { id: user.id, ...(profile ?? {}) };
    },
  });

  const { data: firstMission } = useQuery<FirstMission | null>({
    queryKey: ["welcome-first-mission", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("mission_members")
        .select("mission_id,role,joined_at")
        .eq("user_id", me!.id)
        .order("joined_at", { ascending: true })
        .limit(1);
      const row = members?.[0];
      if (!row) return null;
      const { data: m } = await supabase
        .from("missions")
        .select("id,name,client")
        .eq("id", row.mission_id)
        .maybeSingle();
      if (!m) return null;
      return { id: m.id, name: m.name, role: row.role, client: (m as any).client ?? null };
    },
  });

  const firstName =
    (me?.display_name as string | undefined)?.trim().split(/\s+/)[0] ||
    (me?.email as string | undefined)?.split("@")[0] ||
    "there";
  const roleLabel = formatRole(firstMission?.role);

  async function onComplete(target: "journey-map" | "missions") {
    setSubmitting(true);
    try {
      await completeFn();
      if (target === "journey-map" && firstMission) {
        navigate({
          to: "/missions/$missionId/journey-map",
          params: { missionId: firstMission.id },
          replace: true,
        });
      } else {
        navigate({ to: "/missions", replace: true });
      }
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

  const areas = [
    {
      key: "journey",
      icon: MapIcon,
      label: "Journey Map",
      blurb: "Where you are in the mission and what your stage demands of you next.",
    },
    {
      key: "brief",
      icon: FileText,
      label: "Mission Brief",
      blurb: "Everything IRIS knows about this opportunity — the state, the agency, the win themes, the team.",
    },
    {
      key: "flight",
      icon: Plane,
      label: "Flight Deck",
      blurb: "Your personal work — the questions assigned to you and what to do next on each one.",
    },
    {
      key: "intel",
      icon: Database,
      label: "Mission Intel",
      blurb: "Source documents, citations, and the intelligence graph IRIS built from them.",
    },
    {
      key: "vault",
      icon: Archive,
      label: "Mission Vault",
      blurb: "Approved deliverables, decision logs, and historical artifacts you can reuse.",
    },
  ] as const;

  return (
    <div
      className="min-h-svh w-full flex items-center justify-center px-4 py-12 text-foreground"
      style={{
        background:
          "radial-gradient(ellipse at top, #0a1228 0%, #05070d 55%, #000 100%)",
      }}
    >
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8 px-2">
          <img
            src={atlasWordmark.url}
            alt="ATLAS"
            draggable={false}
            className="mx-auto h-12 w-auto object-contain mb-3 select-none"
            style={{ filter: "brightness(1.12) drop-shadow(0 0 6px rgba(201,168,76,0.25))" }}
          />
          <div className="text-[10px] uppercase tracking-[0.32em] text-amber-100/55">
            Intelligence · Coordination · Mission Execution
          </div>
        </div>

        <div className="rounded-md border border-amber-200/20 bg-black/60 backdrop-blur p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] space-y-8">
          <header>
            <h1 className="text-2xl font-semibold text-amber-50">
              Welcome to Atlas, {firstName}.
            </h1>
            <p className="mt-3 text-sm text-amber-100/75 leading-relaxed">
              Atlas is your mission command platform. IRIS — our intelligence
              engine — has already read the source material and built a brief.
              Your job is to take it from here.
            </p>
          </header>

          {firstMission ? (
            <section className="rounded-md border border-amber-300/15 bg-amber-300/5 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/80">
                Your first mission
              </div>
              <div className="mt-2 text-lg font-semibold text-amber-50">
                {firstMission.name}
              </div>
              {firstMission.client && (
                <div className="text-[12px] text-amber-100/60 mt-0.5">
                  {firstMission.client}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-amber-100/80">
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-300/30 bg-amber-300/10 px-2 py-1 uppercase tracking-[0.16em]">
                  <Sparkles className="h-3 w-3" />
                  IRIS has already briefed this mission
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-200/20 bg-amber-200/[0.06] px-2 py-1 uppercase tracking-[0.16em]">
                  Your role · {roleLabel}
                </span>
              </div>
            </section>
          ) : (
            <section className="rounded-md border border-amber-200/15 bg-amber-200/[0.04] p-5 text-[13px] text-amber-100/70">
              You haven't been assigned to a mission yet. Once an admin adds you
              to one, it'll show up on your home screen.
            </section>
          )}

          <section>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/80 mb-3">
              Where your work will appear
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {areas.map((a) => {
                const Icon = a.icon;
                return (
                  <li
                    key={a.key}
                    className="rounded-md border border-amber-200/10 bg-black/40 p-3"
                  >
                    <div className="flex items-center gap-2 text-amber-50 text-sm font-semibold">
                      <Icon className="h-3.5 w-3.5 text-amber-300" />
                      {a.label}
                    </div>
                    <div className="mt-1 text-[12px] text-amber-100/65 leading-snug">
                      {a.blurb}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-3">
            <button
              onClick={() => onComplete(firstMission ? "journey-map" : "missions")}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-white shadow-[0_4px_24px_-8px_rgba(201,146,42,0.6)] transition hover:brightness-110 disabled:opacity-60"
              style={{ background: "#C9922A" }}
            >
              {submitting
                ? "Entering Atlas…"
                : firstMission
                  ? "Start with the Journey Map"
                  : "Enter Atlas"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {firstMission && (
              <div className="text-center text-[11px] text-amber-100/50">
                The Journey Map shows you exactly where this mission is and what
                your stage requires from you.
              </div>
            )}

            <div className="text-center">
              <button
                onClick={onSignOut}
                className="text-[10px] uppercase tracking-[0.28em] text-amber-100/40 hover:text-amber-100/70"
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatRole(role: string | undefined): string {
  if (!role) return "Team Member";
  const map: Record<string, string> = {
    admin: "Mission Admin",
    lead: "Mission Lead",
    engagement_lead: "Engagement Lead",
    project_manager: "Project Manager",
    lead_writer: "Lead Writer",
    lead_graphics: "Lead Graphics",
    writer: "Writer",
    sme: "Subject-Matter Expert",
    viewer: "Viewer",
  };
  return map[role] ?? role.replace(/_/g, " ");
}
