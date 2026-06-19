import { useState } from "react";
import { ClipboardCheck, Target, StickyNote, Activity } from "lucide-react";
import { MissionPulsePanel } from "./MissionPulsePanel";
import { ScoreMeDialog } from "./ScoreMeDialog";
import { CheckInDialog } from "./CheckInDialog";
import { StickyNotesPanel } from "./StickyNotesPanel";

type Props = {
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  dueDate: string | null;
  confidence: string | null;
  progressId?: string | null;
  onHealthChanged?: () => void;
  // Back-compat with FlightDeckLayout (Thread is gone; props ignored).
  threadOpen?: boolean;
  onThreadOpenChange?: (v: boolean) => void;
  pulseOpen?: boolean;
  onPulseOpenChange?: (v: boolean) => void;
  pulsePrefill?: { signalType: string; body: string } | null;
  onPulsePrefillConsumed?: () => void;
};

type ButtonSpec = {
  id: string;
  Icon: typeof ClipboardCheck;
  label: string;
  sub: string;
  tooltip: string;
  bg: string;
  border: string;
  color: string;
  onClick: () => void;
};

export function FlightDeckAssistBar({
  missionId,
  questionId,
  questionNumber,
  questionText,
  progressId,
  onHealthChanged,
  pulseOpen: pulseOpenProp,
  onPulseOpenChange,
  pulsePrefill,
  onPulsePrefillConsumed,
}: Props) {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [stickyOpen, setStickyOpen] = useState(false);
  const [pulseOpenLocal, setPulseOpenLocal] = useState(false);

  const pulseOpen = pulseOpenProp ?? pulseOpenLocal;
  const setPulseOpen = (v: boolean) => {
    if (onPulseOpenChange) onPulseOpenChange(v);
    else setPulseOpenLocal(v);
  };

  const buttons: ButtonSpec[] = [
    {
      id: "checkin",
      Icon: ClipboardCheck,
      label: "Check-In",
      sub: "30-second status.",
      tooltip: "Drop a 30-second check-in. Status, confidence, and what changed.",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.3)",
      color: "#86efac",
      onClick: () => setCheckInOpen(true),
    },
    {
      id: "score",
      Icon: Target,
      label: "Score Me",
      sub: "Improve the answer.",
      tooltip: "Paste your draft. I will tell you what lands and what does not.",
      bg: "rgba(196,154,43,0.12)",
      border: "rgba(196,154,43,0.35)",
      color: "#C49A2B",
      onClick: () => setScoreOpen(true),
    },
    {
      id: "sticky",
      Icon: StickyNote,
      label: "Sticky Notes",
      sub: "Pin a thought.",
      tooltip: "Leave a sticky note on this question for the team.",
      bg: "rgba(255,209,102,0.1)",
      border: "rgba(255,209,102,0.3)",
      color: "#FFD166",
      onClick: () => setStickyOpen(true),
    },
    {
      id: "pulse",
      Icon: Activity,
      label: "Mission Pulse",
      sub: "Tell the mission.",
      tooltip: "The mission needs to know this. I will route it to the right people.",
      bg: "rgba(127,119,221,0.1)",
      border: "rgba(127,119,221,0.3)",
      color: "rgba(200,195,255,0.85)",
      onClick: () => setPulseOpen(true),
    },
  ];

  return (
    <>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 30,
          height: 56,
          background: "#050d18",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          padding: "0 12px",
          marginLeft: "-1rem",
          marginRight: "-1rem",
          alignItems: "center",
        }}
      >
        {buttons.map((b) => (
          <button
            key={b.id}
            onClick={b.onClick}
            title={b.tooltip}
            style={{
              position: "relative",
              height: 44,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              background: b.bg,
              border: `0.5px solid ${b.border}`,
              color: b.color,
              borderRadius: 6,
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1.1,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <b.Icon size={16} />
              {b.label}
            </span>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{b.sub}</span>
          </button>
        ))}
      </div>

      <CheckInDialog
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        progressId={progressId ?? null}
        onSubmitted={onHealthChanged}
      />
      <ScoreMeDialog
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
      />
      {missionId ? (
        <StickyNotesPanel
          open={stickyOpen}
          onClose={() => setStickyOpen(false)}
          missionId={missionId}
          questionId={questionId}
          questionNumber={questionNumber}
          questionText={questionText}
        />
      ) : null}
      <MissionPulsePanel
        open={pulseOpen}
        onOpenChange={setPulseOpen}
        missionId={missionId}
        prefill={pulsePrefill ?? null}
        onPrefillConsumed={onPulsePrefillConsumed}
      />
    </>
  );
}
