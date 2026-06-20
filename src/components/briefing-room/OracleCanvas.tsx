// ORACLE Canvas — persistent living strategy surface.
// Sources from oracle_engagement_config.
// Leaders (founder/pm) can read and write.
// Writers and viewers see read-only content only.
// No edit controls rendered for non-editors — not greyed out, absent entirely.
//
// TODO: ORACLE V2 — wire approved oracle_signals into this canvas
// so high-confidence signals can be promoted to win themes or risks
// by leadership without leaving the Briefing Room.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Star,
  Diamond,
  Sparkles,
  Pencil,
  X,
  Plus,
  ShieldAlert,
  Eye,
  Activity,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C49A2B";
const MUTED = "rgba(255,255,255,0.55)";
const CARD_BG = "rgba(255,255,255,0.04)";
const CARD_BORDER = "rgba(255,255,255,0.08)";

type SignalAuthority = "client_stated" | "team_validated" | "iris_suggested";

interface TaggedItem {
  id: string;
  text: string;
  signal_authority: SignalAuthority;
  rfp_reference: string | null;
  confidence: number;
  status: string;
}

interface OracleConfig {
  north_star: string | null;
  win_themes: TaggedItem[] | null;
  top_risks: TaggedItem[] | null;
  competitors: string[] | null;
  monitoring_mode: "conservative" | "balanced" | "aggressive" | null;
  signal_threshold: number | null;
  status: "draft" | "active" | "paused" | "archived" | null;
}

function AuthorityIcon({ authority }: { authority: SignalAuthority }) {
  if (authority === "client_stated") return <Star size={12} fill={GOLD} color={GOLD} />;
  if (authority === "team_validated") return <Diamond size={12} color={GOLD} />;
  return <Sparkles size={12} color={MUTED} />;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
    >
      <div
        className="flex items-center gap-2 mb-3"
        style={{
          color: GOLD,
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export type OracleCanvasSection = "northStar" | "winThemes" | "risks" | "competitors" | "badge";

export function OracleCanvas({
  missionId,
  canEdit,
  only,
  winThemesCollapsed = false,
}: {
  missionId: string;
  canEdit: boolean;
  only?: OracleCanvasSection[];
  winThemesCollapsed?: boolean;
}) {
  const show = (s: OracleCanvasSection) => !only || only.includes(s);
  const { data: oracleConfig, refetch } = useQuery({
    queryKey: ["oracle-canvas", missionId],
    queryFn: async () => {
      const [cfgRes, missionRes, themesRes, risksRes, compsRes] = await Promise.all([
        supabase
          .from("oracle_engagement_config")
          .select("north_star, win_themes, top_risks, competitors, monitoring_mode, signal_threshold, status")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase.from("missions").select("known_competitors").eq("id", missionId).maybeSingle(),
        supabase
          .from("mission_win_themes")
          .select("id, title, why_it_matters, status, display_order")
          .eq("mission_id", missionId)
          .order("display_order", { ascending: true }),
        supabase
          .from("mission_risks")
          .select("id, title, description, severity, status")
          .eq("mission_id", missionId)
          .neq("status", "Closed"),
        supabase
          .from("competitor_profiles")
          .select("id, organization_name")
          .eq("mission_id", missionId),
      ]);

      const cfg = (cfgRes.data ?? null) as OracleConfig | null;
      const cfgThemes = Array.isArray(cfg?.win_themes) ? (cfg!.win_themes as TaggedItem[]) : [];
      const cfgRisks = Array.isArray(cfg?.top_risks) ? (cfg!.top_risks as TaggedItem[]) : [];
      const cfgComps = Array.isArray(cfg?.competitors) ? (cfg!.competitors as string[]) : [];

      const fallbackThemes: TaggedItem[] = cfgThemes.length
        ? cfgThemes
        : ((themesRes.data ?? []).filter((t: any) => t.status !== "archived")).map((t: any) => ({
            id: t.id,
            text: t.why_it_matters ? `${t.title} — ${t.why_it_matters}` : t.title,
            signal_authority: "team_validated" as SignalAuthority,
            rfp_reference: null,
            confidence: 80,
            status: t.status ?? "active",
          }));

      const fallbackRisks: TaggedItem[] = cfgRisks.length
        ? cfgRisks
        : (risksRes.data ?? []).map((r: any) => ({
            id: r.id,
            text: r.description ? `${r.title} — ${r.description}` : r.title,
            signal_authority: "team_validated" as SignalAuthority,
            rfp_reference: null,
            confidence: 70,
            status: r.severity ?? r.status ?? "active",
          }));

      const known = ((missionRes.data?.known_competitors ?? []) as string[]) || [];
      const profileNames = (compsRes.data ?? []).map((c: any) => c.organization_name).filter(Boolean);
      const mergedComps = cfgComps.length
        ? cfgComps
        : Array.from(new Set([...profileNames, ...known]));

      return {
        north_star: cfg?.north_star ?? null,
        win_themes: fallbackThemes,
        top_risks: fallbackRisks,
        competitors: mergedComps,
        monitoring_mode: cfg?.monitoring_mode ?? "balanced",
        signal_threshold: cfg?.signal_threshold ?? 40,
        status: cfg?.status ?? "active",
      } as unknown as OracleConfig;
    },
    staleTime: 30_000,
  });

  if (!oracleConfig) return null;

  const winThemes: TaggedItem[] = Array.isArray(oracleConfig.win_themes)
    ? (oracleConfig.win_themes as TaggedItem[])
    : [];
  const topRisks: TaggedItem[] = Array.isArray(oracleConfig.top_risks)
    ? (oracleConfig.top_risks as TaggedItem[])
    : [];
  const competitors: string[] = Array.isArray(oracleConfig.competitors)
    ? (oracleConfig.competitors as string[])
    : [];

  async function save(patch: Partial<OracleConfig>) {
    const { error } = await supabase
      .from("oracle_engagement_config")
      .upsert(
        {
          mission_id: missionId,
          north_star: oracleConfig?.north_star ?? null,
          win_themes: (oracleConfig?.win_themes ?? []) as never,
          top_risks: (oracleConfig?.top_risks ?? []) as never,
          competitors: (oracleConfig?.competitors ?? []) as never,
          monitoring_mode: oracleConfig?.monitoring_mode ?? "balanced",
          signal_threshold: oracleConfig?.signal_threshold ?? 40,
          status: oracleConfig?.status ?? "active",
          ...patch,
        } as never,
        { onConflict: "mission_id" },
      );
    if (error) {
      toast.error("Save failed");
      return false;
    }
    toast.success("Saved");
    refetch();
    return true;
  }

  return (
    <div className="space-y-3">
      {/* North Star */}
      {show("northStar") && (oracleConfig.north_star ? (
        <Section title="North Star">
          <div
            style={{
              color: GOLD,
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.6,
              fontWeight: 500,
            }}
          >
            “{oracleConfig.north_star}”
          </div>
        </Section>
      ) : canEdit ? (
        <Section title="North Star">
          <NorthStarEditor onSave={(v) => save({ north_star: v })} />
        </Section>
      ) : null)}

      {/* Win Themes */}
      {show("winThemes") && (
        <Section title="How We Win" icon={<Star size={11} />}>
          <ThemeList
            items={winThemes}
            canEdit={canEdit}
            collapsible={winThemesCollapsed}
            emptyEdit="No win themes configured. Add your first win theme."
            emptyRead="Win themes will appear here once configured."
            addLabel="Add win theme"
            onChange={(next) => save({ win_themes: next as never })}
          />
        </Section>
      )}

      {/* Strategic Risks */}
      {show("risks") && (
        <Section title="Strategic Risks" icon={<ShieldAlert size={11} />}>
          <ThemeList
            items={topRisks}
            canEdit={canEdit}
            emptyEdit="No strategic risks tracked. Add your first risk."
            emptyRead="Strategic risks will appear here once configured."
            addLabel="Add risk"
            onChange={(next) => save({ top_risks: next as never })}
          />
        </Section>
      )}

      {/* Competitors */}
      {show("competitors") && (competitors.length > 0 || canEdit) && (
        <Section title="Monitored Competitors" icon={<Eye size={11} />}>
          <CompetitorChips
            items={competitors}
            canEdit={canEdit}
            onChange={(next) => save({ competitors: next as never })}
          />
        </Section>
      )}

      {/* Status badge */}
      {show("badge") && (
        <div className="flex justify-end items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full"
            style={{
              fontSize: 10,
              padding: "4px 10px",
              background: "rgba(255,255,255,0.04)",
              border: `0.5px solid ${CARD_BORDER}`,
              color: MUTED,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: oracleConfig.status === "active" ? "#4ade80" : "#888",
              }}
            />
            <Activity size={10} />
            ORACLE · {capitalize(oracleConfig.monitoring_mode ?? "balanced")}
          </span>
        </div>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ─────────── North Star editor (empty state) ─────────── */
function NorthStarEditor({ onSave }: { onSave: (v: string) => Promise<boolean> }) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Set your North Star…"
        className="flex-1 rounded px-2 py-1"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: `1px solid ${CARD_BORDER}`,
          color: "white",
          fontSize: 12,
        }}
      />
      <button
        disabled={!val.trim() || saving}
        onClick={async () => {
          setSaving(true);
          const ok = await onSave(val.trim());
          setSaving(false);
          if (ok) setVal("");
        }}
        style={{
          color: GOLD,
          fontSize: 11,
          fontWeight: 600,
          padding: "0 10px",
        }}
      >
        Save
      </button>
    </div>
  );
}

/* ─────────── Theme/Risk list ─────────── */
function ThemeList({
  items,
  canEdit,
  emptyEdit,
  emptyRead,
  addLabel,
  onChange,
  collapsible = false,
}: {
  items: TaggedItem[];
  canEdit: boolean;
  emptyEdit: string;
  emptyRead: string;
  addLabel: string;
  onChange: (next: TaggedItem[]) => Promise<boolean>;
  collapsible?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function removeItem(id: string) {
    await onChange(items.filter((i) => i.id !== id));
  }
  async function addItem(item: TaggedItem) {
    const ok = await onChange([...items, item]);
    if (ok) setAdding(false);
  }
  async function updateItem(item: TaggedItem) {
    const ok = await onChange(items.map((i) => (i.id === item.id ? item : i)));
    if (ok) setEditingId(null);
  }

  if (items.length === 0 && !adding) {
    return (
      <div className="space-y-2">
        <div style={{ color: MUTED, fontSize: 11, fontStyle: "italic" }}>
          {canEdit ? emptyEdit : emptyRead}
        </div>
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1"
            style={{ color: GOLD, fontSize: 11, fontWeight: 600 }}
          >
            <Plus size={12} /> {addLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it) =>
        editingId === it.id ? (
          <ItemForm
            key={it.id}
            initial={it}
            onCancel={() => setEditingId(null)}
            onSave={updateItem}
          />
        ) : collapsible ? (
          (() => {
            const [title, ...rest] = String(it.text ?? "").split(" — ");
            const detail = rest.join(" — ").trim();
            const isExpanded = expandedIds.has(it.id);
            return (
              <div key={it.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <button
                  type="button"
                  onClick={() => toggleExpand(it.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: GOLD,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: "white",
                      fontSize: 12,
                      fontWeight: 500,
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {title}
                  </span>
                  <ChevronDown
                    size={12}
                    style={{ color: MUTED, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                  />
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2 pt-1" style={{ borderTop: `1px solid ${CARD_BORDER}` }}>
                    {detail && (
                      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11.5, lineHeight: 1.5 }}>
                        {detail}
                      </div>
                    )}
                    {it.rfp_reference && (
                      <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>{it.rfp_reference}</div>
                    )}
                    {canEdit && (
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => setEditingId(it.id)} style={{ color: MUTED }} aria-label="Edit">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => removeItem(it.id)} style={{ color: MUTED }} aria-label="Remove">
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div
            key={it.id}
            className="flex items-start gap-2 rounded-lg p-2"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <div className="mt-1 shrink-0">
              <AuthorityIcon authority={it.signal_authority} />
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ color: "white", fontSize: 12, lineHeight: 1.5 }}>
                {it.text}
              </div>
              {it.rfp_reference && (
                <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>
                  {it.rfp_reference}
                </div>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditingId(it.id)} style={{ color: MUTED }} aria-label="Edit">
                  <Pencil size={12} />
                </button>
                <button onClick={() => removeItem(it.id)} style={{ color: MUTED }} aria-label="Remove">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ),
      )}
      {adding && <ItemForm onCancel={() => setAdding(false)} onSave={addItem} />}
      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1"
          style={{ color: GOLD, fontSize: 11, fontWeight: 600 }}
        >
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: TaggedItem;
  onSave: (item: TaggedItem) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [authority, setAuthority] = useState<SignalAuthority>(
    initial?.signal_authority ?? "team_validated",
  );
  const [rfp, setRfp] = useState(initial?.rfp_reference ?? "");
  const [saving, setSaving] = useState(false);

  const AUTHS: { value: SignalAuthority; label: string }[] = [
    { value: "client_stated", label: "Client-Stated" },
    { value: "team_validated", label: "Team-Validated" },
    { value: "iris_suggested", label: "IRIS-Suggested" },
  ];

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${CARD_BORDER}` }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Theme or risk text…"
        className="w-full rounded px-2 py-1"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: `1px solid ${CARD_BORDER}`,
          color: "white",
          fontSize: 12,
        }}
      />
      <div className="flex gap-1">
        {AUTHS.map((a) => (
          <button
            key={a.value}
            onClick={() => setAuthority(a.value)}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              border: `1px solid ${authority === a.value ? GOLD : CARD_BORDER}`,
              color: authority === a.value ? GOLD : MUTED,
              background: authority === a.value ? "rgba(196,154,43,0.08)" : "transparent",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <input
        value={rfp}
        onChange={(e) => setRfp(e.target.value)}
        placeholder="RFP reference (optional)"
        className="w-full rounded px-2 py-1"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: `1px solid ${CARD_BORDER}`,
          color: "white",
          fontSize: 11,
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          style={{ color: MUTED, fontSize: 11 }}
        >
          Cancel
        </button>
        <button
          disabled={!text.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await onSave({
              id: initial?.id ?? crypto.randomUUID(),
              text: text.trim(),
              signal_authority: authority,
              rfp_reference: rfp.trim() || null,
              confidence: initial?.confidence ?? 0.8,
              status: "confirmed",
            });
            setSaving(false);
          }}
          style={{ color: GOLD, fontSize: 11, fontWeight: 600 }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ─────────── Competitor chips ─────────── */
function CompetitorChips({
  items,
  canEdit,
  onChange,
}: {
  items: string[];
  canEdit: boolean;
  onChange: (next: string[]) => Promise<boolean>;
}) {
  const [val, setVal] = useState("");

  if (items.length === 0 && !canEdit) return null;

  return (
    <div>
      {items.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 11, fontStyle: "italic", marginBottom: 8 }}>
          No competitors tracked yet. Add competitors to activate monitoring.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full"
              style={{
                fontSize: 11,
                padding: "3px 10px",
                background: "rgba(196,154,43,0.08)",
                border: "0.5px solid rgba(196,154,43,0.25)",
                color: GOLD,
              }}
            >
              {c}
              {canEdit && (
                <button
                  onClick={() => onChange(items.filter((x) => x !== c))}
                  aria-label={`Remove ${c}`}
                  style={{ color: MUTED }}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {canEdit && (
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && val.trim()) {
              const name = val.trim();
              if (!items.includes(name)) {
                const ok = await onChange([...items, name]);
                if (ok) setVal("");
              } else {
                setVal("");
              }
            }
          }}
          placeholder="Add competitor and press Enter"
          className="w-full rounded px-2 py-1"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: `1px solid ${CARD_BORDER}`,
            color: "white",
            fontSize: 11,
          }}
        />
      )}
    </div>
  );
}
