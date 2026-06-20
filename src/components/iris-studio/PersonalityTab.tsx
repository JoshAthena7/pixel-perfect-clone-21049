import { useState } from "react";
import { SectionHeader, FieldLabel, FieldDesc, STUDIO_CARD, type TabSaveFn } from "./shared";
import { Slider } from "@/components/ui/slider";

export function PersonalityTab({
  config,
  onSave,
  saving,
}: {
  config: Record<string, unknown>;
  onSave: TabSaveFn;
  saving: boolean;
}) {
  const [tone, setTone] = useState<number>(Number(config.personality_tone ?? 0.5));
  const [formality, setFormality] = useState<number>(Number(config.personality_formality ?? 0.6));

  return (
    <div className="space-y-6">
      <SectionHeader title="PERSONALITY" subtitle="How IRIS speaks. Affects every generated message." />
      <div className={STUDIO_CARD + " space-y-6 max-w-xl"}>
        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>TONE</FieldLabel>
            <span className="text-[11px] text-white/60 font-mono">{tone.toFixed(2)}</span>
          </div>
          <FieldDesc>0 = clinical • 1 = warm</FieldDesc>
          <Slider value={[tone]} min={0} max={1} step={0.05} onValueChange={(v) => setTone(v[0])} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>FORMALITY</FieldLabel>
            <span className="text-[11px] text-white/60 font-mono">{formality.toFixed(2)}</span>
          </div>
          <FieldDesc>0 = casual • 1 = formal</FieldDesc>
          <Slider value={[formality]} min={0} max={1} step={0.05} onValueChange={(v) => setFormality(v[0])} />
        </div>
        <button type="button" disabled={saving}
          onClick={() => onSave({ personality_tone: tone, personality_formality: formality })}
          className="px-4 py-2 rounded text-[12px] font-medium text-black" style={{ background: "#C49A2B" }}>
          {saving ? "Saving…" : "Save personality"}
        </button>
      </div>
    </div>
  );
}
