import { useState } from "react";
import { SectionHeader, FieldLabel, FieldDesc, STUDIO_CARD, type TabSaveFn } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BriefSettingsTab({
  config,
  onSave,
  saving,
}: {
  config: Record<string, unknown>;
  onSave: TabSaveFn;
  saving: boolean;
}) {
  const [tone, setTone] = useState(String(config.brief_tone ?? "analytical"));
  const [cap, setCap] = useState<number>(Number(config.brief_length_cap ?? 1200));
  const [density, setDensity] = useState(String(config.brief_citation_density ?? "balanced"));

  return (
    <div className="space-y-6">
      <SectionHeader title="BRIEF SETTINGS" subtitle="How IRIS shapes the brief it writes for every question." />
      <div className={STUDIO_CARD + " space-y-5 max-w-xl"}>
        <div>
          <FieldLabel>BRIEF TONE</FieldLabel>
          <FieldDesc>How IRIS sounds when it writes briefs.</FieldDesc>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="analytical">Analytical</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
              <SelectItem value="directive">Directive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel>LENGTH CAP (WORDS)</FieldLabel>
          <FieldDesc>Soft target. IRIS truncates beyond this.</FieldDesc>
          <input
            type="number"
            min={200}
            max={5000}
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white w-32"
          />
        </div>
        <div>
          <FieldLabel>CITATION DENSITY</FieldLabel>
          <FieldDesc>How often IRIS inserts inline citations.</FieldDesc>
          <Select value={density} onValueChange={setDensity}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sparse">Sparse</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="dense">Dense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ brief_tone: tone, brief_length_cap: cap, brief_citation_density: density })}
            className="px-4 py-2 rounded text-[12px] font-medium text-black"
            style={{ background: "#C49A2B" }}
          >
            {saving ? "Saving…" : "Save brief settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
