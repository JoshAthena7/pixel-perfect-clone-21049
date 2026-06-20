import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionHeader, FieldLabel, FieldDesc, STUDIO_CARD, type TabSaveFn } from "./shared";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getVoiceStatus, listIrisVoices, type IrisVoice } from "@/lib/iris-voice.functions";
import { synthesizeIrisVoice, playBlob, IRIS_PREVIEW_TEXT, type IrisVoiceModel } from "@/lib/iris/voice-client";
import { toast } from "sonner";
import { Play, Square, Loader2 } from "lucide-react";

const GOLD = "#C49A2B";

const MODELS: Array<{ id: IrisVoiceModel; title: string; sub: string; desc: string; rec: string }> = [
  { id: "eleven_multilingual_v2", title: "eleven_multilingual_v2", sub: "Highest quality",
    desc: "29 languages. Best for brief read-aloud and non-real-time output.", rec: "Brief read-aloud" },
  { id: "eleven_turbo_v2_5", title: "eleven_turbo_v2_5", sub: "Low latency",
    desc: "~300ms response. Best for conversational Voice Mode.", rec: "Voice Mode chat" },
  { id: "eleven_flash_v2_5", title: "eleven_flash_v2_5", sub: "Ultra-fast",
    desc: "~75ms response. Streaming optimized.", rec: "Real-time conversation" },
  { id: "eleven_monolingual_v1", title: "eleven_monolingual_v1", sub: "Classic English",
    desc: "English only. Highly stable.", rec: "Consistent delivery" },
];

export function VoiceStudioTab({
  config,
  onSave,
  saving,
}: {
  config: Record<string, unknown>;
  onSave: TabSaveFn;
  saving: boolean;
}) {
  const status = useServerFn(getVoiceStatus);
  const list = useServerFn(listIrisVoices);
  const statusQ = useQuery({ queryKey: ["iris-voice", "status"], queryFn: () => status() });
  const voicesQ = useQuery({ queryKey: ["iris-voice", "voices"], queryFn: () => list() });
  const configured = Boolean(statusQ.data?.configured);

  const [voiceId, setVoiceId] = useState(String(config.elevenlabs_voice_id ?? "EXAVITQu4vr4xnSDxMaL"));
  const [modelId, setModelId] = useState<IrisVoiceModel>((config.elevenlabs_model_id as IrisVoiceModel) ?? "eleven_multilingual_v2");
  const [stab, setStab] = useState<number>(Number(config.elevenlabs_stability ?? 0.55));
  const [sim, setSim] = useState<number>(Number(config.elevenlabs_similarity_boost ?? 0.75));
  const [style, setStyle] = useState<number>(Number(config.elevenlabs_style ?? 0.2));
  const [boost, setBoost] = useState<boolean>(Boolean(config.elevenlabs_use_speaker_boost ?? true));
  const [speed, setSpeed] = useState<number>(Number(config.elevenlabs_speed ?? 1.0));
  const [streaming, setStreaming] = useState<boolean>(Boolean(config.elevenlabs_streaming ?? true));
  const [customOpen, setCustomOpen] = useState(false);
  const [customId, setCustomId] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPreviewingId(null); setTesting(false);
  };

  const currentSettings = { stability: stab, similarity_boost: sim, style, use_speaker_boost: boost, speed };

  const previewVoice = async (id: string) => {
    if (!configured) { toast("Configure ELEVENLABS_API_KEY to enable previews."); return; }
    stopAudio();
    setPreviewingId(id);
    try {
      const blob = await synthesizeIrisVoice({ text: IRIS_PREVIEW_TEXT, voiceId: id, modelId, settings: currentSettings, streaming: false });
      const audio = playBlob(blob);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPreviewingId(null));
    } catch (e) {
      setPreviewingId(null);
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  const testIris = async () => {
    if (!configured) { toast("Add ELEVENLABS_API_KEY to enable voice preview."); return; }
    if (testing) { stopAudio(); return; }
    setTesting(true);
    try {
      const blob = await synthesizeIrisVoice({ text: IRIS_PREVIEW_TEXT, voiceId, modelId, settings: currentSettings, streaming });
      const audio = playBlob(blob);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setTesting(false));
    } catch (e) {
      setTesting(false);
      toast.error(e instanceof Error ? e.message : "Voice preview failed — check your API key and voice ID.");
    }
  };

  useEffect(() => () => stopAudio(), []);

  const saveAll = () => {
    onSave({
      elevenlabs_voice_id: voiceId,
      elevenlabs_model_id: modelId,
      elevenlabs_stability: stab,
      elevenlabs_similarity_boost: sim,
      elevenlabs_style: style,
      elevenlabs_use_speaker_boost: boost,
      elevenlabs_speed: speed,
      elevenlabs_streaming: streaming,
    });
  };

  const voices: IrisVoice[] = voicesQ.data ?? [];
  const customSelected = voiceId && !voices.some((v) => v.voice_id === voiceId);

  return (
    <div className="space-y-6">
      <SectionHeader title="⚡ VOICE STUDIO" subtitle="Powered by ElevenLabs — every parameter is live and wired to the real API." />

      {/* Status banner */}
      {configured ? (
        <div className="rounded text-[10px] px-3 py-2"
             style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", color: "rgba(74,222,128,0.9)" }}>
          ● ElevenLabs connected — voice controls are live.
        </div>
      ) : (
        <div className="rounded text-[10px] px-3 py-2"
             style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "rgba(245,158,11,0.95)" }}>
          ⚠ ElevenLabs key not detected on the server. Connect it under Connectors to enable voice preview.
        </div>
      )}

      {/* Voice library */}
      <div className={STUDIO_CARD}>
        <FieldLabel>IRIS VOICE</FieldLabel>
        <FieldDesc>Select the voice IRIS uses in Voice Mode and brief read-aloud.</FieldDesc>

        {customSelected && (
          <div className="mb-2 rounded border p-3"
               style={{ borderColor: "rgba(196,154,43,0.8)", background: "rgba(196,154,43,0.06)" }}>
            <div className="text-[11px] font-semibold text-white">Custom voice</div>
            <div className="text-[9px] text-white/60 mt-1 font-mono">{voiceId}</div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
          {voicesQ.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[90px] rounded-md bg-white/[0.03] border border-white/10 animate-pulse" />
              ))
            : voices.map((v) => {
                const selected = v.voice_id === voiceId;
                return (
                  <button type="button" key={v.voice_id}
                    onClick={() => setVoiceId(v.voice_id)}
                    className="rounded-md p-3 text-left transition-colors relative"
                    style={{
                      background: selected ? "rgba(196,154,43,0.06)" : "rgba(255,255,255,0.03)",
                      border: `${selected ? 1.5 : 1}px solid ${selected ? "rgba(196,154,43,0.8)" : "rgba(255,255,255,0.08)"}`,
                      width: "100%", minHeight: 90,
                    }}>
                    <div className="text-[12px] font-semibold text-white">{v.name}</div>
                    <div className="flex gap-1 flex-wrap mt-1 mb-1">
                      {(["accent", "gender", "age"] as const).map((k) => v.labels?.[k] ? (
                        <span key={k} className="text-[8px] text-white/60 px-1.5 py-[2px] rounded"
                          style={{ background: "rgba(255,255,255,0.06)" }}>{v.labels[k]}</span>
                      ) : null)}
                    </div>
                    <div className="text-[9px] text-white/50 line-clamp-2">{v.description ?? ""}</div>
                    <div className="absolute bottom-2 right-2">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); previewingId === v.voice_id ? stopAudio() : previewVoice(v.voice_id); }}
                        className="text-[9px] font-medium flex items-center gap-1" style={{ color: GOLD }}>
                        {previewingId === v.voice_id ? <><Square className="w-2.5 h-2.5" /> Stop</> : <><Play className="w-2.5 h-2.5" /> Preview</>}
                      </button>
                    </div>
                  </button>
                );
              })}
        </div>

        <div className="mt-3">
          {!customOpen ? (
            <button type="button" className="text-[10px] text-white/60 hover:text-white"
              onClick={() => setCustomOpen(true)}>+ Use custom voice ID</button>
          ) : (
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
                placeholder="Paste an ElevenLabs voice_id…"
                value={customId} onChange={(e) => setCustomId(e.target.value)} />
              <button type="button" className="px-2.5 py-1.5 rounded bg-white/10 text-[10px]"
                onClick={() => { if (customId.trim()) { setVoiceId(customId.trim()); setCustomId(""); setCustomOpen(false); }}}>
                Use
              </button>
              <button type="button" className="px-2.5 py-1.5 text-[10px] text-white/50" onClick={() => setCustomOpen(false)}>cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Model selector */}
      <div className={STUDIO_CARD}>
        <FieldLabel>SPEECH MODEL</FieldLabel>
        <FieldDesc>Choose based on your priority: quality vs speed.</FieldDesc>
        <div className="grid grid-cols-2 gap-2.5">
          {MODELS.map((m) => {
            const sel = m.id === modelId;
            return (
              <button type="button" key={m.id} onClick={() => setModelId(m.id)}
                className="text-left rounded-md p-3"
                style={{
                  background: sel ? "rgba(196,154,43,0.06)" : "rgba(255,255,255,0.03)",
                  border: `${sel ? 1.5 : 1}px solid ${sel ? "rgba(196,154,43,0.8)" : "rgba(255,255,255,0.08)"}`,
                  minHeight: 80,
                }}>
                <div className="text-[11px] font-semibold text-white">{m.title}</div>
                <div className="text-[9px] mt-0.5" style={{ color: GOLD }}>{m.sub}</div>
                <div className="text-[9px] text-white/55 mt-1">{m.desc}</div>
                <div className="text-[8px] mt-1.5" style={{ color: GOLD }}>RECOMMENDED: <span className="text-white/70">{m.rec}</span></div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Character sliders */}
      <div className={STUDIO_CARD + " space-y-5"}>
        <FieldLabel>VOICE CHARACTER</FieldLabel>

        <SliderRow label="STABILITY" value={stab} setValue={setStab} min={0} max={1} step={0.01}
          left="Expressive" right="Consistent"
          desc="Lower = more emotional and varied delivery. Higher = more consistent. For a professional intelligence voice, 0.5–0.65 is ideal." />

        <SliderRow label="VOICE ADHERENCE" value={sim} setValue={setSim} min={0} max={1} step={0.01}
          left="Flexible" right="Faithful"
          desc="How closely IRIS matches the selected voice model. Higher values preserve more of the voice's distinctive character." />

        <SliderRow label="STYLE INTENSITY" value={style} setValue={setStyle} min={0} max={1} step={0.01}
          left="Subtle" right="Expressive"
          desc="Amplifies the voice's natural expressiveness. Keep low (0.15–0.25) for professional delivery." />

        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>SPEECH PACE</FieldLabel>
            <span className="text-[10px] text-white/60 font-mono">{speed.toFixed(2)}x</span>
          </div>
          <Slider value={[speed]} min={0.5} max={2.0} step={0.05} onValueChange={(v) => setSpeed(v[0])} />
          <div className="flex justify-between text-[8px] text-white/40 mt-1">
            <span>0.7x</span><span>1.0x</span><span>1.3x</span><span>1.8x</span>
          </div>
          <FieldDesc>1.0 = natural. 1.2–1.4 = brisk delivery. 0.8 = emphasis and gravitas.</FieldDesc>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={boost} onCheckedChange={setBoost} />
          <div>
            <div className="text-[11px] text-white">SPEAKER BOOST <span className="text-white/40 ml-2">{boost ? "ON" : "OFF"}</span></div>
            <div className="text-[9px] text-white/45">Enhances vocal clarity. Recommended ON.</div>
          </div>
        </div>
      </div>

      {/* Streaming mode */}
      <div className={STUDIO_CARD}>
        <FieldLabel>OUTPUT MODE</FieldLabel>
        <div className="flex gap-2">
          {[
            { v: true, t: "Real-time (Streaming)", d: "Lower latency. Best for Voice Mode conversation." },
            { v: false, t: "Full Quality", d: "Highest audio quality. Best for reading briefs aloud." },
          ].map((o) => {
            const sel = streaming === o.v;
            return (
              <button type="button" key={String(o.v)} onClick={() => setStreaming(o.v)}
                className="flex-1 text-left rounded-md p-3"
                style={{
                  background: sel ? "rgba(196,154,43,0.06)" : "rgba(255,255,255,0.03)",
                  border: `${sel ? 1.5 : 1}px solid ${sel ? "rgba(196,154,43,0.8)" : "rgba(255,255,255,0.08)"}`,
                }}>
                <div className="text-[11px] font-semibold text-white">{o.t}</div>
                <div className="text-[9px] text-white/55 mt-1">{o.d}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Test button */}
      <div>
        <button type="button" onClick={testIris} disabled={!configured && false}
          className="w-full h-11 rounded font-medium text-[12px] text-black flex items-center justify-center gap-2"
          style={{ background: GOLD, opacity: configured ? 1 : 0.6 }}>
          {testing ? <><Square className="w-3.5 h-3.5" /> Playing — click to stop</> :
            <><Play className="w-3.5 h-3.5" /> Test IRIS Voice</>}
        </button>
        <p className="text-[9px] text-white/40 italic mt-2">Preview text: "{IRIS_PREVIEW_TEXT}"</p>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button type="button" disabled={saving} onClick={saveAll}
          className="px-4 py-2 rounded text-[12px] font-medium text-black flex items-center gap-2"
          style={{ background: GOLD }}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save voice settings"}
        </button>
      </div>

      {/* Custom voice placeholder */}
      <div className="rounded border border-dashed border-white/15 p-4 text-center">
        <div className="text-[11px] text-white/60">🎤 Custom IRIS Voice — Coming Soon</div>
        <div className="text-[9px] text-white/40 mt-1">Upload voice samples to create a custom IRIS voice trained on your team's language and style. Available in a future ATLAS release.</div>
      </div>
    </div>
  );
}

function SliderRow({
  label, value, setValue, min, max, step, left, right, desc,
}: {
  label: string; value: number; setValue: (v: number) => void;
  min: number; max: number; step: number; left: string; right: string; desc: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-[10px] text-white/60 font-mono">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => setValue(v[0])} />
      <div className="flex justify-between text-[8px] text-white/40 mt-1">
        <span>◄ {left}</span><span>{right} ►</span>
      </div>
      <FieldDesc>{desc}</FieldDesc>
    </div>
  );
}
