import { useState } from "react";
import { Volume2, Loader2, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SAMPLE_LINE =
  "IRIS voice check confirmed. All systems are online and ready for briefing.";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

type Status = "idle" | "loading" | "ok" | "error";

export function TestIrisVoiceButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setStatus("loading");
    setError(null);
    const audio = new Audio(SILENT_WAV);
    audio.preload = "auto";
    const unlockPlayback = audio.play().catch(() => undefined);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sign in to use IRIS voice.");

      const response = await fetch("/api/iris-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: SAMPLE_LINE }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `TTS failed (${response.status})`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      await unlockPlayback;
      audio.src = audioUrl;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setStatus("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setStatus("error");
        setError("Audio playback failed.");
      };
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
