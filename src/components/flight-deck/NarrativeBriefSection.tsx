import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generateNarrativeBrief,
  rateNarrativeBrief,
  type NarrativeBrief,
} from "@/lib/oracle/generate-narrative-brief.functions";

const GOLD = "#C9972B";
const STEEL = "rgba(255,255,255,0.55)";
const WARM = "rgba(255,255,255,0.92)";

export function NarrativeBriefSection({
  missionId,
  questionId,
  onJumpToQuestion,
}: {
  missionId: string;
  questionId: string;
  onJumpToQuestion: (questionId: string) => void;
}) {
  const qc = useQueryClient();
  const gen = useServerFn(generateNarrativeBrief);
  const rate = useServerFn(rateNarrativeBrief);
  const [expandedThread, setExpandedThread] = useState(false);
  const [expandedNeighbors, setExpandedNeighbors] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const key = ["narrative-brief", missionId, questionId];
  const { data, isLoading, isError, refetch } = useQuery<NarrativeBrief>({
    queryKey: key,
    queryFn: () => gen({ data: { missionId, questionId, force: false } }) as Promise<NarrativeBrief>,
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });

  if (isLoading) return <Loading />;
  if (isError) return <ErrorRow onRetry={() => refetch()} />;
  if (!data) return null;
  if (data.notMapped) return null; // silently omit

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await gen({ data: { missionId, questionId, force: true } });
      qc.setQueryData(key, fresh);
      toast.success("Narrative brief refreshed");
    } catch {
      toast.error("IRIS is thinking — try again");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRate(helpful: boolean) {
    setFeedback(helpful ? "up" : "down");
    try {
      await rate({ data: { missionId, questionId, helpful } });
    } catch {
      /* noop */
    }
  }

  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 14,
        borderTop: `1px solid ${GOLD}55`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: GOLD,
          textTransform: "",
        }}
      >
        📖 Your Place in the Story
      </div>

      <Block label="THE THREAD">
        <Clamped
          text={data.thread}
          expanded={expandedThread}
          setExpanded={setExpandedThread}
        />
      </Block>

      <Block label="YOUR NEIGHBORS">
        <Clamped
          text={data.neighbors}
          expanded={expandedNeighbors}
          setExpanded={setExpandedNeighbors}
        />
        {data.connectedQuestions && data.connectedQuestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {data.connectedQuestions.map((c) => (
              <button
                key={c.number}
                type="button"
                onClick={() => c.question_id && onJumpToQuestion(c.question_id)}
                title={c.question_text ?? c.relationship}
                disabled={!c.question_id}
                style={{
                  all: "unset",
                  cursor: c.question_id ? "pointer" : "default",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${GOLD}88`,
                  color: GOLD,
                  background: "rgba(201,151,43,0.06)",
                  opacity: c.question_id ? 1 : 0.5,
                }}
              >
                {c.number}
              </button>
            ))}
          </div>
        )}
      </Block>

      <Block label="WHAT THEY FEAR">
        <div
          style={{
            color: "rgba(255,255,255,0.7)",
            fontStyle: "italic",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {data.evaluator || "—"}
        </div>
      </Block>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 10,
          color: STEEL,
        }}
      >
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={pillBtn()}
        >
          ⚡ {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={() => handleRate(true)}
          style={pillBtn(feedback === "up" ? GOLD : undefined)}
        >
          👍 Useful
        </button>
        <button
          type="button"
          onClick={() => handleRate(false)}
          style={pillBtn(feedback === "down" ? "#ef4444" : undefined)}
        >
          👎 Not useful
        </button>
        {data.cached && <span style={{ marginLeft: "auto" }}>cached</span>}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: STEEL,
          textTransform: "",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Clamped({
  text,
  expanded,
  setExpanded,
}: {
  text: string;
  expanded: boolean;
  setExpanded: (b: boolean) => void;
}) {
  if (!text) return <div style={{ color: STEEL, fontSize: 12 }}>—</div>;
  return (
    <div>
      <div
        style={{
          color: WARM,
          fontSize: 13,
          lineHeight: 1.7,
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {text}
      </div>
      {text.length > 180 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            all: "unset",
            cursor: "pointer",
            color: GOLD,
            fontSize: 10,
            marginTop: 4,
            letterSpacing: "0.05em",
          }}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 14,
        borderTop: `1px solid ${GOLD}55`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: STEEL,
        fontStyle: "italic",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: GOLD,
          animation: "pulse 1.4s ease-in-out infinite",
          display: "inline-block",
        }}
      />
      IRIS is reading the narrative thread…
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}

function ErrorRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 14,
        borderTop: `1px solid ${GOLD}55`,
        fontSize: 11,
        color: "rgba(255,255,255,0.6)",
      }}
    >
      IRIS is thinking —{" "}
      <button
        type="button"
        onClick={onRetry}
        style={{ all: "unset", cursor: "pointer", color: GOLD }}
      >
        try again
      </button>
    </div>
  );
}

function pillBtn(active?: string): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 4,
    border: `1px solid ${active ?? "rgba(255,255,255,0.18)"}`,
    color: active ?? STEEL,
    background: active ? `${active}15` : "transparent",
    letterSpacing: "0.04em",
  };
}
