import { useState } from "react";
import { format } from "date-fns";
import { Target, Eye, Pencil, Users, FileText, AlertTriangle } from "lucide-react";
import { UpdateRealityDialog, SOSDialog } from "@/components/iris/AssistsDialogs";
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

const GOLD = "#C49A2B";

function pill(style: React.CSSProperties): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 500,
    padding: "5px 11px",
    borderRadius: 6,
    cursor: "pointer",
    whiteSpace: "nowrap",
    ...style,
  };
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)", margin: "0 4px" }}
    />
  );
}

export function FlightDeckAssistBar({
  missionId,
  questionId,
  dueDate,
  confidence,
}: Props) {
  const [scoreOpen, setScoreOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [smeOpen, setSmeOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  const openIris = (prefill?: string) => {
    if (prefill) {
      window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: prefill }));
    } else {
      window.dispatchEvent(new CustomEvent("atlas:iris:open"));
    }
  };

  return (
    <>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 30,
          background: "#050d18",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          marginLeft: "-1rem",
          marginRight: "-1rem",
        }}
      >
        {/* Group 1 — Power tools */}
        <button
          onClick={() => setScoreOpen(true)}
          style={pill({
            background: "rgba(196,154,43,0.15)",
            border: "1px solid rgba(196,154,43,0.4)",
            color: GOLD,
          })}
        >
          <Target size={12} />
          Score Draft
        </button>
        <button
          onClick={() => openIris()}
          style={pill({
            background: "rgba(127,119,221,0.12)",
            border: "1px solid rgba(127,119,221,0.3)",
            color: "rgba(200,195,255,0.9)",
          })}
        >
          <Eye size={12} />
          Ask IRIS
        </button>

        <Divider />

        {/* Group 2 — Team actions */}
        <button
          onClick={() => setUpdateOpen(true)}
          style={pill({
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.75)",
          })}
        >
          <Pencil size={12} />
          Post Update
        </button>
        <button
          onClick={() => setSmeOpen(true)}
          style={pill({
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.75)",
          })}
        >
          <Users size={12} />
          Find SME
        </button>
        <button
          onClick={() => openIris("Give me the daily brief for this mission.")}
          style={pill({
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.75)",
          })}
        >
          <FileText size={12} />
          Daily Brief
        </button>

        <Divider />

        {/* Group 3 — Escalation */}
        <button
          onClick={() => setSosOpen(true)}
          style={pill({
            background: "rgba(224,74,74,0.04)",
            border: "1px solid rgba(224,74,74,0.2)",
            color: "rgba(224,74,74,0.85)",
          })}
        >
          <AlertTriangle size={12} />
          SOS
        </button>

        {/* Right: due / confidence */}
        <div
          style={{
            marginLeft: "auto",
            fontSize: 9,
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          {dueDate ? `Due ${format(new Date(dueDate), "MMM d")}` : "No due date"}
          {" · "}
          {confidence ?? "—"} confidence
        </div>
      </div>

      <ScoreDraftPanel
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
        questionId={questionId}
        lockQuestion={!!questionId}
      />
      <UpdateRealityDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        missionId={missionId}
        onSent={() => {}}
      />
      <FindSMEDialog open={smeOpen} onOpenChange={setSmeOpen} missionId={missionId} />
      <SOSDialog
        open={sosOpen}
        onOpenChange={async (v) => {
          setSosOpen(v);
          // When the SOS dialog closes (after a submission) ensure question is flagged at-risk
          if (!v && questionId) {
            try {
              await supabase
                .from("mission_questions")
                .update({ health_status: "at_risk" })
                .eq("id", questionId);
            } catch {
              /* ignore — SOS already notified leadership */
            }
          }
        }}
        missionId={missionId}
      />
    </>
  );
}
