import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Eye, Send, X, Sparkles, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  listMissionPulse,
  submitMissionSignal,
  SIGNAL_TYPES,
  type SignalType,
  type TeamUpdateRow,
} from "@/lib/mission-pulse-signal.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  prefill?: { signalType: string; body: string } | null;
  onPrefillConsumed?: () => void;
};

const TYPE_META: Record<
  SignalType,
  { label: string; chip: string; bg: string; border: string; pill: string }
> = {
  risk_alert: { label: "Risk Alert", chip: "RISK", bg: "rgba(224,74,74,0.05)", border: "rgba(224,74,74,0.2)", pill: "#E04A4A" },
  new_intelligence: { label: "New Intelligence", chip: "INTEL", bg: "rgba(74,111,165,0.05)", border: "rgba(74,111,165,0.2)", pill: "#4A6FA5" },
  client_signal: { label: "Client Signal", chip: "CLIENT", bg: "rgba(239,159,39,0.05)", border: "rgba(239,159,39,0.2)", pill: "#EF9F27" },
  blocker: { label: "Blocker", chip: "BLOCKED", bg: "rgba(224,74,74,0.05)", border: "rgba(224,74,74,0.25)", pill: "#E04A4A" },
  opportunity: { label: "Opportunity", chip: "OPPORTUNITY", bg: "rgba(26,122,74,0.05)", border: "rgba(26,122,74,0.2)", pill: "#1A7A4A" },
  resource_concern: { label: "Resource Concern", chip: "RESOURCE", bg: "rgba(239,159,39,0.05)", border: "rgba(239,159,39,0.15)", pill: "#EF9F27" },
  decision_needed: { label: "Decision Needed", chip: "DECISION", bg: "rgba(127,119,221,0.05)", border: "rgba(127,119,221,0.2)", pill: "#7F77DD" },
  observation: { label: "Observation", chip: "NOTE", bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.07)", pill: "rgba(255,255,255,0.4)" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MissionPulsePanel({ open, onOpenChange, missionId, prefill, onPrefillConsumed }: Props) {
  const list = useServerFn(listMissionPulse);
  const submit = useServerFn(submitMissionSignal);

  const [iris, setIris] = useState<TeamUpdateRow[]>([]);
  const [team, setTeam] = useState<TeamUpdateRow[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [missionName, setMissionName] = useState("Mission");

  const [signalType, setSignalType] = useState<SignalType>("observation");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!missionId) return;
    setLoading(true);
    try {
      const res = await list({ data: { missionId } });
      setIris(res.iris);
      setTeam(res.team);
      setTodayCount(res.todayCount);
    } catch (e) {
      console.error("[mission-pulse] list failed", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !missionId) return;
    void refresh();
    void supabase
      .from("missions")
      .select("name")
      .eq("id", missionId)
      .maybeSingle()
      .then(({ data }) => data?.name && setMissionName(data.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, missionId]);

  // Apply prefill when modal opens with one queued
  useEffect(() => {
    if (!open || !prefill) return;
    const valid = (SIGNAL_TYPES as readonly string[]).includes(prefill.signalType)
      ? (prefill.signalType as SignalType)
      : "risk_alert";
    setSignalType(valid);
    setBody(prefill.body);
    const t = setTimeout(() => {
      const ta = document.querySelector<HTMLTextAreaElement>("[data-mission-pulse-textarea]");
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 150);
    onPrefillConsumed?.();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  async function handleSubmit() {
    if (!missionId || !body.trim() || sending) return;
    setSending(true);
    try {
      await submit({ data: { missionId, signalType, body: body.trim() } });
      setBody("");
      toast.success("Signal sent. IRIS is routing it.");
      await refresh();
    } catch (e: any) {
      console.error("[mission-pulse] submit failed", e);
      const msg = e?.message || e?.body?.message || (typeof e === "string" ? e : "Unknown error");
      toast.error("Could not send signal", { description: msg });
    } finally {
      setSending(false);
    }
  }

  const dailyBriefPrompt = useMemo(
    () => `Give me the daily mission brief for ${missionName}. What do I need to know today?`,
    [missionName],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 border-0 max-w-[800px] w-[95vw]"
        style={{ background: "#0a1420", color: "white" }}
      >

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "white" }}>Mission Pulse</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {missionName} · {todayCount} signal{todayCount === 1 ? "" : "s"} today
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 45fr) minmax(0, 55fr)", gap: 0, maxHeight: "70vh" }} className="md:grid-cols-[45fr_55fr] grid-cols-1">
          {/* LEFT: IRIS → Team */}
          <div style={{ padding: 16, borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", maxHeight: "70vh" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <Eye size={12} style={{ color: "#C8C3FF" }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "#C8C3FF" }}>From IRIS</span>
            </div>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(dailyBriefPrompt).catch(() => {});
                window.dispatchEvent(new CustomEvent("iris:ask", { detail: { prompt: dailyBriefPrompt, missionId } }));
                toast.message("Daily brief request sent to IRIS", { description: dailyBriefPrompt });
              }}
              style={{
                width: "100%",
                marginBottom: 14,
                padding: "10px 12px",
                background: "rgba(196,154,43,0.1)",
                border: "1px solid rgba(196,154,43,0.3)",
                borderRadius: 6,
                color: "#E5C56B",
                fontSize: 11,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <Sparkles size={12} />
              Get today's brief from IRIS
            </button>

            {iris.length === 0 && !loading ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, padding: "20px 4px" }}>
                IRIS is monitoring the mission. Signals will appear here as they become relevant.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {iris.map((s) => {
                  const isEmerging = s.update_type === "emerging_risk";
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: 10,
                        background: isEmerging ? "rgba(224,74,74,0.05)" : "rgba(127,119,221,0.06)",
                        border: "1px solid rgba(127,119,221,0.18)",
                        borderLeft: isEmerging ? "3px solid #E04A4A" : "1px solid rgba(127,119,221,0.18)",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        {isEmerging ? (
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "#E04A4A", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <AlertTriangle size={10} /> EMERGING RISK
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "#C8C3FF" }}>IRIS</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: "white", whiteSpace: "pre-wrap" }}>{s.body}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{timeAgo(s.created_at)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Team → IRIS */}
          <div style={{ padding: 16, overflowY: "auto", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "white", marginBottom: 4 }}>New Signal</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 10, lineHeight: 1.5 }}>
              What did you learn today? (Real-time observations — for strategic changes, use Update Reality)
            </div>
            

            {/* Submission area */}
            <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {SIGNAL_TYPES.map((t) => {
                  const meta = TYPE_META[t];
                  const active = signalType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setSignalType(t)}
                      style={{
                        padding: "4px 9px",
                        fontSize: 10,
                        fontWeight: 500,
                        borderRadius: 999,
                        background: active ? meta.pill : meta.bg,
                        border: `1px solid ${active ? meta.pill : meta.border}`,
                        color: active ? "white" : "rgba(255,255,255,0.7)",
                        cursor: "pointer",
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                data-mission-pulse-textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What did you learn today? Quick observation, contact intel, news, risk flag…"
                rows={3}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  color: "white",
                  padding: 8,
                  fontSize: 12,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={handleSubmit}
                  disabled={!body.trim() || sending || !missionId}
                  style={{
                    background: "#C49A2B",
                    color: "#0a1420",
                    border: "none",
                    padding: "7px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: body.trim() && !sending ? "pointer" : "not-allowed",
                    opacity: body.trim() && !sending ? 1 : 0.5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Send size={12} />
                  {sending ? "Sending..." : "Send Signal"}
                </button>
              </div>
            </div>

            {/* Team feed */}
            <div style={{ fontSize: 12, fontWeight: 500, color: "white", marginBottom: 10 }}>From the team</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {team.length === 0 && !loading ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "12px 4px" }}>
                  No team signals yet. Be the first to raise one.
                </div>
              ) : (
                team.map((s) => {
                  const metaKey = (Object.keys(TYPE_META) as SignalType[]).find((k) => k === s.update_type);
                  const meta = metaKey ? TYPE_META[metaKey] : TYPE_META.observation;
                  return (
                    <div
                      key={s.id}
                      style={{ padding: 10, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 6 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            color: meta.pill,
                            background: "rgba(0,0,0,0.25)",
                            borderRadius: 3,
                          }}
                        >
                          {meta.chip}
                        </span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                          {s.sender_name} · {timeAgo(s.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: "white", whiteSpace: "pre-wrap" }}>{s.body}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
