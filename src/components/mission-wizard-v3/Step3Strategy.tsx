/**
 * Step 3 — Strategic Foundation. Three sections:
 *   A. Strategic Foundation  — North Star, Central Claim
 *   B. How We Win            — Win Themes, Discriminators, Proof Points
 *   C. What We're Watching   — Top Risks, Stakeholders, Competitors
 *
 * All saves are immediate (debounced for textareas, on-change for lists),
 * written to `oracle_engagement_config` and mirrored to sessionStorage
 * staging so the existing LaunchSequence/Step8Review persist path stays intact.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Diamond, Sparkles, X, Loader2, Check, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMissionStep } from "@/lib/iris-mission-analysis.functions";
import { loadStaged, saveStaged } from "@/lib/oracle/wizard-stage";
import type { OracleTaggedItem, OracleSignalAuthority } from "@/lib/oracle/types";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

const GOLD = "#C49A2B";

const STEP3_FIELDS = [
  { key: "win_theme_1", label: "Win Theme 1", hint: "Primary differentiator" },
  { key: "win_theme_2", label: "Win Theme 2" },
  { key: "win_theme_3", label: "Win Theme 3" },
  { key: "win_theme_4", label: "Win Theme 4" },
  { key: "win_theme_5", label: "Win Theme 5" },
  { key: "top_risk_1", label: "Top Risk 1", hint: "Incumbent / political / timeline risk" },
  { key: "top_risk_2", label: "Top Risk 2" },
  { key: "top_risk_3", label: "Top Risk 3" },
  { key: "top_risk_4", label: "Top Risk 4" },
  { key: "top_risk_5", label: "Top Risk 5" },
  { key: "north_star", label: "North Star", hint: "One sentence: what must the state believe?" },
  { key: "central_claim", label: "Central Claim", hint: "We win this if we convince the state that…" },
  { key: "discriminator_1", label: "Discriminator 1", hint: "Something only Athena can say" },
  { key: "discriminator_2", label: "Discriminator 2" },
  { key: "discriminator_3", label: "Discriminator 3" },
  { key: "proof_point_1", label: "Proof Point 1", hint: "Data / outcome / metric from the corpus" },
  { key: "proof_point_2", label: "Proof Point 2" },
  { key: "proof_point_3", label: "Proof Point 3" },
  { key: "proof_point_4", label: "Proof Point 4" },
  { key: "stakeholder_1", label: "Stakeholder 1", hint: "Format: Name — Role/Title" },
  { key: "stakeholder_2", label: "Stakeholder 2" },
  { key: "stakeholder_3", label: "Stakeholder 3" },
  { key: "stakeholder_4", label: "Stakeholder 4" },
  { key: "competitor_1", label: "Competitor 1" },
  { key: "competitor_2", label: "Competitor 2" },
  { key: "competitor_3", label: "Competitor 3" },
  { key: "competitor_4", label: "Competitor 4" },
  { key: "competitor_5", label: "Competitor 5" },
];

type ExtractionRow = {
  id: string;
  extracted_field: string;
  extracted_value: string | null;
  source_file_name: string | null;
  confidence_score: number | null;
  confirmed_by_user: boolean;
  overridden_by_user: boolean;
};

type Stakeholder = {
  id: string;
  name: string;
  role: string;
  influence: "decision_maker" | "influencer" | "evaluator";
  client_stated?: boolean;
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─────────────────── Shared visuals ───────────────────

function SectionHeader({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 mt-2">
      <div className="flex items-center gap-2">
        <span className="text-[18px]">{emoji}</span>
        <h2 className="text-white text-[18px] font-medium">{title}</h2>
      </div>
      {subtitle && <p className="text-[12.5px] text-white/55 mt-1">{subtitle}</p>}
    </div>
  );
}

function SavedTick({ visible }: { visible: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] transition-opacity"
      style={{ color: "rgba(134,239,172,0.85)", opacity: visible ? 1 : 0 }}
    >
      <Check className="h-3 w-3" /> Saved
    </span>
  );
}

function PasteFromRfpExpander({
  onSubmit,
  label = "+ Paste client language",
  placeholder = "Paste verbatim RFP language here",
}: {
  onSubmit: (text: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11.5px] mt-2"
        style={{ color: GOLD }}
      >
        {label} →
      </button>
    );
  }
  return (
    <div
      className="mt-2 rounded p-2"
      style={{ borderLeft: `3px solid ${GOLD}`, background: "rgba(196,154,43,0.05)" }}
    >
      <textarea
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full text-[12.5px] px-2 py-1.5 rounded bg-white/5 border text-white placeholder:text-white/30 resize-none"
        style={{ borderColor: "rgba(196,154,43,0.4)" }}
      />
      <div className="flex justify-end gap-2 mt-1.5">
        <button
          onClick={() => {
            setOpen(false);
            setVal("");
          }}
          className="text-[11px] text-white/45"
        >
          Cancel
        </button>
        <button
          disabled={!val.trim()}
          onClick={() => {
            onSubmit(val.trim());
            setVal("");
            setOpen(false);
          }}
          className="text-[11px] font-medium disabled:opacity-40"
          style={{ color: GOLD }}
        >
          Add as RFP language
        </button>
      </div>
    </div>
  );
}

// ─────────────────── Win Themes / Risks (preserved) ───────────────────

function AuthorityChip({
  item,
  onRemove,
  onUpdateReference,
}: {
  item: OracleTaggedItem;
  onRemove: () => void;
  onUpdateReference?: (ref: string) => void;
}) {
  const isClient = item.signal_authority === "client_stated";
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div
        className="inline-flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-white"
        style={{
          border: isClient ? `1px solid rgba(196,154,43,0.4)` : "1px solid rgba(255,255,255,0.15)",
          borderLeft: isClient ? `3px solid ${GOLD}` : "1px solid rgba(255,255,255,0.15)",
          background: isClient ? "rgba(196,154,43,0.05)" : "rgba(255,255,255,0.03)",
          alignSelf: "flex-start",
          maxWidth: "100%",
        }}
      >
        {isClient ? (
          <Star className="h-3.5 w-3.5 shrink-0 mt-0.5" fill={GOLD} color={GOLD} />
        ) : (
          <Diamond className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white" />
        )}
        <span className="break-words flex-1">{item.text}</span>
        <button onClick={onRemove} className="text-white/40 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {isClient && onUpdateReference && (
        <input
          value={item.rfp_reference ?? ""}
          onChange={(e) => onUpdateReference(e.target.value.slice(0, 80))}
          placeholder="RFP reference (optional) — e.g. §4.2"
          maxLength={80}
          className="ml-6 max-w-md text-[11.5px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30"
        />
      )}
    </div>
  );
}

function TaggedListEditor({
  prompt,
  items,
  onChange,
  min,
  max,
  inputPlaceholder,
}: {
  prompt: string;
  items: OracleTaggedItem[];
  onChange: (next: OracleTaggedItem[]) => void;
  min: number;
  max: number;
  inputPlaceholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  const clientItems = items.filter((i) => i.signal_authority === "client_stated");
  const teamItems = items.filter((i) => i.signal_authority === "team_validated");
  const total = clientItems.length + teamItems.length;

  function addItem(authority: OracleSignalAuthority, textOverride?: string) {
    const text = textOverride ?? pendingTag;
    if (!text) return;
    if (total >= max) return;
    onChange([
      ...items,
      {
        id: uid(),
        text,
        signal_authority: authority,
        rfp_reference: null,
        confidence: 100,
        status: "confirmed",
      },
    ]);
    setPendingTag(null);
    setDraft("");
  }
  function removeItem(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }
  function updateRef(id: string, ref: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, rfp_reference: ref || null } : i)));
  }

  return (
    <div className="mb-4">
      <p className="text-[12.5px] text-white/55 mb-3">{prompt}</p>
      <div
        className="rounded-lg p-4"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Star className="h-3.5 w-3.5" fill={GOLD} color={GOLD} />
          <span className="text-[11.5px] uppercase tracking-[0.1em]" style={{ color: GOLD }}>From the RFP</span>
        </div>
        <div className="flex flex-col gap-2">
          {clientItems.length === 0 && (
            <p className="text-[11.5px] italic text-white/30">Nothing pasted from the RFP yet.</p>
          )}
          {clientItems.map((i) => (
            <AuthorityChip
              key={i.id}
              item={i}
              onRemove={() => removeItem(i.id)}
              onUpdateReference={(ref) => updateRef(i.id, ref)}
            />
          ))}
        </div>

        <div className="my-4 border-t border-white/10" />

        <div className="flex items-center gap-1.5 mb-2">
          <Diamond className="h-3.5 w-3.5 text-white" />
          <span className="text-[11.5px] uppercase tracking-[0.1em] text-white/70">Our read</span>
        </div>
        <div className="flex flex-col gap-2">
          {teamItems.length === 0 && (
            <p className="text-[11.5px] italic text-white/30">No team items yet.</p>
          )}
          {teamItems.map((i) => (
            <AuthorityChip key={i.id} item={i} onRemove={() => removeItem(i.id)} />
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10">
          {pendingTag ? (
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[12.5px] text-white/70">How should "{pendingTag}" be tagged?</span>
              <button
                onClick={() => addItem("client_stated")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-white"
                style={{ border: `1px solid rgba(196,154,43,0.5)`, background: "rgba(196,154,43,0.1)" }}
              >
                <Star className="h-3 w-3" fill={GOLD} color={GOLD} /> From the RFP
              </button>
              <button
                onClick={() => addItem("team_validated")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-white"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <Diamond className="h-3 w-3" /> Our read
              </button>
              <button onClick={() => { setPendingTag(null); setDraft(""); }} className="text-[11.5px] text-white/40 hover:text-white">
                Cancel
              </button>
            </div>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  if (total >= max) return;
                  setPendingTag(draft.trim());
                }
              }}
              placeholder={inputPlaceholder}
              className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
            />
          )}
        </div>

        <PasteFromRfpExpander
          label="+ Paste language directly from the RFP"
          onSubmit={(text) => addItem("client_stated", text)}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11.5px]">
        <span className={total < min ? "text-amber-300" : "text-white/45"}>
          {total < min
            ? `Add at least ${min} ${min === 1 ? "item" : "items"} to continue.`
            : `${total} of ${max} added.`}
        </span>
      </div>
    </div>
  );
}

// ─────────────────── IRIS suggestion panel (preserved) ───────────────────

function IrisSuggestionsPanel({
  rows,
  onAccept,
  onMarkClient,
  onDismiss,
  showClientOption = true,
}: {
  rows: ExtractionRow[];
  onAccept: (row: ExtractionRow) => void;
  onMarkClient?: (row: ExtractionRow) => void;
  onDismiss: (row: ExtractionRow) => void;
  showClientOption?: boolean;
}) {
  if (rows.length === 0) return null;
  const avgConf = Math.round((rows.reduce((s, r) => s + (r.confidence_score ?? 0), 0) / rows.length) * 100);
  return (
    <div
      className="rounded-lg p-4 mb-6"
      style={{ background: "rgba(255,255,255,0.02)", borderLeft: `2px solid rgba(196,154,43,0.3)`, border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
          <span className="text-[12.5px] uppercase tracking-[0.1em] text-white/70">IRIS Suggestions</span>
        </div>
        <span className="text-[11px] text-white/45">avg confidence {avgConf}%</span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, Math.round((r.confidence_score ?? 0) * 100)));
          return (
            <div key={r.id} className="rounded p-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-[13px] text-white">{r.extracted_value}</p>
              <div className="mt-1.5 h-[3px] rounded bg-white/5 overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: GOLD }} />
              </div>
              {r.source_file_name && (
                <p className="text-[11px] text-white/40 mt-1">Source: {r.source_file_name}</p>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onAccept(r)}
                  className="px-2 py-1 rounded text-[11.5px] text-white"
                  style={{ border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  Accept
                </button>
                {showClientOption && onMarkClient && (
                  <button
                    onClick={() => onMarkClient(r)}
                    className="px-2 py-1 rounded text-[11.5px] text-white"
                    style={{ border: `1px solid rgba(196,154,43,0.5)`, background: "rgba(196,154,43,0.08)" }}
                  >
                    Mark as From the RFP
                  </button>
                )}
                <button
                  onClick={() => onDismiss(r)}
                  className="ml-auto text-white/40 hover:text-white text-[11.5px]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────── Simple text-list editor (discriminators, proof points) ───────────────────

type ListItem = { id: string; text: string; client_stated?: boolean };

function SimpleListEditor({
  items,
  onChange,
  max,
  maxLen,
  addPlaceholder,
  pasteLabel = "+ Paste client language",
  pastePlaceholder = "Paste verbatim RFP language here",
}: {
  items: ListItem[];
  onChange: (next: ListItem[]) => void;
  max: number;
  maxLen: number;
  addPlaceholder: string;
  pasteLabel?: string;
  pastePlaceholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function add(text: string, client: boolean) {
    const t = text.trim().slice(0, maxLen);
    if (!t || items.length >= max) return;
    onChange([...items, { id: uid(), text: t, client_stated: client }]);
    setDraft("");
  }
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-[11.5px] italic text-white/30">Nothing added yet.</p>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            className="inline-flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-white"
            style={{
              border: it.client_stated ? `1px solid rgba(196,154,43,0.4)` : "1px solid rgba(255,255,255,0.15)",
              borderLeft: it.client_stated ? `3px solid ${GOLD}` : "1px solid rgba(255,255,255,0.15)",
              background: it.client_stated ? "rgba(196,154,43,0.05)" : "rgba(255,255,255,0.03)",
            }}
          >
            {it.client_stated ? (
              <Star className="h-3.5 w-3.5 shrink-0 mt-0.5" fill={GOLD} color={GOLD} />
            ) : (
              <Diamond className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white" />
            )}
            <span className="break-words flex-1">{it.text}</span>
            <button onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-white/40 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/10">
        <input
          value={draft}
          maxLength={maxLen}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              add(draft, false);
            }
          }}
          placeholder={addPlaceholder}
          className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
        />
      </div>
      <PasteFromRfpExpander
        label={pasteLabel}
        placeholder={pastePlaceholder}
        onSubmit={(t) => add(t, true)}
      />
      <div className="text-[11px] text-white/40 mt-2">{items.length} of {max}</div>
    </div>
  );
}

// ─────────────────── Textarea with IRIS suggestion + RFP paste ───────────────────

function ClaimTextarea({
  value,
  onChange,
  maxLen,
  placeholder,
  irisSuggestion,
  onUseIris,
  isClientStated,
  onMarkClient,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLen: number;
  placeholder?: string;
  irisSuggestion?: ExtractionRow | null;
  onUseIris?: (text: string) => void;
  isClientStated: boolean;
  onMarkClient: (text: string) => void;
}) {
  const goldBorder = isClientStated;
  return (
    <div>
      {irisSuggestion?.extracted_value && (
        <div className="mb-2 text-[12.5px] text-white/70 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
          <div className="flex-1">
            <span className="text-white/55">
              IRIS read ({Math.round((irisSuggestion.confidence_score ?? 0) * 100)}%):
            </span>{" "}
            <span className="text-white">{irisSuggestion.extracted_value}</span>
            {onUseIris && (
              <div className="mt-1.5">
                <button
                  onClick={() => onUseIris(irisSuggestion.extracted_value!.slice(0, maxLen))}
                  className="px-2 py-0.5 rounded text-[11.5px]"
                  style={{ border: `1px solid rgba(196,154,43,0.5)`, color: GOLD }}
                >
                  Use this
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLen))}
        placeholder={placeholder}
        rows={3}
        className="w-full text-[13px] px-2.5 py-2 rounded bg-white/5 border text-white placeholder:text-white/30 resize-none"
        style={{
          borderColor: goldBorder ? `rgba(196,154,43,0.5)` : "rgba(255,255,255,0.1)",
          borderLeftWidth: goldBorder ? 3 : 1,
          borderLeftColor: goldBorder ? GOLD : "rgba(255,255,255,0.1)",
        }}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-white/40">
          {goldBorder ? (
            <span style={{ color: GOLD }}>★ From the RFP</span>
          ) : (
            "Our read"
          )}
        </span>
        <span className="text-[11px] text-white/40">{value.length} / {maxLen}</span>
      </div>
      <PasteFromRfpExpander
        label="+ Paste client language →"
        onSubmit={(t) => {
          const clipped = t.slice(0, maxLen);
          onChange(clipped);
          onMarkClient(clipped);
        }}
      />
    </div>
  );
}

// ─────────────────── Stakeholders ───────────────────

const INFLUENCE_OPTS: { value: Stakeholder["influence"]; label: string }[] = [
  { value: "decision_maker", label: "Decision Maker" },
  { value: "influencer", label: "Influencer" },
  { value: "evaluator", label: "Evaluator" },
];

function StakeholderRow({
  item,
  onChange,
  onRemove,
}: {
  item: Stakeholder;
  onChange: (next: Stakeholder) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded-md p-2.5"
      style={{
        background: item.client_stated ? "rgba(196,154,43,0.05)" : "rgba(255,255,255,0.03)",
        border: item.client_stated ? `1px solid rgba(196,154,43,0.4)` : "1px solid rgba(255,255,255,0.1)",
        borderLeft: item.client_stated ? `3px solid ${GOLD}` : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-white font-medium">{item.name}</div>
          {item.role && <div className="text-[12px] text-white/55">{item.role}</div>}
        </div>
        <button onClick={onRemove} className="text-white/40 hover:text-white mt-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {INFLUENCE_OPTS.map((o) => {
          const sel = item.influence === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange({ ...item, influence: o.value })}
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{
                border: sel ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.15)",
                color: sel ? GOLD : "rgba(255,255,255,0.6)",
                background: sel ? "rgba(196,154,43,0.08)" : "transparent",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StakeholderEditor({
  items,
  onChange,
}: {
  items: Stakeholder[];
  onChange: (n: Stakeholder[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-[11.5px] italic text-white/30">No stakeholders yet.</p>
        )}
        {items.map((s) => (
          <StakeholderRow
            key={s.id}
            item={s}
            onChange={(n) => onChange(items.map((x) => (x.id === n.id ? n : x)))}
            onRemove={() => onChange(items.filter((x) => x.id !== s.id))}
          />
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/10">
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role / Title"
              className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setAdding(false); setName(""); setRole(""); }} className="text-[11.5px] text-white/45">
                Cancel
              </button>
              <button
                disabled={!name.trim() || !role.trim()}
                onClick={() => {
                  onChange([
                    ...items,
                    { id: uid(), name: name.trim(), role: role.trim(), influence: "influencer" },
                  ]);
                  setName(""); setRole(""); setAdding(false);
                }}
                className="text-[11.5px] font-medium disabled:opacity-40"
                style={{ color: GOLD }}
              >
                Add stakeholder
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: GOLD }}
          >
            <Plus className="h-3.5 w-3.5" /> Add stakeholder
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────── Competitor chip list ───────────────────

function CompetitorChips({
  items,
  onChange,
  max,
}: {
  items: string[];
  onChange: (n: string[]) => void;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  function add(name: string) {
    const t = name.trim();
    if (!t || items.length >= max) return;
    if (items.some((c) => c.toLowerCase() === t.toLowerCase())) return;
    onChange([...items, t]);
    setDraft("");
  }
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {items.length === 0 && (
          <span className="text-[11.5px] italic text-white/30">No competitors yet.</span>
        )}
        {items.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12.5px] text-white"
            style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)" }}
          >
            {c}
            <button onClick={() => onChange(items.filter((x) => x !== c))} className="text-white/40 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add(draft);
          }
        }}
        placeholder="Type a competitor — press Enter or comma to add."
        className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
      />
      <div className="text-[11px] text-white/40 mt-2">{items.length} of {max}</div>
    </div>
  );
}

// ─────────────────── Two-column wrappers ───────────────────

function TwoColumn({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <div
        className="rounded-lg p-3.5"
        style={{ background: "rgba(201,151,43,0.06)", border: "1px solid rgba(201,151,43,0.2)" }}
      >
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: "#C9972B" }}>
            ⚡ IRIS Suggested
          </span>
          <span className="text-[9px] text-white/40 normal-case tracking-normal font-normal">— use as a guide only</span>
        </div>
        {left}
      </div>
      <div
        className="rounded-lg p-3.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-white mb-2.5">✏ Your Input</div>
        {right}
      </div>
    </div>
  );
}

function IrisLeft({
  rows,
  onUse,
  onDismiss,
}: {
  rows: ExtractionRow[];
  onUse: (r: ExtractionRow) => void;
  onDismiss: (r: ExtractionRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-[12px] italic text-white/35">No IRIS suggestions yet for this field.</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const c = r.confidence_score ?? 0;
        const dot = c >= 0.8 ? "#86efac" : c >= 0.6 ? "#fbbf24" : "#f87171";
        const label = c >= 0.8 ? "High" : c >= 0.6 ? "Med" : "Low";
        return (
          <div
            key={r.id}
            className="rounded p-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[13px] text-white/85 italic">{r.extracted_value}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> {label} {Math.round(c * 100)}%
              </span>
              {r.source_file_name && <span className="text-[10px] text-white/35 truncate">· {r.source_file_name}</span>}
              <button
                onClick={() => onUse(r)}
                className="ml-auto text-[11px] px-2 py-0.5 rounded"
                style={{ color: "#C9972B", border: "1px solid rgba(201,151,43,0.4)" }}
              >
                Use this →
              </button>
              <button onClick={() => onDismiss(r)} className="text-[11px] text-white/40 hover:text-white">
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────── Main Step 3 ───────────────────

type OracleConfigRow = {
  north_star: string | null;
  central_claim: string | null;
  win_themes: OracleTaggedItem[] | null;
  top_risks: OracleTaggedItem[] | null;
  discriminators: ListItem[] | null;
  proof_points: ListItem[] | null;
  stakeholders: Stakeholder[] | null;
  competitors: string[] | null;
};

export function Step3Strategy({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeMissionStep);

  // Load existing config row once (or from staged fallback)
  const staged = loadStaged(missionId);
  const configKey = ["oracle-config", missionId] as const;
  const { data: config } = useQuery({
    queryKey: configKey,
    queryFn: async (): Promise<OracleConfigRow> => {
      const { data } = await supabase
        .from("oracle_engagement_config")
        .select("north_star, central_claim, win_themes, top_risks, discriminators, proof_points, stakeholders, competitors")
        .eq("mission_id", missionId)
        .maybeSingle();
      return (data ?? {}) as OracleConfigRow;
    },
  });

  const [northStar, setNorthStar] = useState<string>("");
  const [centralClaim, setCentralClaim] = useState<string>("");
  const [northStarFromRfp, setNorthStarFromRfp] = useState(false);
  const [centralClaimFromRfp, setCentralClaimFromRfp] = useState(false);
  const [winThemes, setWinThemes] = useState<OracleTaggedItem[]>([]);
  const [topRisks, setTopRisks] = useState<OracleTaggedItem[]>([]);
  const [discriminators, setDiscriminators] = useState<ListItem[]>([]);
  const [proofPoints, setProofPoints] = useState<ListItem[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [savedTickAt, setSavedTickAt] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastPatchRef = useRef<Partial<OracleConfigRow> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from DB row (fallback to staged sessionStorage values)
  useEffect(() => {
    if (config === undefined || hydrated) return;
    setNorthStar(config.north_star ?? staged.north_star ?? "");
    setCentralClaim(config.central_claim ?? "");
    setWinThemes((config.win_themes ?? staged.win_themes ?? []) as OracleTaggedItem[]);
    setTopRisks((config.top_risks ?? staged.top_risks ?? []) as OracleTaggedItem[]);
    setDiscriminators((config.discriminators ?? []) as ListItem[]);
    setProofPoints((config.proof_points ?? []) as ListItem[]);
    setStakeholders((config.stakeholders ?? []) as Stakeholder[]);
    setCompetitors((config.competitors ?? staged.competitors ?? []) as string[]);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── Backfill: write through confirmed extractions that never landed
  // in oracle_engagement_config (legacy data from before the confirm
  // action wrote through). Runs once on mount when the config is empty.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (!hydrated || backfilledRef.current) return;
    const configIsEmpty =
      !northStar &&
      !centralClaim &&
      winThemes.length === 0 &&
      topRisks.length === 0 &&
      discriminators.length === 0 &&
      proofPoints.length === 0 &&
      stakeholders.length === 0 &&
      competitors.length === 0;
    if (!configIsEmpty) return;
    backfilledRef.current = true;
    void (async () => {
      const { data: confirmed } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_field, extracted_value, confidence_score")
        .eq("mission_id", missionId)
        .eq("wizard_step", 3)
        .eq("confirmed_by_user", true)
        .eq("overridden_by_user", false);
      if (!confirmed || confirmed.length === 0) return;

      const nextWin: OracleTaggedItem[] = [];
      const nextRisk: OracleTaggedItem[] = [];
      const nextDisc: ListItem[] = [];
      const nextProof: ListItem[] = [];
      const nextStake: Stakeholder[] = [];
      const nextComp: string[] = [];
      let nextNorthStar: string | null = null;
      let nextCentralClaim: string | null = null;

      for (const row of confirmed) {
        const field = (row as { extracted_field: string }).extracted_field;
        const value = ((row as { extracted_value: string | null }).extracted_value ?? "").trim();
        const confPct = Math.round((((row as { confidence_score: number | null }).confidence_score) ?? 1) * 100);
        if (!value) continue;
        if (field === "north_star") { if (!nextNorthStar) nextNorthStar = value.slice(0, 150); continue; }
        if (field === "central_claim") { if (!nextCentralClaim) nextCentralClaim = value; continue; }
        if (field.startsWith("win_theme_")) {
          if (!nextWin.some((i) => i.text.toLowerCase() === value.toLowerCase())) {
            nextWin.push({ id: uid(), text: value, signal_authority: "iris_suggested", rfp_reference: null, confidence: confPct, status: "confirmed" });
          }
          continue;
        }
        if (field.startsWith("top_risk_")) {
          if (!nextRisk.some((i) => i.text.toLowerCase() === value.toLowerCase())) {
            nextRisk.push({ id: uid(), text: value, signal_authority: "iris_suggested", rfp_reference: null, confidence: confPct, status: "confirmed" });
          }
          continue;
        }
        if (field.startsWith("discriminator_")) {
          if (!nextDisc.some((i) => i.text.toLowerCase() === value.toLowerCase())) {
            nextDisc.push({ id: uid(), text: value });
          }
          continue;
        }
        if (field.startsWith("proof_point_")) {
          if (!nextProof.some((i) => i.text.toLowerCase() === value.toLowerCase())) {
            nextProof.push({ id: uid(), text: value });
          }
          continue;
        }
        if (field.startsWith("stakeholder_")) {
          const [n, r] = value.split(/\s*[—\-|·]\s*/);
          nextStake.push({ id: uid(), name: (n ?? value).trim(), role: (r ?? "").trim(), influence: "influencer" });
          continue;
        }
        if (field.startsWith("competitor_")) {
          if (!nextComp.some((c) => c.toLowerCase() === value.toLowerCase())) nextComp.push(value);
          continue;
        }
      }

      const patch: Record<string, unknown> = {};
      if (nextNorthStar) { patch.north_star = nextNorthStar; setNorthStar(nextNorthStar); }
      if (nextCentralClaim) { patch.central_claim = nextCentralClaim; setCentralClaim(nextCentralClaim); }
      if (nextWin.length) { patch.win_themes = nextWin; setWinThemes(nextWin); }
      if (nextRisk.length) { patch.top_risks = nextRisk; setTopRisks(nextRisk); }
      if (nextDisc.length) { patch.discriminators = nextDisc; setDiscriminators(nextDisc); }
      if (nextProof.length) { patch.proof_points = nextProof; setProofPoints(nextProof); }
      if (nextStake.length) { patch.stakeholders = nextStake; setStakeholders(nextStake); }
      if (nextComp.length) { patch.competitors = nextComp; setCompetitors(nextComp); }

      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("oracle_engagement_config")
        .upsert({ mission_id: missionId, ...patch } as never, { onConflict: "mission_id" });
      if (error) {
        console.error("[step3] backfill failed:", error);
      } else {
        console.log("[step3] Backfilled confirmed extractions:", Object.keys(patch));
        qc.invalidateQueries({ queryKey: configKey });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── Save helpers ──
  const flashSaved = useCallback(() => setSavedTickAt(Date.now()), []);
  const upsertConfig = useCallback(
    async (patch: Partial<OracleConfigRow>) => {
      lastPatchRef.current = patch;
      setSaveState("saving");
      const { error } = await supabase
        .from("oracle_engagement_config")
        .upsert({ mission_id: missionId, ...patch } as never, { onConflict: "mission_id" });
      if (error) {
        console.error("Step3 save failed:", error);
        setSaveState("error");
        return;
      }
      flashSaved();
      setSaveState("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(
        () => setSaveState((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    },
    [missionId, flashSaved],
  );
  const retrySave = useCallback(() => {
    if (lastPatchRef.current) void upsertConfig(lastPatchRef.current);
  }, [upsertConfig]);

  // Debounced text save (north_star, central_claim) — also mirror to staged
  const nsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ccTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (nsTimer.current) clearTimeout(nsTimer.current);
    nsTimer.current = setTimeout(() => {
      void upsertConfig({ north_star: northStar || null });
      saveStaged(missionId, { north_star: northStar || null });
    }, 800);
    return () => { if (nsTimer.current) clearTimeout(nsTimer.current); };
  }, [northStar, hydrated, missionId, upsertConfig]);
  useEffect(() => {
    if (!hydrated) return;
    if (ccTimer.current) clearTimeout(ccTimer.current);
    ccTimer.current = setTimeout(() => {
      void upsertConfig({ central_claim: centralClaim || null });
    }, 800);
    return () => { if (ccTimer.current) clearTimeout(ccTimer.current); };
  }, [centralClaim, hydrated, upsertConfig]);

  // Immediate list saves
  const saveWinThemes = useCallback((next: OracleTaggedItem[]) => {
    setWinThemes(next);
    void upsertConfig({ win_themes: next as never });
    saveStaged(missionId, { win_themes: next });
  }, [missionId, upsertConfig]);
  const saveTopRisks = useCallback((next: OracleTaggedItem[]) => {
    setTopRisks(next);
    void upsertConfig({ top_risks: next as never });
    saveStaged(missionId, { top_risks: next });
  }, [missionId, upsertConfig]);
  const saveDiscriminators = useCallback((next: ListItem[]) => {
    setDiscriminators(next);
    void upsertConfig({ discriminators: next as never });
  }, [upsertConfig]);
  const saveProofPoints = useCallback((next: ListItem[]) => {
    setProofPoints(next);
    void upsertConfig({ proof_points: next as never });
  }, [upsertConfig]);
  const saveStakeholders = useCallback(async (next: Stakeholder[]) => {
    setStakeholders(next);
    void upsertConfig({ stakeholders: next as never });
    // Mirror newly-added stakeholders into stakeholder_profiles (best-effort)
    const existingIds = new Set(stakeholders.map((s) => s.id));
    const newOnes = next.filter((s) => !existingIds.has(s.id));
    for (const s of newOnes) {
      await supabase.from("stakeholder_profiles").insert({
        mission_id: missionId,
        name: s.name,
        title: s.role,
        stakeholder_type: s.influence,
        is_manually_added: true,
      } as never);
    }
  }, [missionId, upsertConfig, stakeholders]);
  const saveCompetitors = useCallback(async (next: string[]) => {
    setCompetitors(next);
    void upsertConfig({ competitors: next as never });
    saveStaged(missionId, { competitors: next });
    const existing = new Set(competitors.map((c) => c.toLowerCase()));
    for (const c of next) {
      if (!existing.has(c.toLowerCase())) {
        await supabase.from("competitor_profiles").insert({
          mission_id: missionId,
          organization_name: c,
          is_manually_added: true,
        } as never);
      }
    }
  }, [missionId, upsertConfig, competitors]);

  // ── IRIS extractions ──
  const extractKey = ["mission-iris-extractions", missionId, 3] as const;
  const { data: extractions } = useQuery({
    queryKey: extractKey,
    queryFn: async (): Promise<ExtractionRow[]> => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_field, extracted_value, source_file_name, confidence_score, confirmed_by_user, overridden_by_user")
        .eq("mission_id", missionId)
        .eq("wizard_step", 3)
        .in("extracted_field", STEP3_FIELDS.map((f) => f.key));
      return (data ?? []) as ExtractionRow[];
    },
  });

  useEffect(() => {
    if (extractions === undefined) return;
    if (extractions.length > 0) return;
    let cancelled = false;
    setAnalyzing(true);
    const t = setTimeout(() => { if (!cancelled) setAnalyzing(false); }, 45000);
    analyzeFn({
      data: {
        missionId,
        wizardStep: 3,
        fields: STEP3_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint })),
      },
    })
      .then(() => { if (!cancelled) qc.invalidateQueries({ queryKey: extractKey }); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setAnalyzing(false); clearTimeout(t); } });
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractions === undefined ? "loading" : extractions.length === 0 ? "empty" : "loaded"]);

  async function markExtraction(id: string, patch: { confirmed_by_user?: boolean; overridden_by_user?: boolean }) {
    await supabase.from("mission_iris_extractions").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: extractKey });
  }

  const usableExtractions = (extractions ?? []).filter(
    (e) => !e.overridden_by_user && e.extracted_value,
  );
  const hasTaggedText = (items: OracleTaggedItem[], text: string | null) =>
    !!text && items.some((i) => i.text.trim().toLowerCase() === text.trim().toLowerCase());
  const hasSimpleText = (items: ListItem[], text: string | null) =>
    !!text && items.some((i) => i.text.trim().toLowerCase() === text.trim().toLowerCase());
  const winSuggestions = usableExtractions.filter(
    (e) => e.extracted_field.startsWith("win_theme_") && !hasTaggedText(winThemes, e.extracted_value),
  );
  const riskSuggestions = usableExtractions.filter(
    (e) => e.extracted_field.startsWith("top_risk_") && !hasTaggedText(topRisks, e.extracted_value),
  );
  const discriminatorSuggestions = usableExtractions.filter(
    (e) => e.extracted_field.startsWith("discriminator_") && !hasSimpleText(discriminators, e.extracted_value),
  );
  const proofSuggestions = usableExtractions.filter(
    (e) => e.extracted_field.startsWith("proof_point_") && !hasSimpleText(proofPoints, e.extracted_value),
  );
  const stakeholderSuggestions = usableExtractions.filter((e) => e.extracted_field.startsWith("stakeholder_"));
  const competitorSuggestions = usableExtractions.filter(
    (e) => e.extracted_field.startsWith("competitor_") &&
      !competitors.some((c) => c.toLowerCase() === e.extracted_value!.toLowerCase()),
  );
  const northStarSuggestion = useMemo(
    () => (northStar ? null : usableExtractions.find((e) => e.extracted_field === "north_star")) ?? null,
    [usableExtractions, northStar],
  );
  const centralClaimSuggestion = useMemo(
    () => (centralClaim ? null : usableExtractions.find((e) => e.extracted_field === "central_claim")) ?? null,
    [usableExtractions, centralClaim],
  );

  // Accept helpers
  function acceptToList(
    row: ExtractionRow,
    list: OracleTaggedItem[],
    save: (n: OracleTaggedItem[]) => void,
    authority: OracleSignalAuthority,
  ) {
    void markExtraction(row.id, { confirmed_by_user: true });
    save([
      ...list,
      {
        id: uid(),
        text: row.extracted_value ?? "",
        signal_authority: authority,
        rfp_reference: null,
        confidence: Math.round((row.confidence_score ?? 1) * 100),
        status: "confirmed",
      },
    ]);
  }
  function acceptToSimple(row: ExtractionRow, list: ListItem[], save: (n: ListItem[]) => void, clientStated: boolean) {
    void markExtraction(row.id, { confirmed_by_user: true });
    save([...list, { id: uid(), text: row.extracted_value ?? "", client_stated: clientStated }]);
  }
  function acceptStakeholder(row: ExtractionRow) {
    void markExtraction(row.id, { confirmed_by_user: true });
    const raw = row.extracted_value ?? "";
    const [n, r] = raw.split(/\s*[—\-|·]\s*/);
    void saveStakeholders([
      ...stakeholders,
      { id: uid(), name: (n ?? raw).trim(), role: (r ?? "").trim(), influence: "influencer" },
    ]);
  }
  function acceptCompetitor(row: ExtractionRow) {
    void markExtraction(row.id, { confirmed_by_user: true });
    void saveCompetitors([...competitors, row.extracted_value ?? ""]);
  }

  // ── Advance gate ──
  const missing: string[] = [];
  if (northStar.trim().length < 10) missing.push("North Star");
  if (centralClaim.trim().length < 20) missing.push("Central Claim");
  if (winThemes.length < 2) missing.push("2 Win Themes");
  if (topRisks.length < 1) missing.push("1 Risk");
  if (discriminators.length < 1) missing.push("1 Discriminator");
  const canAdvance = missing.length === 0;

  return (
    <div>
      <WizardStepHeading
        title="Step 3 of 7 — Strategic Foundation"
        subtitle="IRIS has read your documents. Confirm what's right, add what's missing, paste the client's exact language where it matters."
      />

      <div className="flex items-center justify-end gap-3 mb-2 -mt-2 min-h-[18px]">
        {saveState === "saving" && (
          <span className="text-[11px] text-white/55">⏳ Saving…</span>
        )}
        {saveState === "saved" && (
          <span className="text-[11px]" style={{ color: "rgba(134,239,172,0.95)" }}>✅ Saved</span>
        )}
        {saveState === "error" && (
          <span className="inline-flex items-center gap-2 text-[11px]" style={{ color: "#fca5a5" }}>
            ⚠ Save failed — check your connection
            <button onClick={retrySave} className="underline hover:text-white">Retry</button>
          </span>
        )}
        {saveState === "idle" && <SavedTick visible={Date.now() - savedTickAt < 2000} />}
      </div>

      {analyzing && (
        <div className="mb-4 inline-flex items-center gap-2 text-[12px] text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> IRIS is reading your documents…
        </div>
      )}

      {/* ── SECTION A ───────────────────────── */}
      <SectionHeader emoji="🎯" title="Strategic Foundation" />

      <div className="mb-5">
        <h3 className="text-white text-[15px] font-medium mb-2">North Star</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          The single sentence that anchors everything. What is the one truth this pursuit is built on?
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={northStarSuggestion ? [northStarSuggestion] : []}
              onUse={(r) => {
                setNorthStar((r.extracted_value ?? "").slice(0, 150));
                void markExtraction(r.id, { confirmed_by_user: true });
              }}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <ClaimTextarea
              value={northStar}
              onChange={(v) => { setNorthStar(v); if (northStarFromRfp) setNorthStarFromRfp(false); }}
              maxLen={150}
              placeholder="One sentence describing the truth this pursuit is built on…"
              irisSuggestion={null}
              isClientStated={northStarFromRfp}
              onMarkClient={() => setNorthStarFromRfp(true)}
            />
          }
        />
      </div>

      <div className="mb-6">
        <h3 className="text-white text-[15px] font-medium mb-2">Central Claim</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          Complete this sentence: <em>We win this if we convince the state that…</em>
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={centralClaimSuggestion ? [centralClaimSuggestion] : []}
              onUse={(r) => {
                setCentralClaim((r.extracted_value ?? "").slice(0, 200));
                void markExtraction(r.id, { confirmed_by_user: true });
              }}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <ClaimTextarea
              value={centralClaim}
              onChange={(v) => { setCentralClaim(v); if (centralClaimFromRfp) setCentralClaimFromRfp(false); }}
              maxLen={200}
              placeholder="…the next CSA will not just maintain the system — it will transform it."
              irisSuggestion={null}
              isClientStated={centralClaimFromRfp}
              onMarkClient={() => setCentralClaimFromRfp(true)}
            />
          }
        />
      </div>

      <div className="border-t border-white/10 my-6" />

      {/* ── SECTION B ───────────────────────── */}
      <SectionHeader emoji="🏆" title="How We Win" />

      <div className="mb-5">
        <h3 className="text-white text-[15px] font-medium mb-2">Win Themes</h3>
        <TwoColumn
          left={
            <IrisLeft
              rows={winSuggestions}
              onUse={(r) => acceptToList(r, winThemes, saveWinThemes, "client_stated")}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <TaggedListEditor
              prompt="What wins this pursuit? Tag each theme by source — RFP language carries the highest weight."
              items={winThemes}
              onChange={saveWinThemes}
              min={2}
              max={5}
              inputPlaceholder="Add a win theme — press Enter."
            />
          }
        />
      </div>

      <div className="mb-5">
        <h3 className="text-white text-[15px] font-medium mb-2">Discriminators</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          What makes Athena specifically different from every other bidder? Not generic strengths — the things only we can say.
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={discriminatorSuggestions}
              onUse={(r) => acceptToSimple(r, discriminators, saveDiscriminators, true)}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <SimpleListEditor
              items={discriminators}
              onChange={saveDiscriminators}
              max={4}
              maxLen={100}
              addPlaceholder="+ Add a discriminator — press Enter."
            />
          }
        />
      </div>

      <div className="mb-6">
        <h3 className="text-white text-[15px] font-medium mb-2">Proof Points</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          Evidence that backs the claim — data, outcomes, performance metrics. IRIS will suggest from your documents.
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={proofSuggestions}
              onUse={(r) => acceptToSimple(r, proofPoints, saveProofPoints, true)}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <SimpleListEditor
              items={proofPoints}
              onChange={saveProofPoints}
              max={8}
              maxLen={150}
              addPlaceholder="+ Add a proof point — press Enter."
              pasteLabel="+ Paste the client's exact language (verbatim language scores highest)"
              pastePlaceholder="Paste the state's exact words — evaluation criteria, scoring rubrics, required outcomes…"
            />
          }
        />
      </div>

      <div className="border-t border-white/10 my-6" />

      {/* ── SECTION C ───────────────────────── */}
      <SectionHeader emoji="👀" title="What We're Watching" />

      <div className="mb-5">
        <h3 className="text-white text-[15px] font-medium mb-2">Top Risks</h3>
        <TwoColumn
          left={
            <IrisLeft
              rows={riskSuggestions}
              onUse={(r) => acceptToList(r, topRisks, saveTopRisks, "client_stated")}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={
            <TaggedListEditor
              prompt="What could cost us this pursuit? Tag each risk by source — RFP-stated risks become gates in the brief."
              items={topRisks}
              onChange={saveTopRisks}
              min={1}
              max={5}
              inputPlaceholder="Add a top risk — press Enter."
            />
          }
        />
      </div>

      <div className="mb-5">
        <h3 className="text-white text-[15px] font-medium mb-2">Key Stakeholders</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          Who has influence over this decision? IRIS will suggest from the documents — add anyone it missed.
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={stakeholderSuggestions}
              onUse={(r) => acceptStakeholder(r)}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={<StakeholderEditor items={stakeholders} onChange={(n) => void saveStakeholders(n)} />}
        />
      </div>

      <div className="mb-6">
        <h3 className="text-white text-[15px] font-medium mb-2">Likely Competitors</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          Who else is going to bid? IRIS will suggest based on program type and state history. (Monitoring intensity is set in Step 4.)
        </p>
        <TwoColumn
          left={
            <IrisLeft
              rows={competitorSuggestions}
              onUse={(r) => acceptCompetitor(r)}
              onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
            />
          }
          right={<CompetitorChips items={competitors} onChange={(n) => void saveCompetitors(n)} max={6} />}
        />
      </div>


      {/* Gate indicator */}
      <div
        className="rounded-lg p-3 mb-4 text-[12.5px]"
        style={{
          background: canAdvance ? "rgba(134,239,172,0.06)" : "rgba(251,191,36,0.06)",
          border: canAdvance ? "1px solid rgba(134,239,172,0.25)" : "1px solid rgba(251,191,36,0.3)",
          color: canAdvance ? "rgba(187,247,208,0.9)" : "rgba(252,211,77,0.95)",
        }}
      >
        {canAdvance
          ? "✅ Ready to advance"
          : `⚠ Required: ${missing.join(" · ")}`}
      </div>

      <WizardFooter
        step={3}
        onBack={onBack}
        onContinue={onAdvance}
        continueDisabled={!canAdvance}
        continueHint={!canAdvance ? `Still needed: ${missing.join(", ")}` : undefined}
      />
    </div>
  );
}
