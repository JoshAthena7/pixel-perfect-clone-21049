import { useEffect, useState } from "react";
import { Users, Radar as RadarIcon, Zap, Clipboard, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#c9a84c";

/* ============================================================
   Shared rotating-radar SVG (used in orientation + radar empty)
   ============================================================ */
export function RadarSvg({ size = 64 }: { size?: number }) {
  const id = `radar-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(196,154,43,0)" />
          <stop offset="100%" stopColor="rgba(196,154,43,0.6)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(196,154,43,0.15)" strokeWidth="1" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(196,154,43,0.1)" strokeWidth="1" />
      <circle cx="50" cy="50" r="14" fill="none" stroke="rgba(196,154,43,0.1)" strokeWidth="1" />
      <line x1="50" y1="50" x2="4" y2="50" stroke="rgba(196,154,43,0.08)" strokeWidth="1" />
      <line x1="50" y1="50" x2="50" y2="4" stroke="rgba(196,154,43,0.08)" strokeWidth="1" />
      <g style={{ transformOrigin: "50px 50px", animation: "atc-radar-sweep 4s linear infinite" }}>
        <path d="M50 50 L50 4 A46 46 0 0 1 95 48 Z" fill={`url(#${id})`} opacity="0.5" />
        <line x1="50" y1="50" x2="50" y2="4" stroke="rgba(196,154,43,0.55)" strokeWidth="1.5" />
      </g>
      <circle cx="50" cy="50" r="2" fill={GOLD} />
      <style>{`@keyframes atc-radar-sweep { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

/* ============================================================
   First-time orientation overlay
   ============================================================ */
export function AtcOrientationOverlay({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!alive || !u.user) return;
      setUserId(u.user.id);
      const { data: existing } = await supabase
        .from("mission_assist_events")
        .select("id")
        .eq("mission_id", missionId)
        .eq("user_id", u.user.id)
        .eq("event_type", "atc_onboarding_dismissed")
        .limit(1)
        .maybeSingle();
      if (alive && !existing) setOpen(true);
    })();
    return () => { alive = false; };
  }, [missionId]);

  const dismiss = () => {
    setOpen(false);
    if (!userId) return;
    void supabase.from("mission_assist_events").insert({
      mission_id: missionId,
      user_id: userId,
      event_type: "atc_onboarding_dismissed",
      metadata: { dismissed_at: new Date().toISOString() },
    });
  };

  if (!open) return null;

  const cards = [
    { Icon: Users,     title: "Team Pulse",    body: "Every writer, SME, and reviewer. Their status, their questions, how long since they moved. Nudge anyone in one click." },
    { Icon: RadarIcon, title: "Mission Radar", body: "Every action the team takes appears here in real time. Check-ins, notes, scores, SOS flags. The mission heartbeat." },
    { Icon: Zap,       title: "IRIS Alerts",   body: "IRIS watches the mission and flags what needs your attention. Not a feed — a triage list. Act on it and move on." },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(5,13,24,0.96)" }}
      role="dialog"
      aria-label="ATC orientation"
    >
      <div className="w-full" style={{ maxWidth: 560 }}>
        <div className="flex flex-col items-center text-center">
          <RadarSvg size={120} />
          <h2 className="mt-4 text-white" style={{ fontSize: 22, fontWeight: 300, letterSpacing: "0.1em" }}>
            Mission Control
          </h2>
          <p className="mt-3 italic text-[14px] leading-relaxed" style={{ color: GOLD }}>
            You're in ATC — the only place on the mission where you can see everything at once.
            Three things to know before you start watching.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="rounded-md p-4"
              style={{ background: "rgba(255,255,255,0.04)", width: "100%" }}
            >
              <Icon className="w-4 h-4 mb-2" style={{ color: GOLD }} />
              <div className="text-[12px] font-medium text-white mb-1">{title}</div>
              <div className="text-[12px] text-white/55 leading-snug">{body}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={dismiss}
            className="px-5 py-2 rounded text-[12px] font-medium"
            style={{ background: GOLD, color: "#1a1408" }}
          >
            Start Watching
          </button>
          <button onClick={dismiss} className="text-[11px] text-white/40 hover:text-white/70 underline">
            Don't show this again
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Closed-mission banner
   ============================================================ */
export function ClosedMissionBanner() {
  return (
    <div
      className="shrink-0 text-center text-[12px] py-1.5"
      style={{
        background: "rgba(196,154,43,0.12)",
        borderBottom: "1px solid rgba(196,154,43,0.3)",
        color: GOLD,
      }}
    >
      📋 This mission is closed. ATC is in read-only mode — no nudges or actions can be taken.
    </div>
  );
}

/* ============================================================
   Skeleton primitives — match real row heights, no layout shift
   ============================================================ */
function Bar({ w = "100%", h = 8, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return (
    <div
      className={`rounded bg-white/[0.08] ${className}`}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        animation: "atc-skeleton-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

export function SkeletonStyles() {
  return (
    <style>{`@keyframes atc-skeleton-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }`}</style>
  );
}

export function TeamPulseSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div>
      <SkeletonStyles />
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.04]"
          style={{ minHeight: 64, borderLeft: "4px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-8 h-8 rounded-full bg-white/[0.08] shrink-0"
            style={{ animation: "atc-skeleton-pulse 1.5s ease-in-out infinite" }}
          />
          <div className="flex-1 space-y-1.5">
            <Bar w="60%" />
            <Bar w="80%" h={6} />
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Bar w={48} h={14} />
            <Bar w={48} h={14} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RadarSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      <SkeletonStyles />
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.04]"
          style={{ minHeight: 44 }}
        >
          <Bar w={12} h={12} className="rounded-full" />
          <div className="flex-1"><Bar w={`${50 + (i * 7) % 35}%`} /></div>
          <Bar w={36} h={6} />
        </div>
      ))}
    </div>
  );
}

export function AlertsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      <SkeletonStyles />
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="rounded p-3"
          style={{ background: "rgba(255,255,255,0.02)", borderLeft: "3px solid rgba(255,255,255,0.08)", minHeight: 56 }}
        >
          <div className="space-y-1.5">
            <Bar w="85%" />
            <Bar w="50%" h={6} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
   Empty state cards
   ============================================================ */
export function TeamPulseEmpty() {
  return (
    <div className="px-4 py-10 text-center flex flex-col items-center gap-2">
      <Users className="w-8 h-8 text-white/30" />
      <div className="text-[14px] text-white mt-1">No team members yet.</div>
      <div className="text-[12px] text-white/45 max-w-[240px] leading-relaxed">
        Add writers, SMEs, and reviewers in Mission Settings. They'll appear here the moment they're assigned.
      </div>
    </div>
  );
}

export function TeamPulseNoAssignmentsBanner() {
  return (
    <div
      className="mx-3 mt-2 mb-1 rounded px-3 py-2 text-[12px] text-white/55"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      📋 No questions assigned yet — writers are standing by.
    </div>
  );
}

export function RadarClearEmpty() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      <RadarSvg size={64} />
      <div className="text-[14px] text-white mt-1">Radar is clear.</div>
      <div className="text-[12px] text-white/45 max-w-[280px] leading-relaxed">
        When writers check in, post notes, run Score Me, or raise SOS — it appears here instantly.
        The mission hasn't started moving yet.
      </div>
    </div>
  );
}

export function RadarFilterEmpty({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="px-4 py-6 text-center text-[12px] text-white/45">
      No {label} activity yet. Switch to All to see everything.{" "}
      <button onClick={onClear} className="text-amber-300 hover:underline">Clear filter</button>
    </div>
  );
}

export function IrisOrientingCard() {
  return (
    <div
      className="rounded p-3 flex items-start gap-2"
      style={{ background: "rgba(255,255,255,0.03)", borderLeft: "3px solid rgba(255,255,255,0.1)" }}
    >
      <Clock className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[12px] text-white">IRIS is still orienting.</div>
        <div className="text-[11px] text-white/45 mt-1 leading-relaxed">
          Once the mission has writers, questions, and some activity, IRIS will start flagging what needs your attention. Check back after the first team Check-In.
        </div>
      </div>
    </div>
  );
}

export function IrisHealthyCard({ generatedAt }: { generatedAt?: string | null }) {
  const rel = (() => {
    if (!generatedAt) return "just now";
    const h = (Date.now() - new Date(generatedAt).getTime()) / 3600_000;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
    if (h < 24) return `${Math.round(h)}h ago`;
    return `${Math.round(h / 24)}d ago`;
  })();
  return (
    <div
      className="rounded p-3 relative"
      style={{ background: "rgba(34,197,94,0.05)", borderLeft: "3px solid #4CAF50" }}
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 pr-12">
          <div className="text-[12px] text-white">No flags right now.</div>
          <div className="text-[11px] text-white/45 mt-1 leading-relaxed">
            IRIS scanned the mission {rel}. Everything looks healthy. Auto-refreshes every 15 minutes.
          </div>
        </div>
      </div>
      {generatedAt && (
        <div
          className="absolute bottom-1.5 right-2 text-white/35"
          style={{ fontSize: 9, fontFamily: "'Courier New', monospace" }}
        >
          {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

export function WriterDrawerNoQuestions({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 gap-2">
      <Clipboard className="w-7 h-7 text-white/30" />
      <div className="text-[12px] text-white">No questions assigned.</div>
      <div className="text-[11px] text-white/45 leading-relaxed max-w-[260px]">
        Assign questions to {firstName} in the Flight Deck or Mission Settings.
      </div>
    </div>
  );
}

export function StickyNotesEmptyCard() {
  return (
    <div
      className="p-4 shadow-md"
      style={{
        background: "rgba(255,241,118,0.18)",
        color: "rgba(0,0,0,0.55)",
        transform: "rotate(-1deg)",
        minHeight: 90,
        fontFamily: "Georgia, serif",
      }}
    >
      <div className="text-[12px] italic leading-snug">
        No notes on this question yet. Writers and SMEs can pin notes from the Flight Deck.
      </div>
    </div>
  );
}
