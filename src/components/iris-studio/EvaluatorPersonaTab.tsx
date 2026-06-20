import { useState } from "react";
import { SectionHeader, FieldLabel, FieldDesc, STUDIO_CARD, type TabSaveFn } from "./shared";

export function EvaluatorPersonaTab({
  config,
  onSave,
  saving,
}: {
  config: Record<string, unknown>;
  onSave: TabSaveFn;
  saving: boolean;
}) {
  const [name, setName] = useState(String(config.evaluator_persona_name ?? ""));
  const [lens, setLens] = useState(String(config.evaluator_lens ?? ""));
  const [priorities, setPriorities] = useState<string[]>(
    Array.isArray(config.evaluator_priorities) ? (config.evaluator_priorities as string[]) : [],
  );
  const [newPri, setNewPri] = useState("");

  return (
    <div className="space-y-6">
      <SectionHeader title="EVALUATOR PERSONA" subtitle="Tell IRIS who is reading the response so it scores and coaches accurately." />
      <div className={STUDIO_CARD + " space-y-5 max-w-2xl"}>
        <div>
          <FieldLabel>PERSONA NAME</FieldLabel>
          <input className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[14px] text-white"
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <FieldLabel>EVALUATOR LENS</FieldLabel>
          <FieldDesc>What this evaluator looks for first.</FieldDesc>
          <input className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[14px] text-white"
            value={lens} onChange={(e) => setLens(e.target.value)} />
        </div>
        <div>
          <FieldLabel>PRIORITIES</FieldLabel>
          <FieldDesc>Stack-ranked qualities the evaluator rewards.</FieldDesc>
          <ul className="space-y-1 mb-2">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px] text-white/80">
                <span className="text-white/40">{i + 1}.</span>
                <span className="flex-1">{p}</span>
                <button type="button" className="text-white/40 hover:text-white text-[12px]"
                  onClick={() => setPriorities(priorities.filter((_, j) => j !== i))}>remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[14px] text-white"
              placeholder="Add a priority"
              value={newPri} onChange={(e) => setNewPri(e.target.value)} />
            <button type="button" className="px-3 py-1.5 rounded bg-white/10 text-[12px] text-white"
              onClick={() => { if (newPri.trim()) { setPriorities([...priorities, newPri.trim()]); setNewPri(""); }}}>
              Add
            </button>
          </div>
        </div>
        <div className="pt-2">
          <button type="button" disabled={saving}
            onClick={() => onSave({ evaluator_persona_name: name, evaluator_lens: lens, evaluator_priorities: priorities })}
            className="px-4 py-2 rounded text-[12px] font-medium text-black" style={{ background: "#C49A2B" }}>
            {saving ? "Saving…" : "Save persona"}
          </button>
        </div>
      </div>
    </div>
  );
}
