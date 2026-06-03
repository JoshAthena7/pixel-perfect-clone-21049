import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Role = "writer" | "lead" | "admin" | "sme" | "reviewer";

type OnboardingContext = {
  userId: string;
  firstName: string;
  role: Role;
  missionId: string | null;
  missionName: string | null;
  state: string | null;
  focusAreas: string[];
};

const ROLE_PRIORITY: Role[] = ["admin", "lead", "reviewer", "sme", "writer"];

function pickRole(roles: string[]): Role {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return "writer";
}

function buildMessage(ctx: OnboardingContext): { firstLine: string; body: string; button: string; destination: string } {
  const first = ctx.firstName || "there";
  const state = ctx.state || "your state";
  void ctx.missionName;

  switch (ctx.role) {
    case "admin":
      return {
        firstLine: "The Olympians had Olympus. You have Admin.",
        body: `I'm IRIS.

In Greek mythology, Olympus wasn't just a mountain — it was the command center. The place where everything was decided before the mortals below even knew a battle was coming.

That's what you're building here.

Upload the RFP and I'll handle the intelligence configuration — state context, focus areas, search terms, question extraction. All of it. Automatic.

You handle the team. Set the gates. Assign the writers. Activate the mission.

I'll make sure everyone who enters this mission is as prepared as they can possibly be.

The best proposals aren't won at submission — they're won in the weeks before, when the right team has the right intelligence.

Let's build that.`,
        button: "Go to Admin →",
        destination: "/olympus",
      };
    case "lead":
      return {
        firstLine: `${first}. The mission needs you.`,
        body: `I'm IRIS.

Athena was the goddess of strategic warfare — not brute force, but wisdom applied at exactly the right moment. That's what wins proposals. That's what I'm here to support.

I'm watching every question, every signal, every piece of state intelligence, and every alignment conflict across this mission simultaneously. I don't sleep. I don't miss things. I don't get overwhelmed by volume.

You don't need to chase status updates. I'll surface what needs your attention. Your team will signal when they're stuck. Your mission dashboard has everything that requires a decision — waiting for you, in order of urgency, right now.

The ancient strategists knew something modern leaders forget: the commander who is informed wins before the battle begins.

You're informed.

Shall we?`,
        button: "Take me to the mission →",
        destination: ctx.missionId ? `/missions/${ctx.missionId}/overview` : "/home",
      };
    case "sme":
      return {
        firstLine: "Your expertise is why you're here.",
        body: `I'm IRIS.

In the old world, oracles were the most valuable people in any campaign — not because they fought, but because they knew things no one else knew.

That's you.

The writers on this mission are good. But there are questions where they need your specific knowledge to write a winning answer. I've flagged those questions for you.

You'll find them in the Cockpit — each one showing exactly what the writer needs from you and when they need it.

You don't need to learn the whole platform. Just go to your questions, give the writers what they need, and the mission moves forward.

The oracle always changes the outcome. Ready to be useful?`,
        button: "Show me my questions →",
        destination: ctx.missionId ? `/missions/${ctx.missionId}/questions` : "/home",
      };
    case "reviewer":
      return {
        firstLine: "Even Athena submitted her work for review.",
        body: `I'm IRIS.

The ancient Greeks had a concept — Krisis. The moment of judgment. The point where a decision is made that cannot be unmade.

That's what a Red Team is. That's what you're here for.

When a writer submits a question for your review, you'll be notified immediately. You'll see the question, the IRIS intelligence brief, the writer's collaboration notes, and the current score.

Your job is honest judgment. Not encouragement. Not consensus. The real answer to: is this good enough to win?

Athena didn't win wars with comfortable feedback.

Neither will we.`,
        button: "Show me what needs review →",
        destination: ctx.missionId ? `/missions/${ctx.missionId}/questions` : "/home",
      };
    case "writer":
    default:
      return {
        firstLine: `You must be ${first}.`,
        body: `I'm IRIS.

In the old stories, Iris was the messenger of the gods — the one who moved between worlds, carrying intelligence that changed the outcome of battles before they began.

That's still the job.

I've already read the RFP and configured your Atlas mission intelligence. I know what ${state} is prioritizing, what the evaluators have weighted in similar procurements, and where the competitive opening is for your sections. I'll have it waiting for you when you open your first question.

Your job is to write. My job is to make sure you never have to wonder what to say or whether your answer contradicts someone else's.

One thing I need from you. When reality changes — you learned something, you're stuck, or nothing changed — tell me. Hit Update Reality. Fifteen seconds. It keeps the whole mission calibrated.

Atlas doesn't lose proposals because of bad writers. We lose them because the right intelligence didn't reach the right person in time.

That won't happen here.

When you're ready to work, enter the Cockpit. Your questions, your intelligence, your controls — everything you need to fly this mission.

Ready?`,
        button: "Open my questions →",
        destination: ctx.missionId ? `/missions/${ctx.missionId}/questions` : "/home",
      };
  }
}

function useOnboardingContext() {
  return useQuery({
    queryKey: ["iris-onboarding-context"],
    staleTime: Infinity,
    queryFn: async (): Promise<OnboardingContext | { skip: true }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { skip: true };
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,email,has_onboarded")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.has_onboarded) return { skip: true };

      const rawName = profile?.display_name?.trim() || profile?.email?.split("@")[0] || user.email?.split("@")[0] || "";
      const firstName = rawName.split(/[\s.@]/)[0] || "";

      const { data: memberships } = await supabase
        .from("mission_members")
        .select("mission_id, role, joined_at, missions:mission_id(id,name,state,focus_areas,status,created_at)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true });

      const roles = (memberships ?? []).map((m) => m.role).filter(Boolean) as string[];
      const role = pickRole(roles);

      // Pick first active mission, or first mission, or none
      const sortedMissions = (memberships ?? [])
        .map((m) => m.missions as unknown as { id: string; name: string; state: string | null; focus_areas: string[] | null; status: string | null } | null)
        .filter((m): m is NonNullable<typeof m> => !!m);
      const active = sortedMissions.find((m) => (m.status || "").toLowerCase() === "active") || sortedMissions[0] || null;

      return {
        userId: user.id,
        firstName,
        role,
        missionId: active?.id ?? null,
        missionName: active?.name ?? null,
        state: active?.state ?? null,
        focusAreas: active?.focus_areas ?? [],
      };
    },
  });
}

function StarField() {
  // Generate static stars once
  const stars = useMemo(() => {
    const arr: Array<{ top: string; left: string; size: number; opacity: number }> = [];
    for (let i = 0; i < 80; i++) {
      arr.push({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() < 0.85 ? 1 : 2,
        opacity: 0.3 + Math.random() * 0.7,
      });
    }
    return arr;
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: 0.06 }}>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            boxShadow: s.size > 1 ? "0 0 4px rgba(255,255,255,0.8)" : undefined,
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 30%, rgba(94,234,212,0.08), transparent 40%), radial-gradient(circle at 80% 70%, rgba(94,234,212,0.06), transparent 45%)",
        }}
      />
    </div>
  );
}

function Typewriter({ text, speed = 35, onDone }: { text: string; speed?: number; onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) {
      onDone();
      return;
    }
    const t = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed, onDone]);
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      <span
        className="inline-block w-[2px] ml-[1px] align-middle"
        style={{
          height: "1em",
          background: "#5eead4",
          opacity: done ? 0 : 1,
          animation: done ? undefined : "iris-cursor 1s steps(2) infinite",
        }}
      />
    </span>
  );
}

function OnboardingModal({ ctx, onClose }: { ctx: OnboardingContext; onClose: (dest?: string) => void }) {
  const { firstLine, body, button, destination } = useMemo(() => buildMessage(ctx), [ctx]);
  const [firstDone, setFirstDone] = useState(false);
  const [bodyVisible, setBodyVisible] = useState(false);

  useEffect(() => {
    if (firstDone) {
      const t = setTimeout(() => setBodyVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [firstDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto"
      style={{ background: "#050810" }}
    >
      <style>{`
        @keyframes iris-cursor { 50% { opacity: 0; } }
        @keyframes iris-pulse {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(94,234,212,0.6); }
          50% { transform: scale(1.15); opacity: 0.85; box-shadow: 0 0 0 12px rgba(94,234,212,0); }
        }
        @keyframes iris-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <StarField />
      <div className="relative flex w-full max-w-[480px] flex-col items-center px-6 py-16">
        <div
          className="rounded-full"
          style={{
            width: 16,
            height: 16,
            background: "#5eead4",
            animation: "iris-pulse 2s ease-in-out infinite",
          }}
        />
        <div className="mt-4 text-[10px] uppercase tracking-[0.2em]" style={{ color: "#5eead4" }}>
          ● IRIS
        </div>

        <div
          className="mt-10 w-full text-center text-foreground"
          style={{ fontSize: 16, lineHeight: 1.9 }}
        >
          <p className="font-medium" style={{ color: "var(--text-primary, #fff)" }}>
            <Typewriter text={firstLine} onDone={() => setFirstDone(true)} />
          </p>
          {firstDone && (
            <div
              className="mt-6 space-y-4 text-left"
              style={{
                animation: bodyVisible ? "iris-fade-up 0.8s ease-out forwards" : undefined,
                opacity: bodyVisible ? undefined : 0,
                color: "var(--text-primary, #e5e7eb)",
              }}
            >
              {body.split("\n\n").map((para, i) => (
                <p key={i} style={{ lineHeight: 1.9 }}>{para}</p>
              ))}
            </div>
          )}
        </div>

        {bodyVisible && (
          <div className="mt-10 w-full" style={{ animation: "iris-fade-up 0.5s ease-out 0.6s both" }}>
            <button
              onClick={() => onClose(destination)}
              className="w-full rounded-md text-sm font-medium transition-colors"
              style={{
                height: 52,
                background: "#5eead4",
                color: "#050810",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#7ff0dc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#5eead4")}
            >
              {button}
            </button>
            <button
              onClick={() => onClose()}
              className="mt-3 w-full text-center"
              style={{ fontSize: 11, color: "var(--text-muted, #6b7280)" }}
            >
              Skip introduction
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function IrisOnboardingMount() {
  const { data, isLoading } = useOnboardingContext();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed) return null;
  if (!data || "skip" in data) return null;

  const handleClose = async (dest?: string) => {
    setDismissed(true);
    try {
      await supabase
        .from("profiles")
        .update({ has_onboarded: true, onboarded_at: new Date().toISOString() })
        .eq("id", data.userId);
    } catch {
      // best-effort
    }
    if (dest) navigate({ to: dest });
  };

  return <OnboardingModal ctx={data} onClose={handleClose} />;
}
