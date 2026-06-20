import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X, ExternalLink } from "lucide-react";
import { listOracleSourcesForMission } from "@/lib/oracle-intel.functions";

const GOLD = "#C49A2B";

const SOURCE_GROUPS = [
  { id: "rfp", label: "RFP", color: "#C49A2B" },
  { id: "amendment", label: "Amendments", color: "#f59e0b" },
  { id: "report", label: "Research Reports", color: "#8b5cf6" },
  { id: "news", label: "News", color: "#3b82f6" },
  { id: "interview", label: "Interview Notes", color: "#10b981" },
  { id: "meeting_notes", label: "Meeting Notes", color: "#06b6d4" },
  { id: "procurement_record", label: "Procurement Records", color: "#ec4899" },
  { id: "press_release", label: "Press Releases", color: "#f97316" },
  { id: "website", label: "Websites", color: "#64748b" },
  { id: "upload", label: "Uploads", color: "#a3e635" },
  { id: "other", label: "Other Sources", color: "#94a3b8" },
];

// Map raw source_type values from intel_sources onto the visible groups above.
// Anything unmapped falls into the "other" bucket so rows are never invisible.
const SOURCE_TYPE_ALIASES: Record<string, string> = {
  webpage: "website",
  web_monitor: "website",
  rss: "news",
  press: "press_release",
  meeting_agenda: "meeting_notes",
  internal_debrief: "interview",
  procurement_portal: "procurement_record",
  legislative: "report",
  budget: "report",
  conference: "report",
  job_posting: "other",
  provider_association: "other",
  advocacy: "other",
};
const groupIdFor = (raw: string | null | undefined): string => {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "other";
  if (SOURCE_GROUPS.some((g) => g.id === t)) return t;
  return SOURCE_TYPE_ALIASES[t] ?? "other";
};

export function IntelSources({ missionId }: { missionId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();
  const listOracleSourcesFn = useServerFn(listOracleSourcesForMission);

  const { data: oracleSources = [] } = useQuery({
    queryKey: ["oracle-source-registry", missionId],
    queryFn: () => listOracleSourcesFn({ data: { missionId } }),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["intel-sources", missionId],
    queryFn: async () => {
      const [{ data: srcs }, { data: ents }] = await Promise.all([
        (supabase as any).from("intel_sources").select("*").eq("mission_id", missionId).order("created_at", { ascending: false }),
        (supabase as any).from("intel_entities").select("id,name").eq("entity_type", "source"),
      ]);
      const nameById = new Map<string, string>((ents ?? []).map((e: any) => [e.id, e.name]));
      return ((srcs ?? []) as any[]).map((s: any) => ({ ...s, name: nameById.get(s.entity_id) }));
    },
  });

  const sources = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-[12px] text-white/50">
          {oracleSources.length} ORACLE · {sources.length} legacy
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-[12px]"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          <Plus className="h-3 w-3" /> Add Source
        </button>
      </div>

      {oracleSources.length > 0 && (
        <section>
          <div className="text-[11px]   mb-2 pb-1" style={{ color: GOLD, borderBottom: `1px solid ${GOLD}33` }}>
            ORACLE Source Registry ({oracleSources.length})
          </div>
          <div className="space-y-2">
            {(oracleSources as any[]).map((s) => <OracleSourceCard key={s.id} source={s} />)}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <div className="text-[11px]   pt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          Legacy Sources
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : sources.length === 0 && oracleSources.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : sources.length === 0 ? null : (
        <div className="space-y-6">
          {SOURCE_GROUPS.map((g) => {
            const items = sources.filter((s) => groupIdFor(s.source_type) === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id}>
                <div className="text-[11px]   mb-2 pb-1" style={{ color: g.color, borderBottom: `1px solid ${g.color}33` }}>
                  {g.label} ({items.length})
                </div>
                <div className="space-y-2">
                  {items.map((s) => <SourceCard key={s.id} source={s} accent={g.color} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddSourceDialog
          missionId={missionId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["intel-sources", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-completeness", missionId] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function deriveTitle(source: any): string {
  if (source.name) return source.name;
  if (source.notes) return String(source.notes).slice(0, 80);
  if (source.url) {
    try {
      const u = new URL(source.url);
      const path = u.pathname.replace(/\/$/, "");
      return path ? `${u.hostname}${path}` : u.hostname;
    } catch {
      return source.url;
    }
  }
  if (source.file_path) return String(source.file_path).split("/").pop() || "Untitled";
  return "Untitled";
}

function SourceCard({ source, accent }: { source: any; accent: string }) {
  const title = deriveTitle(source);
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${accent}33`, borderLeftWidth: 3 }}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-white font-medium flex items-center gap-2">
            <span className="truncate">{title}</span>
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/70 shrink-0">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {source.summary && <div className="text-[12px] text-white/55 mt-1 line-clamp-2">{source.summary}</div>}
          <div className="flex gap-3 mt-2 text-[11px] text-white/40">
            {source.author && <span>by {source.author}</span>}
            {source.published_at && <span>{source.published_at}</span>}
          </div>
        </div>
        {source.credibility_score != null && (() => {
          // credibility_score is stored on a 0–100 scale. Convert to a 0–5 star
          // count and clamp — otherwise String.repeat throws RangeError on
          // values outside [0, ∞), which crashes the whole route.
          const raw = Number(source.credibility_score);
          const stars = Math.max(0, Math.min(5, Math.round((raw > 5 ? raw / 20 : raw))));
          return (
            <div style={{ fontSize: 10, color: GOLD }}>
              {"★".repeat(stars)}
              <span style={{ color: "rgba(255,255,255,0.2)" }}>{"★".repeat(5 - stars)}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function tierColor(tier: string) {
  if (tier === "platform") return "#3b82f6";
  if (tier === "state") return GOLD;
  return "#a855f7";
}

function statusDot(status: string) {
  if (status === "active") return "#22c55e";
  if (status === "paused") return "#f59e0b";
  return "#ef4444";
}

function relTime(iso: string | null | undefined) {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function OracleSourceCard({ source }: { source: any }) {
  const tColor = tierColor(source.tier);
  const sColor = statusDot(source.status);
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${tColor}33`, borderLeftWidth: 3 }}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-white font-medium flex items-center gap-2">
            <span className="truncate">{source.source_name}</span>
            {source.source_url && (
              <a href={source.source_url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/70 shrink-0">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {source.description && <div className="text-[12px] text-white/55 mt-1 line-clamp-2">{source.description}</div>}
          <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-white/45">
            <span
              style={{
                padding: "1px 6px", borderRadius: 3,
                background: `${tColor}22`, color: tColor, border: `1px solid ${tColor}55`,
                textTransform: "", letterSpacing: "0.06em", fontWeight: 600,
              }}
            >
              {source.tier}{source.tier === "state" && source.state_code ? ` · ${source.state_code}` : ""}
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: sColor, display: "inline-block" }} />
              {source.status}
            </span>
            <span>Checked {relTime(source.last_checked_at)}</span>
            {typeof source.signal_count === "number" && (
              <span>{source.signal_count} signal{source.signal_count === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-[14px] text-white/60">No sources captured yet.</div>
      <button onClick={onAdd} className="mt-3 text-[12px] underline" style={{ color: GOLD }}>Add your first source</button>
    </div>
  );
}

function AddSourceDialog({ missionId, onClose, onSaved }: { missionId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("report");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: ent, error: e1 } = await (supabase as any)
        .from("intel_entities")
        .insert({ entity_type: "source", name: name.trim(), mission_ids: [missionId] })
        .select()
        .single();
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("intel_sources").insert({
        entity_id: ent.id,
        mission_id: missionId,
        source_type: sourceType,
        url: url || null,
        summary: summary || null,
      });
      if (e2) throw e2;
      onSaved();
    } catch (err) {
      console.error("[AddSource] failed", err);
      alert("Failed to save source.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-lg p-5" style={{ background: "#0a121e", border: "1px solid rgba(196,154,43,0.3)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[14px] font-medium text-white">Add Source</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Name / Title *">
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
          <Field label="Type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {SOURCE_GROUPS.map((g) => <option key={g.id} value={g.id} style={{ background: "#0a121e" }}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="URL">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
          <Field label="Summary">
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/60">Cancel</button>
          <button onClick={submit} disabled={saving || !name.trim()} className="px-3 py-1.5 text-[12px] rounded" style={{ background: GOLD, color: "#000" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] text-white/60 block mb-1">{label}</label>
      {children}
    </div>
  );
}
