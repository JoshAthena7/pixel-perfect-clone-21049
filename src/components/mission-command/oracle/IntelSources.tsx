import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X, ExternalLink } from "lucide-react";

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
        <div className="text-xs text-white/50">{sources.length} {sources.length === 1 ? "source" : "sources"}</div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          <Plus className="h-3 w-3" /> Add Source
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : sources.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-6">
          {SOURCE_GROUPS.map((g) => {
            const items = sources.filter((s) => s.source_type === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id}>
                <div className="text-[10px] uppercase tracking-wider mb-2 pb-1" style={{ color: g.color, borderBottom: `1px solid ${g.color}33` }}>
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

function SourceCard({ source, accent }: { source: any; accent: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${accent}33`, borderLeftWidth: 3 }}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white font-medium flex items-center gap-2">
            {source.name || "Untitled"}
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/70">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {source.summary && <div className="text-xs text-white/55 mt-1 line-clamp-2">{source.summary}</div>}
          <div className="flex gap-3 mt-2 text-[10px] text-white/40">
            {source.author && <span>by {source.author}</span>}
            {source.published_at && <span>{source.published_at}</span>}
          </div>
        </div>
        {source.credibility_score && (
          <div style={{ fontSize: 10, color: GOLD }}>
            {"★".repeat(source.credibility_score)}
            <span style={{ color: "rgba(255,255,255,0.2)" }}>{"★".repeat(5 - source.credibility_score)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-sm text-white/60">No sources captured yet.</div>
      <button onClick={onAdd} className="mt-3 text-xs underline" style={{ color: GOLD }}>Add your first source</button>
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
          <h3 className="text-sm font-medium text-white">Add Source</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Name / Title *">
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
          <Field label="Type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {SOURCE_GROUPS.map((g) => <option key={g.id} value={g.id} style={{ background: "#0a121e" }}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="URL">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
          <Field label="Summary">
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/60">Cancel</button>
          <button onClick={submit} disabled={saving || !name.trim()} className="px-3 py-1.5 text-xs rounded" style={{ background: GOLD, color: "#000" }}>
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
      <label className="text-xs text-white/60 block mb-1">{label}</label>
      {children}
    </div>
  );
}
