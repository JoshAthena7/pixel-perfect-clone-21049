import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, PhoneCall, Target, Activity, AlertTriangle } from "lucide-react";
import { SOSDialog } from "./SOSDialog";
import { MissionPulsePanel } from "./MissionPulsePanel";
import { ScoreMeDialog } from "./ScoreMeDialog";
import { PhoneAFriendDialog } from "./PhoneAFriendDialog";
import { ThreadPanel } from "./ThreadPanel";
import { countUnreadThread, countUnreadPulse } from "@/lib/flight-deck-badges.functions";

type Props = {
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  dueDate: string | null;
  confidence: string | null;
  onHealthChanged?: () => void;
  threadOpen?: boolean;
  onThreadOpenChange?: (v: boolean) => void;
  pulseOpen?: boolean;
  onPulseOpenChange?: (v: boolean) => void;
  pulsePrefill?: { signalType: string; body: string } | null;
  onPulsePrefillConsumed?: () => void;
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
  badge?: number;
};

const THREAD_KEY = (qid: string) => `fd:lastViewedThread:${qid}`;
const PULSE_KEY = (mid: string) => `fd:lastViewedPulse:${mid}`;
const DEFAULT_SINCE = "1970-01-01T00:00:00.000Z";

function readTs(key: string): string {
  if (typeof window === "undefined") return DEFAULT_SINCE;
  return window.localStorage.getItem(key) ?? DEFAULT_SINCE;
}

export function FlightDeckAssistBar({
  missionId,
  questionId,
  questionNumber,
  questionText,
  onHealthChanged,
  threadOpen: threadOpenProp,
  onThreadOpenChange,
  pulseOpen: pulseOpenProp,
  onPulseOpenChange,
  pulsePrefill,
  onPulsePrefillConsumed,
}: Props) {
  const [threadOpenLocal, setThreadOpenLocal] = useState(false);
  const [smeOpen, setSmeOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pulseOpenLocal, setPulseOpenLocal] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  const threadOpen = threadOpenProp ?? threadOpenLocal;
  const setThreadOpen = (v: boolean) => {
    if (onThreadOpenChange) onThreadOpenChange(v);
    else setThreadOpenLocal(v);
  };
  const pulseOpen = pulseOpenProp ?? pulseOpenLocal;
  const setPulseOpen = (v: boolean) => {
    if (onPulseOpenChange) onPulseOpenChange(v);
    else setPulseOpenLocal(v);
  };

  // tick to force re-read of localStorage timestamps after open/close
  const [tick, setTick] = useState(0);
  const bumpTick = () => setTick((n) => n + 1);

  const threadSince = questionId ? readTs(THREAD_KEY(questionId)) : DEFAULT_SINCE;
  const pulseSince = missionId ? readTs(PULSE_KEY(missionId)) : DEFAULT_SINCE;

  const threadFn = useServerFn(countUnreadThread);
  const pulseFn = useServerFn(countUnreadPulse);

  const { data: threadUnread } = useQuery({
    queryKey: ["fd-thread-unread", questionId, threadSince, tick],
    enabled: !!questionId,
    queryFn: () => threadFn({ data: { questionId: questionId!, since: threadSince } }),
    refetchInterval: 15_000,
  });

  const { data: pulseUnread } = useQuery({
    queryKey: ["fd-pulse-unread", missionId, pulseSince, tick],
    enabled: !!missionId,
    queryFn: () => pulseFn({ data: { missionId: missionId!, since: pulseSince } }),
    refetchInterval: 15_000,
  });

  // mark-as-viewed on open
  useEffect(() => {
    if (threadOpen && questionId) {
      window.localStorage.setItem(THREAD_KEY(questionId), new Date().toISOString());
      bumpTick();
    }
  }, [threadOpen, questionId]);

  useEffect(() => {
    if (pulseOpen && missionId) {
      window.localStorage.setItem(PULSE_KEY(missionId), new Date().toISOString());
      bumpTick();
    }
  }, [pulseOpen, missionId]);

  const buttons: ButtonSpec[] = [
    {
      id: "thread",
      Icon: MessageSquare,
      label: "Thread",
      sub: "Work the question.",
      tooltip: "Work the question. Tag teammates, capture decisions, preserve the history.",
      bg: "rgba(255,255,255,0.05)",
      border: "rgba(255,255,255,0.12)",
      color: "rgba(255,255,255,0.65)",
      onClick: () => setThreadOpen(true),
      badge: threadUnread?.count ?? 0,
    },
    {
      id: "phone",
      Icon: PhoneCall,
      label: "Phone a Friend",
      sub: "Find the right brain.",
      tooltip: "Find the right brain. I search the entire Athena Collective for you.",
      bg: "rgba(74,111,165,0.1)",
      border: "rgba(74,111,165,0.3)",
      color: "#7BA7D4",
      onClick: () => setSmeOpen(true),
    },
    {
      id: "score",
      Icon: Target,
      label: "Score Me",
      sub: "Improve the answer.",
      tooltip: "Paste your draft from the client environment. I will tell you what lands and what does not.",
      bg: "rgba(196,154,43,0.12)",
      border: "rgba(196,154,43,0.35)",
      color: "#C49A2B",
      onClick: () => setScoreOpen(true),
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
      badge: pulseUnread?.count ?? 0,
    },
    {
      id: "sos",
      Icon: AlertTriangle,
      label: "SOS",
      sub: "Raise the flag.",
      tooltip: "Ancient sailors raised distress flags. This is the modern version.",
      bg: "rgba(224,74,74,0.05)",
      border: "rgba(224,74,74,0.3)",
      color: "rgba(224,74,74,0.85)",
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
          height: 56,
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
            {b.badge && b.badge > 0 ? (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: b.id === "pulse" ? "rgba(127,119,221,0.9)" : "#E04A4A",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {b.badge > 9 ? "9+" : b.badge}
              </span>
            ) : null}
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

      <ThreadPanel
        open={threadOpen}
        onClose={() => setThreadOpen(false)}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
        onRequestFindSME={(_topic) => {
          setThreadOpen(false);
          setSmeOpen(true);
        }}
      />
      <PhoneAFriendDialog
        open={smeOpen}
        onOpenChange={setSmeOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
      />
      <ScoreMeDialog
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
      />
      <MissionPulsePanel
        open={pulseOpen}
        onOpenChange={setPulseOpen}
        missionId={missionId}
        prefill={pulsePrefill ?? null}
        onPrefillConsumed={onPulsePrefillConsumed}
      />
      <SOSDialog
        open={sosOpen}
        onOpenChange={setSosOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
        onSubmitted={onHealthChanged}
      />
    </>
  );
}
