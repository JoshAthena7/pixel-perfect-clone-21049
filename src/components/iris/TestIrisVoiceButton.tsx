import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Volume2, Loader2, Check, AlertCircle } from "lucide-react";
import { synthesizeIrisLine } from "@/lib/iris-voice.functions";

const SAMPLE_LINE =
  "IRIS voice check confirmed. All systems are online and ready for briefing.";

type Status = "idle" | "loading" | "ok" | "error";

export function TestIrisVoiceButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const speak = useServerFn(synthesizeIrisLine);

  const handleClick = async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await speak({ data: { text: SAMPLE_LINE } });
      if (!res.ok || !res.audioBase64) {
        setStatus("error");
        setError("TTS unavailable — check ElevenLabs connection.");
        return;
      }
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      audio.onended = () => setStatus("idle");
      await audio.play();
      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const label =
    status === "loading"
      ? "Synthesizing…"
      : status === "ok"
      ? "Voice OK"
      : status === "error"
      ? "Voice failed"
      : "Test IRIS Voice";

  const Icon =
    status === "loading"
      ? Loader2
      : status === "ok"
      ? Check
      : status === "error"
      ? AlertCircle
      : Volume2;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface/70 disabled:opacity-60"
      >
        <Icon className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
        {label}
      </button>
      {status === "error" && error && (
        <span className="text-[11px] text-destructive">{error}</span>
      )}
    </div>
  );
}
