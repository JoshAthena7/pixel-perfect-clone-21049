// Browser helper for the secure /api/iris-voice route. Adds the bearer token
// from the current Supabase session and returns an MP3 Blob (or throws).
import { supabase } from "@/integrations/supabase/client";

export type IrisVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
};

export type IrisVoiceModel =
  | "eleven_multilingual_v2"
  | "eleven_turbo_v2_5"
  | "eleven_flash_v2_5"
  | "eleven_monolingual_v1";

export const IRIS_PREVIEW_TEXT =
  "I have reviewed the ORACLE intelligence for this question. The evaluator will prioritize service coordination specificity over general process descriptions. Here is what matters most for earning their trust.";

export async function synthesizeIrisVoice(opts: {
  text: string;
  voiceId?: string;
  modelId?: IrisVoiceModel;
  settings?: IrisVoiceSettings;
  streaming?: boolean;
}): Promise<Blob> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in to use IRIS voice.");
  const res = await fetch("/api/iris-voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Voice preview failed (${res.status}).`);
  }
  return res.blob();
}

export function playBlob(blob: Blob): HTMLAudioElement {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play().catch(() => undefined);
  return audio;
}
