import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, AlertOctagon, LifeBuoy, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fireAssistEvent } from "@/lib/fireAssistEvent";

type Status = "on_track" | "blocked" | "need_sme";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  progressId: string | null;
  statusOptions?: string[];
  onStatusChange?: (status: string) => Promise<void> | void;
  onSubmitted?: () => void;
};

const GOLD = "#C9972B";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";

const OPTIONS: { id: Status; label: string; color: string; Icon: any; sub: string }[] = [
  { id: "on_track", label: "On Track",    color: GREEN, Icon: CheckCircle2, sub: "Making progress, no blockers" },
  { id: "blocked",  label: "Blocked",     color: RED,   Icon: AlertOctagon, sub: "Stuck — flag for help" },
  { id: "need_sme", label: "Need SME",    color: AMBER, Icon: LifeBuoy,     sub: "Need expert input to proceed" },
];

export function CheckInDialog({ open, onOpenChange, missionId, questionId, questionNumber, progressId, statusOptions, onStatusChange, onSubmitted }: Props) {
  const [status, setStatus] = useState<Status>("on_track");
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("medium");
  const [nextStatus, setNextStatus] = useState<string>("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) { setStatus("on_track"); setNote(""); setConfidence("medium"); setNextStatus(""); setSending(false); }
  }, [open]);

  async function submit() {
    if (!missionId || !questionId) return;
    setSending(true);
    try {
      if (progressId) {
        await supabase.from("question_progress").update({
          last_activity_at: new Date().toISOString(),
          writer_confidence: confidence,
        } as never).eq("id", progressId);
      }
      await fireAssistEvent(missionId, questionId, null, "check_in", {
        status, confidence, note: note.slice(0, 500), next_status: nextStatus || null,
      });
      if (status !== "on_track") {
        await fireAssistEvent(missionId, questionId, null, "sos_raised", { source: "check_in", reason: status });
      }
      if (nextStatus && onStatusChange) {
        await onStatusChange(nextStatus);
      }
      toast.success("Check-in recorded");
      onSubmitted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not record check-in");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
        <div style={{ background: "#0a1828", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", color: "white", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: GOLD }}>30-SECOND CHECK-IN</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                Question {questionNumber ?? ""}
              </div>
            </div>
            <button onClick={() => onOpenChange(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {OPTIONS.map(o => {
                const sel = status === o.id;
                return (
                  <button key={o.id} onClick={() => setStatus(o.id)} style={{
                    all: "unset", cursor: "pointer", padding: "10px 12px", borderRadius: 8,
                    border: `1px solid ${sel ? o.color : "rgba(255,255,255,0.08)"}`,
                    background: sel ? `${o.color}1a` : "rgba(255,255,255,0.02)",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <o.Icon size={16} color={o.color} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{o.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>CONFIDENCE</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["low", "medium", "high"] as const).map(c => (
                  <button key={c} onClick={() => setConfidence(c)} style={{
                    flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${confidence === c ? GOLD : "rgba(255,255,255,0.1)"}`,
                    background: confidence === c ? `${GOLD}22` : "transparent",
                    color: confidence === c ? GOLD : "rgba(255,255,255,0.7)",
                    textTransform: "capitalize",
                  }}>{c}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>NOTE (OPTIONAL)</div>
              <textarea
                value={note} onChange={e => setNote(e.target.value.slice(0, 500))}
                placeholder="What changed since your last check-in?"
                rows={3}
                style={{
                  width: "100%", background: "#06111e", color: "white",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                  padding: "8px 10px", fontSize: 12, resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>

            {statusOptions && statusOptions.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>UPDATE QUESTION STATUS</div>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  style={{
                    width: "100%", background: "#06111e", color: "white",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                    padding: "8px 10px", fontSize: 12,
                  }}
                >
                  <option value="">Keep current status</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>→ {s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={submit} disabled={sending} style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: sending ? "wait" : "pointer",
              background: GOLD, color: "#1a1208", border: "none", letterSpacing: "0.05em",
            }}>
              {sending ? "Recording…" : "Record Check-In"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
