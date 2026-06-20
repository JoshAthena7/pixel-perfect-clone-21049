import { useMemo, useState } from "react";
import { SectionHeader, FieldLabel, FieldDesc, STUDIO_CARD, type TabSaveFn } from "./shared";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_PERSON_FIRST_PAIRS,
  CULTURAL_STANDARD_DEFS,
  PERSON_FIRST_CATEGORY_LABEL,
  type PersonFirstPair,
  type PersonFirstCategory,
} from "@/lib/iris/default-person-first";
import { X, Loader2, Download } from "lucide-react";

const GOLD = "#C49A2B";
const CATS: Array<PersonFirstCategory | "all"> = [
  "all", "mental_health", "substance_use", "disability", "housing", "economic", "youth", "engagement", "cultural",
];

type Violation = {
  table: string;
  field: string;
  recordId: string;
  foundTerm: string;
  suggestedReplacement: string;
  excerpt: string;
};

export function LanguageInclusionTab({
  missionId,
  config,
  onSave,
  saving,
  autoRunAudit,
}: {
  missionId: string;
  config: Record<string, unknown>;
  onSave: TabSaveFn;
  saving: boolean;
  autoRunAudit?: boolean;
}) {
  const initialPairs = (Array.isArray(config.person_first_pairs) && config.person_first_pairs.length > 0
    ? (config.person_first_pairs as PersonFirstPair[])
    : DEFAULT_PERSON_FIRST_PAIRS);

  const [pairs, setPairs] = useState<PersonFirstPair[]>(initialPairs);
  const [standards, setStandards] = useState<string[]>(
    Array.isArray(config.cultural_standards) ? (config.cultural_standards as string[]) : [],
  );
  const [stateTerms, setStateTerms] = useState<Array<{ term: string; preferred: string; context?: string }>>(
    Array.isArray(config.state_terminology) ? (config.state_terminology as Array<{ term: string; preferred: string; context?: string }>) : [],
  );
  const [filter, setFilter] = useState<PersonFirstCategory | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addRow, setAddRow] = useState<PersonFirstPair>({ term: "", replacement: "", category: "mental_health", active: true });
  const [stateOpen, setStateOpen] = useState(false);
  const [stateAdd, setStateAdd] = useState({ term: "", preferred: "", context: "" });

  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState("");
  const [auditResults, setAuditResults] = useState<Violation[] | null>(null);

  const filtered = useMemo(
    () => filter === "all" ? pairs : pairs.filter((p) => p.category === filter),
    [pairs, filter],
  );

  const toggleStandard = (key: string) => {
    setStandards((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key]);
  };

  const updatePair = (idx: number, patch: Partial<PersonFirstPair>) => {
    setPairs((ps) => ps.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const removePair = (idx: number) => setPairs((ps) => ps.filter((_, i) => i !== idx));

  const saveAll = () => onSave({
    person_first_pairs: pairs,
    cultural_standards: standards,
    state_terminology: stateTerms,
  });

  const runAudit = async () => {
    setAuditing(true);
    setAuditResults(null);
    setAuditProgress("Scanning signals…");
    const active = pairs.filter((p) => p.active);
    if (active.length === 0) {
      setAuditing(false);
      toast("No active person-first pairs to scan with.");
      return;
    }
    try {
      const violations: Violation[] = [];
      const scan = (table: string, field: string, recordId: string, text: string | null | undefined) => {
        if (!text) return;
        const lower = text.toLowerCase();
        for (const p of active) {
          const i = lower.indexOf(p.term.toLowerCase());
          if (i >= 0) {
            const start = Math.max(0, i - 30);
            const end = Math.min(text.length, i + p.term.length + 60);
            violations.push({
              table, field, recordId,
              foundTerm: text.slice(i, i + p.term.length),
              suggestedReplacement: p.replacement,
              excerpt: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""),
            });
            break;
          }
        }
      };

      const { data: signals } = await supabase
        .from("oracle_signals")
        .select("id, title, summary")
        .eq("mission_id", missionId)
        .limit(500);
      (signals ?? []).forEach((s) => {
        scan("oracle_signals", "title", String(s.id), (s as { title?: string }).title);
        scan("oracle_signals", "summary", String(s.id), (s as { summary?: string }).summary);
      });

      setAuditProgress("Scanning engagement config…");
      const { data: eng } = await supabase
        .from("oracle_engagement_config")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      if (eng) {
        Object.entries(eng).forEach(([k, v]) => {
          if (typeof v === "string") scan("oracle_engagement_config", k, missionId, v);
        });
      }

      setAuditProgress("Scanning question progress…");
      const { data: progress } = await supabase
        .from("question_progress")
        .select("id, metadata")
        .eq("mission_id", missionId)
        .limit(500);
      (progress ?? []).forEach((p) => {
        const row = p as { id: string; metadata?: unknown };
        const txt = row.metadata ? JSON.stringify(row.metadata) : "";
        scan("question_progress", "metadata", row.id, txt);
      });

      setAuditResults(violations);
      setAuditProgress("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditing(false);
    }
  };

  if (autoRunAudit && !auditing && auditResults === null) {
    // Defer to next tick so render completes
    setTimeout(() => { void runAudit(); }, 200);
  }

  const exportCsv = () => {
    if (!auditResults) return;
    const rows = [
      ["table", "field", "record_id", "found_term", "suggested_replacement", "excerpt"],
      ...auditResults.map((v) => [v.table, v.field, v.recordId, v.foundTerm, v.suggestedReplacement, v.excerpt.replace(/"/g, '""')]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `language-audit-${missionId.slice(0, 8)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="LANGUAGE & INCLUSION"
        subtitle="IRIS follows person-first, culturally responsive language standards in all outputs. Configure mission-specific preferences below." />

      {/* Person-first */}
      <div className={STUDIO_CARD}>
        <div className="flex items-start justify-between">
          <div>
            <FieldLabel>PERSON-FIRST LANGUAGE PAIRS</FieldLabel>
            <FieldDesc>IRIS never uses these terms. Every occurrence is automatically replaced in all outputs.</FieldDesc>
          </div>
          <div className="flex gap-2 text-[9px]">
            <button type="button" className="text-white/50 hover:text-white"
              onClick={() => setPairs(pairs.map((p) => ({ ...p, active: true })))}>Activate all</button>
            <span className="text-white/20">·</span>
            <button type="button" className="text-white/50 hover:text-white"
              onClick={() => setPairs(pairs.map((p) => ({ ...p, active: false })))}>Deactivate all</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {CATS.map((c) => (
            <button type="button" key={c} onClick={() => setFilter(c)}
              className="text-[9px] px-2 py-1 rounded uppercase tracking-[0.06em]"
              style={{
                background: filter === c ? "rgba(196,154,43,0.15)" : "rgba(255,255,255,0.04)",
                color: filter === c ? GOLD : "rgba(255,255,255,0.6)",
                border: `1px solid ${filter === c ? "rgba(196,154,43,0.5)" : "rgba(255,255,255,0.08)"}`,
              }}>
              {c === "all" ? "All" : PERSON_FIRST_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="rounded border border-white/10 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-[0.1em] text-white/40">
                <th className="px-3 py-2">Avoid</th>
                <th className="px-3 py-2">Use Instead</th>
                <th className="px-3 py-2 w-32">Category</th>
                <th className="px-3 py-2 w-16">Active</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const idx = pairs.indexOf(p);
                return (
                  <tr key={idx} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2" style={{ color: "rgba(248,113,113,0.85)" }}>{p.term}</td>
                    <td className="px-3 py-2" style={{ color: "rgba(74,222,128,0.9)" }}>{p.replacement}</td>
                    <td className="px-3 py-2">
                      <span className="text-[8px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                        {PERSON_FIRST_CATEGORY_LABEL[p.category]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={p.active} onCheckedChange={(v) => updatePair(idx, { active: v })} />
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removePair(idx)} className="text-white/30 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[10px] text-white/40">No pairs in this category.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!addOpen ? (
          <button type="button" className="mt-3 text-[10px]" style={{ color: GOLD }}
            onClick={() => setAddOpen(true)}>+ Add pair</button>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <input className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white flex-1 min-w-[140px]"
              placeholder="Avoid" value={addRow.term}
              onChange={(e) => setAddRow({ ...addRow, term: e.target.value })} />
            <input className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white flex-1 min-w-[140px]"
              placeholder="Use instead" value={addRow.replacement}
              onChange={(e) => setAddRow({ ...addRow, replacement: e.target.value })} />
            <select className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
              value={addRow.category}
              onChange={(e) => setAddRow({ ...addRow, category: e.target.value as PersonFirstCategory })}>
              {Object.entries(PERSON_FIRST_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button type="button" className="px-3 py-1.5 rounded text-[11px] text-black" style={{ background: GOLD }}
              onClick={() => {
                if (addRow.term.trim() && addRow.replacement.trim()) {
                  setPairs([...pairs, addRow]);
                  setAddRow({ term: "", replacement: "", category: "mental_health", active: true });
                  setAddOpen(false);
                }
              }}>Add</button>
            <button type="button" className="text-[11px] text-white/50" onClick={() => setAddOpen(false)}>cancel</button>
          </div>
        )}
      </div>

      {/* Cultural standards */}
      <div className={STUDIO_CARD}>
        <FieldLabel>CULTURAL COMPETENCY STANDARDS</FieldLabel>
        <FieldDesc>IRIS applies these principles to all mission outputs when enabled.</FieldDesc>
        <div className="space-y-3">
          {CULTURAL_STANDARD_DEFS.map((s) => (
            <div key={s.key} className="flex items-start gap-3">
              <div className="pt-0.5"><Switch checked={standards.includes(s.key)} onCheckedChange={() => toggleStandard(s.key)} /></div>
              <div>
                <div className="text-[11px] text-white">{s.label}</div>
                <div className="text-[9px] text-white/50 mt-0.5">{s.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* State terminology */}
      <div className={STUDIO_CARD}>
        <FieldLabel>STATE-PREFERRED TERMINOLOGY</FieldLabel>
        <FieldDesc>State-specific terms IRIS uses instead of generic equivalents.</FieldDesc>
        <div className="rounded border border-white/10 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-[0.1em] text-white/40">
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">Preferred</th>
                <th className="px-3 py-2">Context</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {stateTerms.map((t, idx) => (
                <tr key={idx} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/70">"{t.term}"</td>
                  <td className="px-3 py-2" style={{ color: GOLD }}>→ "{t.preferred}"</td>
                  <td className="px-3 py-2 text-white/50 text-[10px]">{t.context}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => setStateTerms(stateTerms.filter((_, i) => i !== idx))}
                      className="text-white/30 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {stateTerms.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-[10px] text-white/40">No state-specific terms.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!stateOpen ? (
          <button type="button" className="mt-3 text-[10px]" style={{ color: GOLD }} onClick={() => setStateOpen(true)}>+ Add term</button>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <input className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
              placeholder="Term" value={stateAdd.term} onChange={(e) => setStateAdd({ ...stateAdd, term: e.target.value })} />
            <input className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
              placeholder="Preferred" value={stateAdd.preferred} onChange={(e) => setStateAdd({ ...stateAdd, preferred: e.target.value })} />
            <input className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white flex-1 min-w-[160px]"
              placeholder="Context" value={stateAdd.context} onChange={(e) => setStateAdd({ ...stateAdd, context: e.target.value })} />
            <button type="button" className="px-3 py-1.5 rounded text-[11px] text-black" style={{ background: GOLD }}
              onClick={() => {
                if (stateAdd.term.trim() && stateAdd.preferred.trim()) {
                  setStateTerms([...stateTerms, { ...stateAdd }]);
                  setStateAdd({ term: "", preferred: "", context: "" });
                  setStateOpen(false);
                }
              }}>Add</button>
            <button type="button" className="text-[11px] text-white/50" onClick={() => setStateOpen(false)}>cancel</button>
          </div>
        )}
      </div>

      {/* Language audit */}
      <div className={STUDIO_CARD}>
        <FieldLabel>LANGUAGE AUDIT</FieldLabel>
        <FieldDesc>Scan existing IRIS outputs for person-first violations.</FieldDesc>
        <div className="text-[10px] text-white/55 space-y-0.5 mb-3">
          <div>Scans: oracle_signals titles &amp; summaries</div>
          <div>· IRIS brief outputs in question_progress</div>
          <div>· oracle_engagement_config text fields</div>
        </div>
        <button type="button" onClick={runAudit} disabled={auditing}
          className="px-4 py-2 rounded text-[12px] font-medium text-black inline-flex items-center gap-2"
          style={{ background: GOLD, opacity: auditing ? 0.6 : 1 }}>
          {auditing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {auditing ? (auditProgress || "Scanning…") : "Run Language Audit"}
        </button>

        {auditResults && (
          <div className="mt-4 rounded border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-semibold">
                Audit Results — <span className={auditResults.length > 0 ? "text-amber-400" : "text-emerald-400"}>
                  {auditResults.length > 0 ? `${auditResults.length} items flagged` : "✓ No violations found"}
                </span>
              </div>
              <div className="flex gap-2">
                {auditResults.length > 0 && (
                  <button type="button" onClick={exportCsv}
                    className="text-[10px] flex items-center gap-1 text-white/70 hover:text-white">
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                )}
                <button type="button" onClick={() => setAuditResults(null)}
                  className="text-[10px] text-white/50 hover:text-white">Dismiss</button>
              </div>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {auditResults.map((v, i) => (
                <div key={i} className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <div className="text-[9px] uppercase tracking-[0.08em] text-white/40">{v.table} · {v.field}</div>
                  <div className="text-[11px] mt-1 text-white/80">
                    {v.excerpt.split(v.foundTerm).map((chunk, ci, arr) => (
                      <span key={ci}>
                        {chunk}
                        {ci < arr.length - 1 && <span style={{ background: "rgba(248,113,113,0.25)", color: "rgba(248,113,113,1)" }} className="px-1 rounded">{v.foundTerm}</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "rgba(74,222,128,0.9)" }}>→ {v.suggestedReplacement}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" disabled={saving} onClick={saveAll}
          className="px-4 py-2 rounded text-[12px] font-medium text-black inline-flex items-center gap-2"
          style={{ background: GOLD }}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save language settings"}
        </button>
      </div>
    </div>
  );
}
