import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// IRIS voice — "Elise" (warm, natural, engaging) from connected ElevenLabs account.
const IRIS_VOICE_ID = "EST9Ui6982FZPSi7gCHi";
const MODEL_ID = "eleven_multilingual_v2";

const IrisVoiceRequest = z.object({
  text: z.string().min(1).max(5000),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/iris-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError("Sign in to use IRIS voice.", 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !auth.user) return jsonError("Sign in to use IRIS voice.", 401);

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return jsonError("ElevenLabs is not connected.", 503);

        const parsed = IrisVoiceRequest.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonError("Invalid voice request.", 400);

        const voiceResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${IRIS_VOICE_ID}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: parsed.data.text,
              model_id: MODEL_ID,
              voice_settings: {
                stability: 0.55,
                similarity_boost: 0.8,
                style: 0.25,
                use_speaker_boost: true,
                speed: 1.0,
              },
            }),
          },
        );

        if (!voiceResponse.ok) {
          const detail = await voiceResponse.text();
          console.warn(`IRIS TTS unavailable: ${voiceResponse.status} ${detail}`);
          return jsonError(detail || `TTS failed (${voiceResponse.status})`, 502);
        }

        return new Response(await voiceResponse.arrayBuffer(), {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});