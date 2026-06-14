import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  findExperts,
  addExpertToThread,
  getSmeProfilesByUserIds,
  type ExpertMatch,
  type SmeProfileSummary,
} from "@/lib/phone-a-friend.functions";
import { Eye, MessageCircle, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
};

const QUICK_PROMPTS = [
  "Who has NJ CSOC experience?",
  "Who has worked in New Jersey?",
  "Who understands crisis services?",
  "Who has LTSS operational experience?",
  "Who has written this type of section before?",
];

export function PhoneAFriendDialog({
  open,
  onOpenChange,
  missionId,
  questionId,
  questionNumber,
  questionText,
}: Props) {
  const find = useServerFn(findExperts);
  const addToThread = useServerFn(addExpertToThread);
  const fetchSmeProfiles = useServerFn(getSmeProfilesByUserIds);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ExpertMatch[]>([]);
  const [irisMessage, setIrisMessage] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [smeProfiles, setSmeProfiles] = useState<Record<string, SmeProfileSummary>>({});
  const ranAutoSearch = useRef<string | null>(null);

  const headerContext = useMemo(() => {
    const q = questionText?.trim();
    if (!q) return "Finding expertise for this mission.";
    const num = questionNumber ? `${questionNumber} — ` : "";
    return `Finding expertise for: ${num}${q.slice(0, 80)}${q.length > 80 ? "…" : ""}`;
  }, [questionNumber, questionText]);

  const runSearch = async (q: string) => {
    if (!missionId || !q.trim()) return;
    setLoading(true);
    setQuery(q);
    try {
      const res = await find({
        data: { missionId, questionId: questionId ?? undefined, query: q.trim() },
      });
      setMatches(res.matches);
      setIrisMessage(res.iris_message);
      setSectionName(res.context?.sectionName ?? "");
    } catch (e: any) {
      toast.error("IRIS search failed", { description: e?.message ?? String(e) });
      setMatches([]);
      setIrisMessage("");
    } finally {
      setLoading(false);
    }
  };

  // Auto-search on open
  useEffect(() => {
    if (!open || !missionId) {
      if (!open) ranAutoSearch.current = null;
      return;
    }
    const key = `${missionId}:${questionId ?? "none"}`;
    if (ranAutoSearch.current === key) return;
    ranAutoSearch.current = key;
    const seed =
      [questionText, sectionName].filter(Boolean).join(" — ") ||
      "Best experts for this mission";
    setMatches([]);
    setIrisMessage("");
    void runSearch(seed.slice(0, 240));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, missionId, questionId]);

  const handleAdd = async (m: ExpertMatch) => {
    if (!missionId || !questionId) {
      toast.error("Open this from a question to add to its Thread.");
      return;
    }
    setAddingId(m.user_id);
    try {
      await addToThread({
        data: {
          missionId,
          questionId,
          questionNumber: questionNumber ?? undefined,
          expertUserId: m.user_id,
          expertName: m.name,
          whyIrisRecommends: m.why_iris_recommends || "recommended by IRIS",
        },
      });
      toast.success(`${m.name} added to Thread`);
    } catch (e: any) {
      toast.error("Could not add to Thread", { description: e?.message ?? String(e) });
    } finally {
      setAddingId(null);
    }
  };

  const handleMessage = (m: ExpertMatch) => {
    const context = questionText
      ? `Q ${questionNumber ?? ""} — ${questionText}`.trim()
      : "this mission question";
    const subject = `Quick brain check on ${context}`;
    const body = `Hi ${m.name.split(" ")[0]},\n\nIRIS recommended you for ${context}. ${m.consultation_suggestion || ""}\n\nGot 10 minutes this week?`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl p-0 gap-0 border-0 overflow-hidden"
        style={{ background: "#0a1320", color: "rgba(255,255,255,0.9)" }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div>
            <div className="text-white" style={{ fontSize: 14, fontWeight: 500 }}>
              Phone a Friend
            </div>
            <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              {headerContext}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/40 hover:text-white/80"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* IRIS intro */}
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: "rgba(127,119,221,0.10)",
              border: "1px solid rgba(127,119,221,0.25)",
              color: "rgba(210,205,255,0.92)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: "#b7afff", fontWeight: 600 }}>IRIS · </span>
            Tell me what you need. I search profiles, resumes, prior engagements, certifications,
            and program experience across the entire Athena Collective. Not job titles — actual
            demonstrated work.
          </div>

          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void runSearch(query);
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Search size={14} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Who has CSOC experience? Who understands NC Tailored Plans? Who has operated a Medicaid health plan?"
              className="flex-1 bg-transparent outline-none text-white placeholder:text-white/30"
              style={{ fontSize: 12 }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={loading || !query.trim()}
              style={{ height: 26, fontSize: 11 }}
            >
              Search
            </Button>
          </form>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void runSearch(p)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                style={{
                  fontSize: 10,
                  background: "rgba(74,111,165,0.10)",
                  border: "1px solid rgba(74,111,165,0.28)",
                  color: "#9bc0e8",
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="space-y-2 pt-1">
            {loading && (
              <div
                className="flex items-center gap-2 px-3 py-3 rounded-lg"
                style={{
                  background: "rgba(127,119,221,0.06)",
                  border: "1px solid rgba(127,119,221,0.18)",
                }}
              >
                <Eye
                  size={14}
                  className="animate-pulse"
                  style={{ color: "#b7afff" }}
                />
                <span style={{ fontSize: 12, color: "rgba(210,205,255,0.85)" }}>
                  IRIS is searching the Athena Collective…
                </span>
              </div>
            )}

            {!loading && matches.length === 0 && (
              <div
                className="px-3 py-4 text-center rounded-lg italic"
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  border: "1px dashed rgba(255,255,255,0.1)",
                }}
              >
                No strong matches found for this query. Try different terms or broaden the
                expertise area.
              </div>
            )}

            {!loading &&
              matches.map((m) => (
                <div
                  key={m.user_id}
                  className="rounded-lg p-3"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 36,
                        height: 36,
                        background: "rgba(127,119,221,0.18)",
                        color: "#d2cdff",
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid rgba(127,119,221,0.35)",
                      }}
                    >
                      {m.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white" style={{ fontSize: 13, fontWeight: 500 }}>
                        {m.name}
                      </div>
                      <div
                        className="mt-1 italic"
                        style={{ fontSize: 11, color: "rgba(200,193,255,0.85)", lineHeight: 1.5 }}
                      >
                        <span style={{ color: "#b7afff", fontStyle: "normal", fontWeight: 600 }}>
                          IRIS ·{" "}
                        </span>
                        {m.why_iris_recommends}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{
                            fontSize: 10,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          {m.top_expertise_match}
                        </span>
                        {m.consultation_suggestion && (
                          <span style={{ fontSize: 10, color: "#C49A2B" }}>
                            Ask: {m.consultation_suggestion}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAdd(m)}
                          disabled={addingId === m.user_id || !questionId}
                          style={{ height: 24, fontSize: 10 }}
                        >
                          <Plus size={11} className="mr-1" />
                          {addingId === m.user_id ? "Adding…" : "Add to Thread"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMessage(m)}
                          style={{ height: 24, fontSize: 10 }}
                        >
                          <MessageCircle size={11} className="mr-1" />
                          Message
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {!loading && irisMessage && (
              <div
                className="rounded-lg px-3 py-2 mt-2"
                style={{
                  background: "rgba(127,119,221,0.08)",
                  border: "1px solid rgba(127,119,221,0.22)",
                  color: "rgba(210,205,255,0.92)",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "#b7afff", fontWeight: 600 }}>IRIS · </span>
                {irisMessage}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
