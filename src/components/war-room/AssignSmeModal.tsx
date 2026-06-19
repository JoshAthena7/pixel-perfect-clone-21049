/**
 * Assign SME modal — surfaces from an SOS alert. Lets the lead pick a
 * mission SME, write an optional note, and writes a `sos_acknowledged`
 * event that clears the alert and surfaces the question in the SME's
 * Flight Deck.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fireAssistEvent } from "@/lib/fireAssistEvent";
import { toast } from "sonner";

const GOLD = "#C49A2B";

export function AssignSmeModal({
  missionId, questionId, questionNumber, onClose,
}: {
  missionId: string; questionId: string; questionNumber: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [smeId, setSmeId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: smes = [], isLoading } = useQuery({
    queryKey: ["mission-smes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members:member_id(first_name, last_name, email)")
        .eq("mission_id", missionId)
        .eq("mission_role", "sme");
      return (data ?? []).map((r: any) => {
        const a = r.atlas_team_members ?? {};
        const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || "SME";
        return { id: r.member_id as string, name };
      });
    },
  });

  async function assign() {
    if (!smeId) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      await fireAssistEvent(missionId, questionId, uid, "sos_acknowledged", {
        question_id: questionId,
        assigned_sme_id: smeId,
        note: note.trim() || undefined,
      });
      toast.success("SME assigned. They'll see this question in their Flight Deck.");
      qc.invalidateQueries({ queryKey: ["iris-alerts", missionId] });
      qc.invalidateQueries({ queryKey: ["war-room-sos", missionId] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320, background: "#0d1320", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)", padding: 18,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ color: "white", fontSize: 14, fontWeight: 600 }}>
            Assign SME — Q{questionNumber}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading SMEs…</div>
        ) : smes.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 1.5 }}>
            No SMEs assigned to this mission. Add them in Mission Setup.
          </div>
        ) : (
          <>
            <select
              value={smeId}
              onChange={(e) => setSmeId(e.target.value)}
              style={{
                width: "100%", background: "#0a1220", color: "white",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                padding: "8px 10px", fontSize: 13, marginBottom: 10,
              }}
            >
              <option value="">Pick an SME…</option>
              {smes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note to SME (optional)"
              rows={3}
              style={{
                width: "100%", background: "#0a1220", color: "white",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                padding: 8, fontSize: 12, resize: "none",
                boxSizing: "border-box",
              }}
            />
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "6px 12px",
              fontSize: 12, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={assign}
            disabled={busy || !smeId || smes.length === 0}
            style={{
              background: GOLD, color: "white", border: "none",
              borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: busy || !smeId ? "not-allowed" : "pointer",
              opacity: busy || !smeId ? 0.5 : 1,
            }}
          >
            {busy ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
