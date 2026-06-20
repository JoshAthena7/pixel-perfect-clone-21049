// IRIS voice TTS endpoint. Synthesizes speech via ElevenLabs and returns
// MP3 bytes. Auth-gated by a Supabase bearer token.
//
// Voice id resolution (first match wins):
//   1. Body `voiceId` (when present)
//   2. process.env.IRIS_VOICE_ID  ← set this secret to your custom voice
//   3. Fallback: ElevenLabs "Sarah" (EXAVITQu4vr4xnSDxMaL)
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().min(1).optional(),
});

const FALLBACK_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

export const Route = createFileRoute("/api/iris-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "ElevenLabs is not connected to this project." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) {
          return new Response(
            JSON.stringify({ error: "Sign in to use IRIS voice." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid body." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const voiceId =
          body.voiceId || process.env.IRIS_VOICE_ID || FALLBACK_VOICE_ID;

        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: body.text,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.35,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (!ttsRes.ok) {
          const detail = await ttsRes.text().catch(() => "");
          return new Response(
            JSON.stringify({
              error: `ElevenLabs TTS failed (${ttsRes.status}): ${detail.slice(0, 240)}`,
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(ttsRes.body, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
