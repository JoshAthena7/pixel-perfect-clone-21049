import { Zap, Target, Phone, Heart, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared Assists bar — used on the main Cockpit page AND the writer's studio
 * (question page) so the controls feel identical in both places.
 *
 * Pass the SOS trigger as a slot so each page can wire its own modal/button.
 */
export function AssistsBar({
  onUpdateReality,
  onScoreMe,
  onPhone,
  onPulse,
  onThread,
  sosSlot,
  primaryLabel = "Update Reality",
  disabled = false,
}: {
  onUpdateReality: () => void;
  onScoreMe: () => void;
  onPhone: () => void;
  onPulse: () => void;
  onThread: () => void;
  sosSlot: ReactNode;
  primaryLabel?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className="mx-auto flex max-w-[1400px] items-center gap-2"
        style={{ background: "#0a1628", padding: "12px 24px" }}
      >
        <span
          className="mr-1 shrink-0 text-[9px] font-semibold uppercase"
          style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.18)" }}
        >
          Assists
        </span>
        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Read-only — actions disabled
        </span>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-wrap items-center"
      style={{ background: "#0a1628", padding: "12px 24px", gap: 7 }}
    >
      <span
        className="mr-1 shrink-0 text-[9px] font-semibold uppercase"
        style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.18)" }}
      >
        Assists
      </span>

      <button
        onClick={onUpdateReality}
        className="inline-flex items-center justify-center gap-2 font-semibold transition"
        style={{
          height: 44, padding: "0 18px",
          background: "#3b7fff", border: "none", borderRadius: 9,
          color: "#fff", fontSize: 13, fontWeight: 700,
        }}
      >
        <Zap className="h-4 w-4" /> {primaryLabel}
      </button>

      <PillButton onClick={onScoreMe} icon={<Target className="h-4 w-4" />}
        bg="rgba(16,185,129,0.10)" border="rgba(16,185,129,0.32)" color="#10b981">
        Score Me
      </PillButton>

      <PillButton onClick={onPhone} icon={<Phone className="h-4 w-4" />}
        bg="rgba(124,58,237,0.10)" border="rgba(124,58,237,0.30)" color="#a78bfa">
        Phone a Friend
      </PillButton>

      <PillButton onClick={onPulse} icon={<Heart className="h-4 w-4" />}
        bg="rgba(236,72,153,0.10)" border="rgba(236,72,153,0.30)" color="#f472b6">
        Daily Pulse
      </PillButton>

      <PillButton onClick={onThread} icon={<MessageSquare className="h-4 w-4" />}
        bg="rgba(20,184,166,0.12)" border="rgba(20,184,166,0.35)" color="#14b8a6">
        Thread
      </PillButton>

      {sosSlot}
    </div>
  );
}

function PillButton({
  onClick, icon, children, bg, border, color,
}: {
  onClick: () => void; icon: ReactNode; children: ReactNode;
  bg: string; border: string; color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 font-semibold transition"
      style={{
        height: 44, padding: "0 16px",
        background: bg, border: `1.5px solid ${border}`,
        borderRadius: 9, color, fontSize: 13, fontWeight: 600,
      }}
    >
      {icon} {children}
    </button>
  );
}
