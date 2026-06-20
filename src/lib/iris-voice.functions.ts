// IRIS Voice server fns: voice configuration probe + voice library listing.
// TTS synthesis stays in the existing /api/iris-voice raw HTTP route so we
// can stream MP3 bytes back to the browser.
import { createServerFn } from "@tanstack/react-start";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export type IrisVoice = {
  voice_id: string;
  name: string;
  description: string | null;
  labels: Record<string, string>;
  preview_url: string | null;
  category: string;
};

const FALLBACK_VOICES: IrisVoice[] = [
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Clear and professional. The default IRIS voice.", labels: { accent: "American", age: "young adult", gender: "female", "use case": "narration" }, preview_url: null, category: "premade" },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Deep and authoritative.", labels: { accent: "British", age: "middle aged", gender: "male", "use case": "news" }, preview_url: null, category: "premade" },
  { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "British accent. Precise.", labels: { accent: "British", age: "young adult", gender: "female", "use case": "narration" }, preview_url: null, category: "premade" },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Confident and direct.", labels: { accent: "British", age: "middle aged", gender: "female", "use case": "news" }, preview_url: null, category: "premade" },
  { voice_id: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Warm and measured.", labels: { accent: "American", age: "middle aged", gender: "male", "use case": "documentary" }, preview_url: null, category: "premade" },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep and calm.", labels: { accent: "American", age: "middle aged", gender: "male", "use case": "narration" }, preview_url: null, category: "premade" },
];

/** Whether the server has an ElevenLabs key. Never returns the key. */
export const getVoiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env.ELEVENLABS_API_KEY) };
});

/** Fetch the workspace voice library from ElevenLabs. Falls back to defaults. */
export const listIrisVoices = createServerFn({ method: "GET" }).handler(async (): Promise<IrisVoice[]> => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return FALLBACK_VOICES;
  try {
    const r = await fetch(`${ELEVENLABS_BASE}/voices`, { headers: { "xi-api-key": key } });
    if (!r.ok) return FALLBACK_VOICES;
    const j = (await r.json()) as { voices?: IrisVoice[] };
    const voices = j.voices ?? [];
    return voices.length > 0 ? voices : FALLBACK_VOICES;
  } catch {
    return FALLBACK_VOICES;
  }
});
