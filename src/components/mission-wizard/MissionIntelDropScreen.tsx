import { useEffect, useRef, useState } from "react";
import { Paperclip, Mic, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type Tag = "Stakeholder" | "Competitor" | "Political" | "Relationship" | "Market" | "Capture" | "General";

type Entry = {
  id: string;
  text: string;
  attachment?: string;
  kind: "text" | "file" | "voice";
  tag: Tag | "classifying";
};

const TAG_COLORS: Record<Tag, { bg: string; fg: string; border: string }> = {
  Stakeholder:  { bg: "rgba(196,154,43,0.12)", fg: "#E8C26B", border: "rgba(196,154,43,0.35)" },
  Competitor:   { bg: "rgba(229,115,115,0.12)", fg: "#F2A6A6", border: "rgba(229,115,115,0.35)" },
  Political:    { bg: "rgba(123,150,229,0.12)", fg: "#B5C7F2", border: "rgba(123,150,229,0.35)" },
  Relationship: { bg: "rgba(140,200,150,0.12)", fg: "#B7E0BF", border: "rgba(140,200,150,0.35)" },
  Market:       { bg: "rgba(180,140,220,0.12)", fg: "#D3BEEA", border: "rgba(180,140,220,0.35)" },
  Capture:      { bg: "rgba(230,180,120,0.12)", fg: "#F0CB9C", border: "rgba(230,180,120,0.35)" },
  General:      { bg: "rgba(255,255,255,0.06)", fg: "#C7D2E2", border: "rgba(255,255,255,0.14)" },
};

function classify(text: string): Tag {
  const t = text.toLowerCase();
  if (/(senator|governor|legislat|policy|admin|political|election|caucus|appoint)/.test(t)) return "Political";
  if (/(competitor|vendor|incumbent|deloitte|accenture|kpmg|mckinsey|pwc|ey|bcg|bain)/.test(t)) return "Competitor";
  if (/(commissioner|director|cio|ceo|cfo|secretary|stakeholder|champion|sponsor)/.test(t)) return "Stakeholder";
  if (/(relationship|history|worked with|prior engagement|trust|met with|coffee|dinner|call with)/.test(t)) return "Relationship";
  if (/(market|industry|sector|trend|growth|spend|budget|funding|tam|sam)/.test(t)) return "Market";
  if (/(capture|strategy|theme|win|approach|positioning|differentiat|plan)/.test(t)) return "Capture";
  return "General";
}

export function MissionIntelDropScreen({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const persist = async (entry: Entry, tag: Tag) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("iris_memories").insert({
        title: `${tag} note`,
        content: entry.text,
        category: tag.toLowerCase(),
        tags: ["intel_drop", tag.toLowerCase()],
        importance: "medium",
        scope: "mission",
        mission_id: missionId,
        source: entry.kind === "voice" ? "wizard_voice" : entry.kind === "file" ? "wizard_file" : "wizard_text",
        created_by: u.user?.id ?? null,
      });
    } catch {
      // best-effort
    }
  };

  const addEntry = (text: string, kind: Entry["kind"], attachment?: string) => {
    if (!text.trim() && !attachment) return;
    const id = `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const stub: Entry = { id, text: text.trim(), attachment, kind, tag: "classifying" };
    setEntries((prev) => [...prev, stub]);
    setDraft("");
    setTimeout(() => {
      const tag = classify(text || attachment || "");
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, tag } : e)));
      void persist({ ...stub, tag }, tag);
    }, 650 + Math.random() * 400);
  };

  const handleFile = async (file: File) => {
    try {
      const path = `${missionId}/intel-drop/${Date.now()}-${file.name}`;
      await supabase.storage.from("atlas-rfp-documents").upload(path, file, { upsert: false });
    } catch {
      /* best-effort */
    }
    addEntry(`Attached: ${file.name}`, "file", file.name);
  };

  const toggleRecord = async () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const seconds = Math.max(1, Math.round(blob.size / 16000));
        addEntry(`Voice note (${seconds}s)`, "voice", "voice-note.webm");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "#E8EEF7" }}>
      {/* Header */}
      <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-white/5">
        <IrisMark size={36} />
        <div className="flex-1">
          <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: "#C49A2B" }}>IRIS</div>
          <div className="text-[15px] text-white/90 mt-1 max-w-[680px] leading-relaxed">
            What else should I know? Drop anything — stakeholder intel, political context, competitor notes,
            relationship history, capture strategy. I'll figure out where it belongs.
          </div>
        </div>
        <button
          onClick={onContinue}
          className="text-[13px] px-4 py-2 rounded-md transition hover:opacity-90"
          style={{ background: entries.length ? "#C49A2B" : "transparent", color: entries.length ? "#0D1B3E" : "#9AA7BD", border: entries.length ? "none" : "1px solid rgba(255,255,255,0.18)" }}
        >
          {entries.length ? "Continue →" : "Skip →"}
        </button>
      </div>

      {/* Entries */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[720px] space-y-3">
          {entries.length === 0 && (
            <div className="text-center text-white/35 text-[13px] py-16">
              Nothing yet. Type, attach, or record below — IRIS will tag it.
            </div>
          )}
          {entries.map((e) => {
            const isClassifying = e.tag === "classifying";
            const palette = isClassifying ? null : TAG_COLORS[e.tag as Tag];
            return (
              <div
                key={e.id}
                className="group flex gap-3 items-start px-4 py-3 rounded-xl animate-[fadeUp_.3s_ease-out]"
                style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {isClassifying ? (
                      <span
                        className="text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1.5"
                        style={{ background: "rgba(196,154,43,0.10)", color: "#C49A2B", border: "1px solid rgba(196,154,43,0.30)" }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#C49A2B" }} />
                        Classifying…
                      </span>
                    ) : (
                      <span
                        className="text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: palette!.bg, color: palette!.fg, border: `1px solid ${palette!.border}` }}
                      >
                        {e.tag}
                      </span>
                    )}
                    {e.kind !== "text" && (
                      <span className="text-[10.5px] uppercase tracking-wider text-white/40">
                        {e.kind === "voice" ? "Voice" : "Attachment"}
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] text-white/90 whitespace-pre-wrap break-words">{e.text}</div>
                </div>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white/80 transition"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 px-6 py-4">
        <div className="mx-auto w-full max-w-[720px]">
          <div
            className="flex items-end gap-2 rounded-2xl px-3 py-2"
            style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition"
              title="Attach a file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={toggleRecord}
              className={cn(
                "p-2 rounded-lg transition",
                recording ? "text-red-300 bg-red-500/10" : "text-white/60 hover:text-white hover:bg-white/5"
              )}
              title={recording ? "Stop recording" : "Record a voice note"}
            >
              <Mic className={cn("h-4 w-4", recording && "animate-pulse")} />
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (draft.trim()) addEntry(draft, "text");
                }
              }}
              rows={2}
              placeholder={recording ? "Recording…" : "Drop anything. One thought or a thousand — IRIS will sort it."}
              className="flex-1 bg-transparent outline-none resize-none py-2 text-[14.5px] placeholder:text-white/35 min-h-[44px]"
              style={{ maxHeight: 200 }}
              disabled={recording}
            />
            <button
              type="button"
              onClick={() => draft.trim() && addEntry(draft, "text")}
              disabled={!draft.trim()}
              className="p-2 rounded-lg transition disabled:opacity-40"
              style={{ background: draft.trim() ? "#C49A2B" : "transparent", color: draft.trim() ? "#0D1B3E" : "#9AA7BD" }}
              title="Add"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/35">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" style={{ color: "#C49A2B" }} />
              <span>IRIS auto-classifies each entry</span>
            </div>
            <div>⌘/Ctrl + Enter to add</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
