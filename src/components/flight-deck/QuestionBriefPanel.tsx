import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Sparkles, RefreshCw, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateQuestionBrief, type QuestionBriefBody } from "@/lib/iris-brief.functions";
import { fireAssistEvent } from "@/lib/fireAssistEvent";
import { IrisBriefParticles } from "@/components/iris/IrisBriefParticles";
import { triggerIrisBolt, useIrisBoltRef } from "@/lib/iris-bolt";


type Props = {
  missionId: string;
  questionId: string;
  questionText: string;
};

const PURPLE_BG = "rgba(127,119,221,0.07)";
const PURPLE_BORDER = "rgba(127,119,221,0.2)";
const GOLD = "#C49A2B";

type BriefRow = QuestionBriefBody & { id: string; generated_at: string };

export function QuestionBriefPanel({ missionId, questionId, questionText }: Props) {
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();
  const generate = useServerFn(generateQuestionBrief);

  const queryKey = ["question-brief", missionId, questionId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<BriefRow | null> => {
      const { data, error } = await supabase
        .from("question_briefs")
        .select("*")
        .eq("mission_id", missionId)
        .eq("question_id", questionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BriefRow) ?? null;
    },
  });

  // Fire brief_opened once per mount when a brief exists and the panel is open.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!open || !data?.id || firedRef.current) return;
    firedRef.current = true;
    void fireAssistEvent(missionId, questionId, null, "brief_opened", {
      brief_id: data.id,
    });
  }, [open, data?.id, missionId, questionId]);

  // Particle field fades to 0 over 300ms before the brief content is revealed.
  const [particlesFading, setParticlesFading] = useState(false);

  const genMutation = useMutation({
    mutationFn: async () => {
      // If a brief already exists, delete prior rows for this question (regenerate = overwrite).
      if (data?.id) {
        await supabase
          .from("question_briefs")
          .delete()
          .eq("mission_id", missionId)
          .eq("question_id", questionId);
      }
      return generate({
        data: { missionId, questionId, questionText, persist: true },
      });
    },
    onSuccess: () => {
      setParticlesFading(true);
      triggerIrisBolt("brief");
      window.setTimeout(() => {
        qc.invalidateQueries({ queryKey });
        setParticlesFading(false);
      }, 280);
    },
  });


  const brief = data;
  const boltRef = useIrisBoltRef<HTMLSpanElement>("brief");



  return (
    <div
      style={{
        background: PURPLE_BG,
        border: `0.5px solid ${PURPLE_BORDER}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          color: "rgba(220,215,255,0.95)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span ref={boltRef} style={{ display: "inline-flex", color: "#C49A2B" }}>
          <Eye size={11} />
        </span>

        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(180,170,255,0.9)",
          }}
        >
          IRIS Question Brief
        </span>
        {brief && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            generated
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          {isLoading ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "8px 0" }}>
              Loading…
            </div>
          ) : !brief ? (
            <div style={{ padding: "4px 0 0 0", position: "relative", minHeight: (genMutation.isPending || particlesFading) ? 160 : undefined }}>
              {(genMutation.isPending || particlesFading) && <IrisBriefParticles fading={particlesFading} />}

              <div
                style={{
                  fontSize: 11.5,
                  color: "rgba(220,215,255,0.75)",
                  lineHeight: 1.55,
                  marginBottom: 8,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Get IRIS guidance before drafting: what the question really asks, who's
                evaluating, messages to reinforce, and proof points to consider.
              </div>
              <button
                onClick={() => genMutation.mutate()}
                disabled={genMutation.isPending}
                style={{
                  background: "rgba(127,119,221,0.18)",
                  border: "1px solid rgba(127,119,221,0.4)",
                  color: "rgba(220,215,255,0.95)",
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: genMutation.isPending ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <Sparkles size={11} />
                {genMutation.isPending ? "Generating…" : "Generate Question Brief"}
              </button>
              {genMutation.isPending && (
                <div
                  style={{
                    marginTop: 14,
                    textAlign: "center",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "rgba(220,215,255,0.65)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  IRIS is assembling your brief…
                </div>
              )}
              {genMutation.isError && (
                <div style={{ marginTop: 6, fontSize: 10.5, color: "#e57373", position: "relative", zIndex: 1 }}>
                  {(genMutation.error as Error).message}
                </div>

              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <BriefSection title="What They're Really Asking" body={brief.what_they_really_asking} />
              <BriefSection title="Why It Matters" body={brief.why_it_matters} />
              <BriefSection title="Evaluator Perspective" body={brief.evaluator_perspective} />
              <BriefSection title="Member Perspective" body={brief.member_perspective} />
              <BriefSection title="Provider Perspective" body={brief.provider_perspective} />
              <BriefList title="Key Messages to Reinforce" items={brief.key_messages_to_reinforce} accent={GOLD} />
              <BriefList title="Things to Avoid" items={brief.things_to_avoid} accent="#e57373" />
              <BriefList title="Proof Points to Consider" items={brief.proof_points} />
              <BriefList title="Suggested SMEs" items={brief.suggested_smes} />
              <CounterStrategyBlock missionId={missionId} />


              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
                <button
                  onClick={() => genMutation.mutate()}
                  disabled={genMutation.isPending}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(127,119,221,0.35)",
                    color: "rgba(200,195,255,0.85)",
                    fontSize: 10.5,
                    padding: "3px 10px",
                    borderRadius: 6,
                    cursor: genMutation.isPending ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <RefreshCw size={10} />
                  {genMutation.isPending ? "Refreshing brief…" : "↻ Refresh brief"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BriefSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "rgba(180,170,255,0.85)",
          marginBottom: 3,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.88)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
        {body}
      </div>
    </div>
  );
}

function BriefList({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: accent ?? "rgba(180,170,255,0.85)",
          marginBottom: 3,
        }}
      >
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {items.map((it, i) => (
          <li
            key={i}
            style={{ fontSize: 11.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, marginBottom: 2 }}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CounterStrategyBlock({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["counter-strategies", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_field, extracted_value, user_override_value")
        .eq("mission_id", missionId)
        .like("extracted_field", "competitor_card_%");
      return (data ?? []) as Array<{
        extracted_field: string;
        extracted_value: string | null;
        user_override_value: string | null;
      }>;
    },
  });
  const items = (data ?? [])
    .map((r) => {
      try {
        const c = JSON.parse((r.user_override_value ?? r.extracted_value) || "null") as {
          competitor_name?: string;
          how_we_beat_them?: string;
          threat_level?: string;
        } | null;
        if (!c?.how_we_beat_them) return null;
        return c;
      } catch {
        return null;
      }
    })
    .filter((c): c is { competitor_name?: string; how_we_beat_them?: string; threat_level?: string } => !!c);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        background: "rgba(196,154,43,0.08)",
        border: "1px solid rgba(196,154,43,0.30)",
        borderRadius: 6,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.10em",
          color: "#fde68a",
          marginBottom: 6,
        }}
      >
        ⚡ HOW WE BEAT THEM — IRIS COUNTER-STRATEGY
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: "#fde68a", fontWeight: 600 }}>
              {c.competitor_name}
              {c.threat_level ? (
                <span style={{ opacity: 0.65, fontWeight: 400 }}> · {c.threat_level}</span>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.55,
                marginTop: 2,
              }}
            >
              {c.how_we_beat_them}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

