import { useState } from "react";
import { MessageSquare, PhoneCall, Target, Activity, AlertTriangle } from "lucide-react";
import { UpdateRealityDialog, SOSDialog } from "@/components/iris/AssistsDialogs";
import { DailyPulseModal } from "@/components/iris/DailyPulseModal";
import { ScoreDraftPanel } from "@/components/my-work/ScoreDraftPanel";
import { FindSMEDialog } from "./FindSMEDialog";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  dueDate: string | null;
  confidence: string | null;
};

type ButtonSpec = {
  id: string;
  Icon: typeof MessageSquare;
  label: string;
  sub: string;
  tooltip: string;
  bg: string;
  border: string;
  color: string;
  onClick: () => void;
};

export function FlightDeckAssistBar({ missionId, questionId }: Props) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [smeOpen, setSmeOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  const buttons: ButtonSpec[] = [
    {
      id: "thread",
      Icon: MessageSquare,
      label: "Thread",
      sub: "Work the question.",
      tooltip:
        "Work the question. Tag teammates, capture decisions, build the permanent record.",
      bg: "rgba(255,255,255,0.05)",
      border: "rgba(255,255,255,0.1)",
      color: "rgba(255,255,255,0.6)",
      onClick: () => setThreadOpen(true),
    },
    {
      id: "phone",
      Icon: PhoneCall,
      label: "Phone a Friend",
      sub: "Find expertise.",
      tooltip:
        "Find the right brain. I search the entire Athena Collective for you.",
      bg: "rgba(74,111,165,0.12)",
      border: "rgba(74,111,165,0.3)",
      color: "#7BA7D4",
      onClick: () => setSmeOpen(true),
    },
    {
      id: "score",
      Icon: Target,
      label: "Score Me",
      sub: "Improve the answer.",
      tooltip:
        "Paste your draft. I will tell you what lands and what does not.",
      bg: "rgba(196,154,43,0.15)",
      border: "rgba(196,154,43,0.4)",
      color: "#C49A2B",
      onClick: () => setScoreOpen(true),
    },
    {
      id: "pulse",
      Icon: Activity,
      label: "Mission Pulse",
      sub: "Tell the mission.",
      tooltip:
        "The mission needs to know this. I will route it to the right people.",
      bg: "rgba(127,119,221,0.12)",
      border: "rgba(127,119,221,0.3)",
      color: "rgba(200,195,255,0.9)",
      onClick: () => setPulseOpen(true),
    },
    {
      id: "sos",
      Icon: AlertTriangle,
      label: "SOS",
      sub: "Raise the flag.",
      tooltip:
        "Ancient sailors raised distress flags. This is the modern version.",
      bg: "rgba(224,74,74,0.06)",
      border: "rgba(224,74,74,0.3)",
      color: "rgba(224,74,74,0.9)",
      onClick: () => setSosOpen(true),
    },
  ];

  return (
    <>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 30,
          height: 52,
          background: "#050d18",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
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
              height: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              background: b.bg,
              border: `1px solid ${b.border}`,
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
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              <b.Icon size={12} />
              {b.label}
            </span>
            <span
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {b.sub}
            </span>
          </button>
        ))}
      </div>

      <UpdateRealityDialog
        open={threadOpen}
        onOpenChange={setThreadOpen}
        missionId={missionId}
        onSent={() => {}}
      />
      <FindSMEDialog open={smeOpen} onOpenChange={setSmeOpen} missionId={missionId} />
      <ScoreDraftPanel
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
        questionId={questionId}
        lockQuestion={!!questionId}
      />
      <DailyPulseModal open={pulseOpen} onOpenChange={setPulseOpen} missionId={missionId} />
      <SOSDialog
        open={sosOpen}
        onOpenChange={async (v) => {
          setSosOpen(v);
          if (!v && questionId) {
            try {
              await supabase
                .from("mission_questions")
                .update({ health_status: "at_risk" })
                .eq("id", questionId);
            } catch {
              /* ignore */
            }
          }
        }}
        missionId={missionId}
      />
    </>
  );
}
