// IRIS voice TTS endpoint. Synthesizes speech via ElevenLabs and returns
// MP3 bytes. Auth-gated by a Supabase bearer token. The API key NEVER leaves
// the server.
//
// Accepted body:
//   text:        string (required, 1-5000 chars)
//   voiceId:     string (optional, overrides config / IRIS_VOICE_ID)
//   modelId:     enum   (optional, defaults to eleven_multilingual_v2)
//   settings:    { stability, similarity_boost, style, use_speaker_boost, speed }
//                (all optional, sensible defaults)
//   streaming:   boolean (optional, true = /stream endpoint for low latency)
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SettingsSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  use_speaker_boost: z.boolean().optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
});

const BodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().min(1).optional(),
  modelId: z
    .enum([
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_flash_v2_5",
      "eleven_monolingual_v1",
    ])
    .optional(),
  settings: SettingsSchema.optional(),
  streaming: z.boolean().optional(),
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

        const voiceId = body.voiceId || process.env.IRIS_VOICE_ID || FALLBACK_VOICE_ID;
        const modelId = body.modelId ?? "eleven_multilingual_v2";
        const s = body.settings ?? {};
        const streaming = body.streaming === true;
        const path = streaming
          ? `text-to-speech/${voiceId}/stream`
          : `text-to-speech/${voiceId}`;

        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/${path}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: body.text,
              model_id: modelId,
              voice_settings: {
                stability: s.stability ?? 0.55,
                similarity_boost: s.similarity_boost ?? 0.75,
                style: s.style ?? 0.2,
                use_speaker_boost: s.use_speaker_boost ?? true,
                speed: s.speed ?? 1.0,
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
