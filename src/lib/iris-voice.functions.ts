import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// IRIS voice — "George" (authoritative narrator). Change here to swap voices.
const IRIS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_turbo_v2_5";

export const synthesizeIrisLine = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ text: z.string().min(1).max(5000) }).parse(input)
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabs is not connected");
    }

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
            speed: 1.0,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`IRIS TTS failed: ${res.status} ${err}`);
    }

    const buf = await res.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString("base64");
    return { audioBase64, mimeType: "audio/mpeg" as const };
  });
