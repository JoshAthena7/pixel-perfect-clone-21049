/**
 * CompetitorCard — renders one IRIS-generated competitor profile inside the
 * Mission Setup Wizard Step 4 (and read-only mode in the Briefing Room).
 *
 * The full card JSON is stored in mission_iris_extractions.extracted_value.
 * Per-section edits write a merged JSON to user_override_value so that
 * regenerating the card never clobbers the user's manual corrections.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Edit3, Plus, Sparkles, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddCompetitorIntelModal } from "./AddCompetitorIntelModal";
import type { CompetitorCard as Card } from "@/lib/iris-competitor-intel.functions";

const SECTIONS: Array<{
  key: keyof Card;
  label: string;
  kind: "text" | "list";
}> = [
  { key: "incumbent_status", label: "Incumbent Status", kind: "text" },
  { key: "how_they_win", label: "How They Win", kind: "text" },
  { key: "known_weaknesses", label: "Known Weaknesses", kind: "text" },
  { key: "win_loss_history", label: "Win/Loss History Against Us", kind: "text" },
  { key: "likely_teaming", label: "Likely Teaming", kind: "text" },
  { key: "pricing_posture", label: "Pricing Posture", kind: "text" },
  { key: "key_personnel", label: "Key Personnel", kind: "list" },
  { key: "recent_signals", label: "Recent Signals", kind: "list" },
];

export function CompetitorCard({
  card,
  missionId,
  extractionId,
  readOnly = false,
  onChanged,
}: {
  card: Card;
  missionId: string;
  extractionId: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [showAddIntel, setShowAddIntel] = useState(false);

  const threatStyle = useMemo(() => {
    switch (card.threat_level) {
      case "HIGH":
        return { bg: "rgba(239,68,68,0.15)", color: "#fca5a5", label: "🔴 HIGH" };
      case "MEDIUM":
        return { bg: "rgba(234,179,8,0.18)", color: "#fde68a", label: "🟡 MEDIUM" };
      default:
        return { bg: "rgba(16,185,129,0.15)", color: "#6ee7b7", label: "🟢 LOW" };
    }
  }, [card.threat_level]);

  async function saveSection(sectionKey: string) {
    const merged: Card = { ...card, [sectionKey]:
      sectionKey === "key_personnel" || sectionKey === "recent_signals"
        ? draft.split("\n").map((s) => s.trim()).filter(Boolean)
        : draft.trim(),
    };
    await supabase
      .from("mission_iris_extractions")
      .update({
        user_override_value: JSON.stringify(merged),
        overridden_by_user: true,
      })
      .eq("id", extractionId);
    setEditing(null);
    onChanged?.();
  }

  function startEdit(sectionKey: string, current: string | string[]) {
    setEditing(sectionKey);
    setDraft(Array.isArray(current) ? current.join("\n") : current);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-start justify-between gap-4 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-[18px] font-medium text-white truncate">
              {card.competitor_name}
            </h3>
            <span
              className="text-[12px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: threatStyle.bg, color: threatStyle.color }}
            >
              {threatStyle.label}
            </span>
          </div>
          <p className="text-[12px] text-white/55 mt-1">
            IRIS confidence:{" "}
            <span className="text-white/80 capitalize">{card.confidence_level}</span> (based on{" "}
            {card.source_count} source record{card.source_count === 1 ? "" : "s"})
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAddIntel(true)}
            className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded border border-white/15 text-white/80 hover:bg-white/5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> Add Intelligence
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="divide-y divide-white/5">
        {SECTIONS.map((s) => {
          const value = card[s.key] as string | string[];
          const isOpen = open[s.key] ?? true;
          const isEditing = editing === s.key;
          const isEmpty =
            s.kind === "list"
              ? !(Array.isArray(value) && value.length > 0)
              : typeof value === "string" &&
                (!value.trim() || value.includes("No intelligence on file"));
          return (
            <div key={s.key as string} className="px-5 py-3.5">
              <button
                type="button"
                onClick={() => setOpen({ ...open, [s.key]: !isOpen })}
                className="w-full flex items-center gap-2 text-left"
              >
                <span
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(196,154,43,0.15)", color: "#fde68a" }}
                  title="Generated by IRIS"
                >
                  <Sparkles className="h-2.5 w-2.5 inline -mt-0.5" /> IRIS
                </span>
                <span className="text-[14px] font-medium text-white flex-1">{s.label}</span>
                {isEmpty && (
                  <span className="text-[10.5px] text-white/40">no data</span>
                )}
                {!readOnly && !isEditing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(s.key as string, value);
                    }}
                    className="text-white/40 hover:text-white p-1 rounded"
                    title="Edit"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 text-white/40 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
              </button>

              {isOpen && (
                <div className="mt-2 pl-[52px]">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={s.kind === "list" ? 5 : 4}
                        className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-[14px] text-white focus:outline-none focus:border-amber-400/60"
                        placeholder={s.kind === "list" ? "One item per line" : ""}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditing(null)}
                          className="text-[12px] px-3 py-1 rounded border border-white/15 text-white/70 hover:bg-white/5"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveSection(s.key as string)}
                          className="text-[12px] px-3 py-1 rounded font-medium"
                          style={{ background: "#C49A2B", color: "#0D1B3E" }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : s.kind === "list" ? (
                    Array.isArray(value) && value.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-1 text-[14px] text-white/85">
                        {value.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[14px] text-white/50 italic">
                        No intelligence on file — add via the button above.
                      </p>
                    )
                  ) : (
                    <p className="text-[14px] text-white/85 whitespace-pre-wrap">
                      {(value as string) ||
                        "No intelligence on file — add via the button above."}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* HOW WE BEAT THEM */}
      <div
        className="px-5 py-4 border-t"
        style={{
          background: "linear-gradient(180deg, rgba(196,154,43,0.10), rgba(196,154,43,0.04))",
          borderColor: "rgba(196,154,43,0.35)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: "#fde68a" }} />
            <h4 className="text-[14px] font-medium tracking-wide" style={{ color: "#fde68a" }}>
              HOW WE BEAT THEM — IRIS Counter-Strategy
            </h4>
          </div>
          {!readOnly && editing !== "how_we_beat_them" && (
            <button
              onClick={() => startEdit("how_we_beat_them", card.how_we_beat_them)}
              className="text-[11.5px] text-white/70 hover:text-white inline-flex items-center gap-1"
            >
              <Edit3 className="h-3 w-3" /> Edit Counter-Strategy
            </button>
          )}
        </div>
        {editing === "how_we_beat_them" ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-[14px] text-white focus:outline-none focus:border-amber-400/60"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="text-[12px] px-3 py-1 rounded border border-white/15 text-white/70 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => saveSection("how_we_beat_them")}
                className="text-[12px] px-3 py-1 rounded font-medium"
                style={{ background: "#C49A2B", color: "#0D1B3E" }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[14px] text-white leading-relaxed">{card.how_we_beat_them}</p>
        )}
      </div>

      {showAddIntel && (
        <AddCompetitorIntelModal
          competitorName={card.competitor_name}
          missionId={missionId}
          onClose={() => setShowAddIntel(false)}
          onSaved={() => {
            setShowAddIntel(false);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
