/**
 * Feed ATLAS — Manual Item tab.
 *
 * Inline form (no nested modal) that inserts a row into oracle_signals with
 * status = "needs_review", tier = "mission", ingestion_source = "manual".
 * Reuses the existing addOracleIntel server function so taxonomy and
 * downstream side-effects stay identical to the old OracleIntakeModal.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { addOracleIntel, type OracleCategoryKey } from "@/lib/oracle-intel.functions";

const GOLD = "#C49A2B";

const CATEGORIES: { key: OracleCategoryKey; label: string }[] = [
  { key: "regulatory", label: "Regulatory" },
  { key: "quality", label: "Quality" },
  { key: "sdoh", label: "SDOH" },
  { key: "policy_innovation", label: "Policy Innovation" },
  { key: "evidence", label: "Evidence Base" },
  { key: "field", label: "Field Intel" },
  { key: "competitive", label: "Competitive" },
  { key: "client_content", label: "Client Content" },
];

const URGENCIES: { value: "immediate" | "high" | "normal" | "low"; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

export function ManualItemTab({ missionId, onSubmitted }: { missionId: string; onSubmitted?: () => void }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addOracleIntel);

  const [category, setCategory] = useState<OracleCategoryKey | null>(null);
  const [title, setTitle] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whyMatters, setWhyMatters] = useState("");
  const [action, setAction] = useState("");
  const [source, setSource] = useState("");
  const [urgency, setUrgency] = useState<"immediate" | "high" | "normal" | "low">("normal");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setCategory(null);
    setTitle("");
    setWhatHappened("");
    setWhyMatters("");
    setAction("");
    setSource("");
    setUrgency("normal");
    setTags("");
  }

  const canSubmit = !!category && title.trim().length > 0 && whatHappened.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit || !category) return;
    setBusy(true);
    try {
      const topicTags = tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await addFn({
        data: {
          missionId,
          tier: "mission",
          category,
          title: title.trim(),
          summary: whatHappened.trim(),
          source_name: source.trim() || "Manual entry",
          source_url: "",
          published_at: null,
          topic_tags: topicTags,
          taxonomy_node_codes: [],
          win_theme_tags: [],
          jpb_variable_tags: [],
          authority: "tertiary",
          extra: {
            why_it_matters: whyMatters.trim() || null,
            recommended_action: action.trim() || null,
            urgency,
            user_created: true,
          },
        },
      });
      toast.success("Item added — approve it in the review queue.");
      qc.invalidateQueries({ queryKey: ["oracle-signals", missionId] });
      qc.invalidateQueries({ queryKey: ["intel-status-widget", missionId] });
      qc.invalidateQueries({ queryKey: ["olympus", "signals"] });
      reset();
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add intel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Category pills */}
      <Field label="Category *">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className="rounded-full transition-colors"
                style={{
                  fontSize: 10,
                  padding: "4px 10px",
                  color: active ? "#000" : "rgba(255,255,255,0.65)",
                  background: active ? GOLD : "rgba(255,255,255,0.04)",
                  border: `0.5px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Title *">
        <Input value={title} onChange={setTitle} placeholder="What is this intelligence item?" />
      </Field>

      <Field label="What happened *">
        <TextArea
          value={whatHappened}
          onChange={setWhatHappened}
          rows={3}
          placeholder="Describe the signal, event, or finding."
        />
      </Field>

      <Field label="Why it matters">
        <TextArea
          value={whyMatters}
          onChange={setWhyMatters}
          rows={2}
          placeholder="Why does this affect the mission?"
        />
      </Field>

      <Field label="Recommended action">
        <Input value={action} onChange={setAction} placeholder="What should the team do with this?" />
      </Field>

      <Field label="Source name">
        <Input value={source} onChange={setSource} placeholder="NJ DMAHS / CIACC Dashboard / etc." />
      </Field>

      <Field label="Urgency">
        <div className="flex flex-wrap gap-1.5">
          {URGENCIES.map((u) => {
            const active = urgency === u.value;
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgency(u.value)}
                className="rounded-full transition-colors"
                style={{
                  fontSize: 10,
                  padding: "4px 10px",
                  color: active ? "#000" : "rgba(255,255,255,0.65)",
                  background: active ? GOLD : "rgba(255,255,255,0.04)",
                  border: `0.5px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Topic tags">
        <Input value={tags} onChange={setTags} placeholder="behavioral-health, fssa, waiver" />
      </Field>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: GOLD,
            color: "#000",
            fontWeight: 600,
            fontSize: 11,
            padding: "8px 16px",
            borderRadius: 4,
          }}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add to ORACLE
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1.5"
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "",
          color: "rgba(255,255,255,0.5)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded outline-none focus:ring-1 focus:ring-amber-500/40"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#e5e7eb",
        fontSize: 12,
        padding: "7px 10px",
      }}
    />
  );
}

function TextArea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded outline-none focus:ring-1 focus:ring-amber-500/40 resize-none"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#e5e7eb",
        fontSize: 12,
        padding: "7px 10px",
        fontFamily: "inherit",
        lineHeight: 1.5,
      }}
    />
  );
}
