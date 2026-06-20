import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupWelcomeInvite, type WelcomeInvitePayload } from "@/lib/welcome-invite.functions";

const IRIS_TEASER =
  "Hello. I am IRIS. Most proposal teams write to an imaginary evaluator. Someone who reads every word carefully and chooses the best proposal. That evaluator does not exist. I know how the real ones think. What they are afraid of. What they need to see to feel safe enough to award this contract. Log in. I will show you everything.";

export const Route = createFileRoute("/welcome/$token")({
  component: WelcomePage,
});

function WelcomePage() {
  const { token } = Route.useParams();
  const lookup = useServerFn(lookupWelcomeInvite);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["welcome-invite", token],
    queryFn: () => lookup({ data: { token } }),
    retry: false,
  });

  async function handleEnter() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      navigate({ to: "/login", search: { redirect: "/welcome" } as any });
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("has_onboarded")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profile?.has_onboarded) navigate({ to: "/home" });
    else navigate({ to: "/welcome" });
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center text-[14px] text-white/40">
          Loading…
        </div>
      </Shell>
    );
  }

  if (error || !data?.valid) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
          <p className="max-w-md text-base text-white/70">
            This invite link is no longer valid. Contact your Athena Engagement Lead for a new one.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ValidWelcome data={data} onEnter={handleEnter} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#07101e", color: "white" }}>
      <header className="flex items-center justify-between px-8 py-6">
        <div
          style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "0.18em", fontSize: 18, fontWeight: 600 }}
        >
          ATLAS
        </div>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[14px] font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--athena-gold, #C49A22)", color: "#07101e" }}
        >
          Log in <ArrowRight size={14} />
        </Link>
      </header>
      {children}
    </div>
  );
}

function ValidWelcome({
  data,
  onEnter,
}: {
  data: WelcomeInvitePayload;
  onEnter: () => void;
}) {
  const role = data.role || "writer";
  const isAdminOrLead = role === "admin" || role === "engagement_lead";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-20 pt-8">
      {/* IRIS bubble */}
      <div
        className="mx-auto rounded-2xl border p-7 text-[14px] leading-relaxed"
        style={{
          background: "rgba(120,80,200,0.08)",
          borderColor: "rgba(160,120,240,0.25)",
          color: "rgba(230,225,250,0.92)",
        }}
      >
        <div
          className="mb-3 text-[12px] tracking-[0.18em]"
          style={{ color: "rgba(180,150,240,0.7)" }}
        >
          IRIS
        </div>
        <p className="whitespace-pre-line italic">{IRIS_TEASER}</p>
      </div>

      {/* Role-specific content */}
      <div className="mt-8">
        {!data.mission ? (
          <NoMissionCards />
        ) : isAdminOrLead ? (
          <AdminMissionPanel data={data} />
        ) : (
          <WriterMissionPanel data={data} />
        )}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onEnter}
        className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-md py-4 text-base font-medium transition-opacity hover:opacity-90"
        style={{ background: "var(--athena-gold, #C49A22)", color: "#07101e" }}
      >
        Enter ATLAS <ArrowRight size={18} />
      </button>
    </main>
  );
}

function MissionHeader({ data }: { data: WelcomeInvitePayload }) {
  const m = data.mission!;
  return (
    <div className="mb-4">
      <div className="text-[12px] tracking-[0.16em] text-white/40">Mission</div>
      <div className="mt-1 text-lg font-medium text-white">{m.name}</div>
      {m.clientName && (
        <div className="text-[14px] text-white/60">{m.clientName}</div>
      )}
      {m.daysToSubmission !== null && (
        <div className="mt-1 text-[14px]" style={{ color: "var(--athena-gold, #C49A22)" }}>
          {m.daysToSubmission} days to submission
        </div>
      )}
    </div>
  );
}

function AdminMissionPanel({ data }: { data: WelcomeInvitePayload }) {
  const m = data.mission!;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <MissionHeader data={data} />
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Stat label="Questions at risk" value={String(m.atRiskCount)} />
        <Stat label="Team members" value={String(m.teamCount)} />
      </div>
    </div>
  );
}

function WriterMissionPanel({ data }: { data: WelcomeInvitePayload }) {
  const a = data.assignment;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <MissionHeader data={data} />
      {a ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[12px] tracking-[0.14em] text-white/40">
            Your most urgent assignment
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[14px] text-white">
              {a.questionNumber ? `Question ${a.questionNumber}` : "Assignment"}
              {a.sectionName && <span className="text-white/50"> · {a.sectionName}</span>}
            </div>
            {a.health && <HealthChip health={a.health} />}
          </div>
          {a.dueDate && (
            <div className="mt-1 text-[12px] text-white/50">
              Due {new Date(a.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-white/55">
          Your assignments will appear once you log in.
        </p>
      )}
    </div>
  );
}

function NoMissionCards() {
  const cards = [
    { title: "Mission Brief", body: "The single source of truth for what this mission is about." },
    { title: "Flight Deck", body: "Where you answer questions, one at a time, with IRIS at your side." },
    { title: "Score Draft", body: "Paste a draft and get an evaluator-style score in seconds." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[14px] font-medium text-white">{c.title}</div>
          <div className="mt-1 text-[12px] leading-relaxed text-white/55">{c.body}</div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[12px] tracking-[0.14em] text-white/40">{label}</div>
      <div className="mt-1 text-2xl font-medium text-white">{value}</div>
    </div>
  );
}

function HealthChip({ health }: { health: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    on_track: { bg: "rgba(34,160,90,0.16)", fg: "#5BCB8A", label: "On track" },
    at_risk: { bg: "rgba(220,80,80,0.16)", fg: "#FF8888", label: "At risk" },
    needs_attention: { bg: "rgba(220,160,40,0.16)", fg: "#E9B949", label: "Needs attention" },
  };
  const s = map[health] || { bg: "rgba(255,255,255,0.08)", fg: "#cfd6e4", label: health };
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
