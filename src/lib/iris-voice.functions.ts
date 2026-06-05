import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// IRIS voice — connected ElevenLabs voice selected for IRIS.
const IRIS_VOICE_ID = "tnVKC6NjwhdRxoQIfKue";
const MODEL_ID = "eleven_turbo_v2_5";

export const synthesizeIrisLine = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ text: z.string().min(1).max(5000) }).parse(input)
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return { audioBase64: null, mimeType: "audio/mpeg" as const, ok: false as const, error: "ElevenLabs is not connected." };
    }

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${IRIS_VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: data.text,
            model_id: MODEL_ID,
            voice_settings: {
              stability: 0.55,
              similarity_boost: 0.8,
              style: 0.25,
              use_speaker_boost: true,
              speed: 1.15,
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        console.warn(`IRIS TTS unavailable: ${res.status} ${err}`);
        let message = `TTS failed (${res.status})`;
        try {
          const parsed = JSON.parse(err);
          if (parsed?.detail?.message) message = parsed.detail.message;
        } catch {}
        return { audioBase64: null, mimeType: "audio/mpeg" as const, ok: false as const, error: message };
      }

      const buf = await res.arrayBuffer();
      const audioBase64 = Buffer.from(buf).toString("base64");
      return { audioBase64, mimeType: "audio/mpeg" as const, ok: true as const, error: null };
    } catch (err) {
      console.warn("IRIS TTS request failed", err);
      return { audioBase64: null, mimeType: "audio/mpeg" as const, ok: false as const, error: err instanceof Error ? err.message : "Network error" };
    }
  });
