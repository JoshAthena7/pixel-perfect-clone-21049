/**
 * Modal: log new competitive intelligence for a competitor.
 * Inserts into `insights` with insight_type='competitive_intel' and tags the
 * competitor name so future card regenerations pick it up.
 */
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AddCompetitorIntelModal({
  competitorName,
  missionId,
  onClose,
  onSaved,
}: {
  competitorName: string;
  missionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [confidence, setConfidence] = useState<"high" | "med" | "low">("med");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) {
      setError("Add some content first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insErr } = await supabase.from("insights").insert({
      mission_id: missionId,
      insight_type: "competitive_intel",
      content: content.trim(),
      source: source.trim() || null,
      confidence,
      tags: [competitorName],
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0D1B3E] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-medium text-white">Add Intelligence</h3>
            <p className="text-[12.5px] text-white/55 mt-0.5">
              About <span className="text-amber-300">{competitorName}</span>. Trains IRIS for every
              future mission that encounters this competitor.
            </p>
          </div>
          <button onClick={onClose} className="text-white/55 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] tracking-[0.14em] text-white/55 mb-1 block">
              What do you know?
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="e.g. Lost the OH MyCare recompete in 2024 over staffing churn complaints."
              className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-amber-400/60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] tracking-[0.14em] text-white/55 mb-1 block">
                Source (optional)
              </span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="state hearing transcript, capture call…"
                className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-amber-400/60"
              />
            </label>
            <label className="block">
              <span className="text-[12px] tracking-[0.14em] text-white/55 mb-1 block">
                Confidence
              </span>
              <select
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as typeof confidence)}
                className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-amber-400/60"
              >
                <option value="high" className="bg-[#0D1B3E]">High</option>
                <option value="med" className="bg-[#0D1B3E]">Medium</option>
                <option value="low" className="bg-[#0D1B3E]">Low</option>
              </select>
            </label>
          </div>

          {error && <div className="text-[12.5px] text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="text-[14px] px-3 py-1.5 rounded border border-white/15 text-white/70 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 text-[14px] px-4 py-1.5 rounded font-medium disabled:opacity-50"
              style={{ background: "#C49A2B", color: "#0D1B3E" }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving…" : "Save intel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
