// ReadAloudToggle — small header button used by the IRIS chat panel.
// When enabled, plays each new assistant message via the secure
// /api/iris-voice endpoint. Hidden entirely when the server reports no
// ElevenLabs key.
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVoiceStatus } from "@/lib/iris-voice.functions";
import { synthesizeIrisVoice, playBlob } from "@/lib/iris/voice-client";

type Msg = { id: string; role: "user" | "assistant" | "system"; text: string };

export function ReadAloudToggle({ messages }: { messages: Msg[] }) {
  const status = useServerFn(getVoiceStatus);
  const statusQ = useQuery({ queryKey: ["iris-voice", "status"], queryFn: () => status() });
  const [enabled, setEnabled] = useState(false);
  const lastSpokenId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialise lastSpoken to the latest existing message so we don't replay history when turning on.
  useEffect(() => {
    if (lastSpokenId.current === null && messages.length > 0) {
      lastSpokenId.current = messages[messages.length - 1].id;
    }
  }, [messages]);

  useEffect(() => {
    if (!enabled) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.id === lastSpokenId.current) return;
    const text = (last.text ?? "").trim();
    if (!text || text === "Drafting…" || text === "Scoring your draft…") return;
    lastSpokenId.current = last.id;

    let cancelled = false;
    (async () => {
      try {
        const blob = await synthesizeIrisVoice({ text: text.slice(0, 4500) });
        if (cancelled) return;
        if (audioRef.current) audioRef.current.pause();
        audioRef.current = playBlob(blob);
      } catch {
        // silent — voice is optional
      }
    })();
    return () => { cancelled = true; };
  }, [messages, enabled]);

  if (!statusQ.data?.configured) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        if (!next && audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      }}
      title={enabled ? "Stop reading IRIS replies aloud" : "Read IRIS replies aloud"}
      className="h-7 w-7 inline-flex items-center justify-center hover:text-white"
      style={{ color: enabled ? "#C49A2B" : "rgba(255,255,255,0.65)" }}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
