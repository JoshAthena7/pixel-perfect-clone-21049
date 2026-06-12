import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { raiseSOS, type SosSeverity } from "@/lib/sos.functions";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
};

const SEVERITY_META: Record<
  SosSeverity,
  { label: string; sub: string; bg: string; border: string; color: string }
> = {
  watch: {
    label: "WATCH",
    sub: "Something to monitor closely",
    bg: "rgba(239,159,39,0.12)",
    border: "1px solid rgba(239,159,39,0.5)",
    color: "#EF9F27",
  },
  at_risk: {
    label: "AT RISK",
    sub: "Needs attention today",
    bg: "transparent",
    border: "1px solid rgba(224,74,74,0.4)",
    color: "#f08080",
  },
  blocked: {
    label: "BLOCKED",
    sub: "Cannot proceed without intervention",
    bg: "rgba(224,74,74,0.2)",
    border: "1px solid rgba(224,74,74,0.5)",
    color: "#ffffff",
  },
};

export function SOSDialog({ open, onOpenChange, missionId, questionId, questionNumber, questionText }: Props) {
  const raise = useServerFn(raiseSOS);
  const [severity, setSeverity] = useState<SosSeverity | null>(null);
  const [body, setBody] = useState("");
  const [attachToQuestion, setAttachToQuestion] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ack: string } | null>(null);

  useEffect(() => {
    if (open) {
      setSeverity(null);
      setBody("");
      setAttachToQuestion(true);
      setDone(null);
    }
  }, [open]);

  const canSubmit = !!severity && body.trim().length >= 20 && !!missionId && !busy;

  async function handleSubmit() {
    if (!canSubmit || !missionId || !severity) return;
    setBusy(true);
    try {
      const res = await raise({
        data: {
          missionId,
          questionId: attachToQuestion && questionId ? questionId : null,
          severity,
          body: body.trim(),
        },
      });
      setDone({ ack: res.irisAcknowledgment });
    } catch (e) {
      console.error(e);
      toast.error("Could not raise SOS — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 border-0 max-w-[560px] w-[95vw]"
        style={{
          background: "rgba(224,74,74,0.03)",
          border: "1px solid rgba(224,74,74,0.35)",
          borderRadius: 10,
          color: "white",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#f08080", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} /> SOS
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Immediate leadership escalation
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "8px 20px 22px" }}>
            <div
              style={{
                padding: 14,
                background: "rgba(26,122,74,0.08)",
                border: "1px solid rgba(26,122,74,0.4)",
                borderRadius: 8,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <CheckCircle2 size={18} style={{ color: "#3DBE7D", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#3DBE7D" }}>
                  Leadership has been alerted. IRIS is monitoring the situation.
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 8, lineHeight: 1.6 }}>
                  {done.ack}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                onClick={() => onOpenChange(false)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "8px 14px",
                  color: "white",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "8px 20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* IRIS voice block */}
            <div
              style={{
                padding: 12,
                background: "rgba(224,74,74,0.06)",
                border: "1px solid rgba(224,74,74,0.25)",
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              Ancient sailors raised distress flags when the situation exceeded their ability to manage alone.
              This is the modern version. Use it when something requires immediate leadership attention and cannot wait.
              If the thought crossed your mind that leadership needs to know right now — they do. Send it.
            </div>

            {/* Severity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(Object.keys(SEVERITY_META) as SosSeverity[]).map((s) => {
                const meta = SEVERITY_META[s];
                const active = severity === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSeverity(s)}
                    style={{
                      padding: "12px 14px",
                      background: meta.bg,
                      border: meta.border,
                      borderRadius: 8,
                      color: meta.color,
                      textAlign: "left",
                      cursor: "pointer",
                      outline: active ? `2px solid ${meta.color}` : "none",
                      outlineOffset: 1,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>{meta.label}</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: "rgba(255,255,255,0.65)" }}>{meta.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Description */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the situation. What happened. What you need. What is at stake if this is not addressed."
              rows={4}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                color: "white",
                padding: 10,
                fontSize: 12,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />

            {questionId && questionText && (
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={attachToQuestion}
                  onChange={(e) => setAttachToQuestion(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  This SOS is related to question {questionNumber ?? ""}
                  <div style={{ marginTop: 2, color: "rgba(255,255,255,0.4)" }}>{questionText}</div>
                </span>
              </label>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: canSubmit ? "rgba(224,74,74,0.8)" : "rgba(224,74,74,0.3)",
                border: "1px solid rgba(224,74,74,0.6)",
                color: "white",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "Alerting leadership..." : "Alert Leadership Now"}
            </button>

            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
              This alert goes to your Engagement Lead and Mission Administrators immediately.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
