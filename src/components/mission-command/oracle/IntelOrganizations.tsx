import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X, Sparkles, Building2 } from "lucide-react";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";

const GOLD = "#C49A2B";

const ORG_CATEGORIES = ["regulatory_state", "regulatory_federal", "quality_performance"];

const ORG_TYPE_OPTIONS = [
  { value: "competitor", label: "Competitor" },
  { value: "agency", label: "State Agency" },
  { value: "provider", label: "Provider" },
  { value: "advocacy", label: "Advocacy" },
  { value: "vendor", label: "Vendor" },
  { value: "partner", label: "Partner" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "unknown", label: "Other" },
];

type SourceEntry = {
  key: string;
  name: string;
  category: string;
  count: number;
  lastUpdated: string | null;
  fromOracle: boolean;
};

export function IntelOrganizations({ missionId }: { missionId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["intel-orgs-sourced", missionId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data: m } = await sb.from("missions").select("state_code").eq("id", missionId).maybeSingle();
      const stateCode = m?.state_code ?? null;
      const orParts = [`tier.eq.platform`, `and(tier.eq.mission,mission_id.eq.${missionId})`];
      if (stateCode) orParts.push(`and(tier.eq.state,state_code.eq.${stateCode})`);

      const [{ data: signals }, { data: orgs }, { data: ents }] = await Promise.all([
        sb
          .from("oracle_signals")
          .select("source_name, category, created_at")
          .in("category", ORG_CATEGORIES)
          .neq("status", "dismissed")
          .or(orParts.join(",")),
        sb.from("intel_organizations").select("*").eq("mission_id", missionId),
        sb.from("intel_entities").select("id,name").eq("entity_type", "organization"),
      ]);

      const oracleMap = new Map<string, SourceEntry>();
      for (const s of (signals ?? []) as any[]) {
        const name = (s.source_name ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const existing = oracleMap.get(key);
        if (existing) {
          existing.count += 1;
          if (!existing.lastUpdated || (s.created_at && s.created_at > existing.lastUpdated)) {
            existing.lastUpdated = s.created_at;
          }
        } else {
          oracleMap.set(key, {
            key,
            name,
            category: s.category,
            count: 1,
            lastUpdated: s.created_at,
            fromOracle: true,
          });
        }
      }
      const oracleEntries = Array.from(oracleMap.values()).sort((a, b) => b.count - a.count);

      const nameById = new Map<string, string>(((ents ?? []) as any[]).map((e) => [e.id, e.name]));
      const legacyEntries = ((orgs ?? []) as any[])
        .map((o) => ({ ...o, name: nameById.get(o.entity_id) }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

      return { oracleEntries, legacyEntries };
    },
  });

  const oracleEntries = data?.oracleEntries ?? [];
  const legacyEntries = data?.legacyEntries ?? [];
  const totalCount = oracleEntries.length + legacyEntries.length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-[12px] text-white/50">
          {totalCount} {totalCount === 1 ? "organization" : "organizations"}
          {oracleEntries.length > 0 && legacyEntries.length > 0 && (
            <span className="ml-1 text-white/30">
              ({oracleEntries.length} ORACLE · {legacyEntries.length} manual)
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-[12px]"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          <Plus className="h-3 w-3" /> Add Organization
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : totalCount === 0 ? (
        <EmptyState missionId={missionId} onAdd={() => setShowAdd(true)} onSeeded={() => qc.invalidateQueries({ queryKey: ["intel-orgs-sourced", missionId] })} />
      ) : (
        <div className="space-y-6">
          {oracleEntries.length > 0 && (
            <section>
              <div className="text-[11px]   mb-2 pb-1" style={{ color: GOLD, borderBottom: `1px solid ${GOLD}33` }}>
                ORACLE Sources ({oracleEntries.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {oracleEntries.map((e) => <SourceCard key={e.key} entry={e} />)}
              </div>
            </section>
          )}
          {legacyEntries.length > 0 && (
            <section>
              <div className="text-[11px]   mb-2 pb-1 text-white/55" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                Manual Entries ({legacyEntries.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {legacyEntries.map((o: any) => <LegacyOrgCard key={o.id} org={o} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {showAdd && (
        <AddOrgDialog
          missionId={missionId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["intel-orgs-sourced", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function SourceCard({ entry }: { entry: SourceEntry }) {
  const dt = entry.lastUpdated ? new Date(entry.lastUpdated) : null;
  const dtLabel = dt ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${GOLD}33`, borderLeftWidth: 3, borderLeftColor: GOLD }}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="text-[14px] text-white font-medium flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            <span className="truncate">{entry.name}</span>
          </div>
          <div className="text-[11px] text-white/45 mt-0.5  ">{entry.category.replace(/_/g, " ")}</div>
        </div>
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(196,154,43,0.15)", color: GOLD, border: `0.5px solid ${GOLD}55`, whiteSpace: "nowrap" }}>
          ORACLE
        </span>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-white/55">
        <span>{entry.count} {entry.count === 1 ? "item" : "items"}</span>
        <span>Updated {dtLabel}</span>
      </div>
    </div>
  );
}

function LegacyOrgCard({ org }: { org: any }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: "1px solid rgba(255,255,255,0.08)", borderLeftWidth: 3, borderLeftColor: "rgba(255,255,255,0.2)" }}>
      <div className="flex justify-between items-start">
        <div className="text-[14px] text-white font-medium truncate">{org.name || "Unnamed"}</div>
        {org.incumbency_status && org.incumbency_status !== "unknown" && (
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
            {org.incumbency_status}
          </span>
        )}
      </div>
      {org.known_strengths?.length > 0 && (
        <div className="text-[12px] text-white/55 mt-1">
          <span className="text-emerald-400/70">Strengths:</span> {org.known_strengths.slice(0, 3).join(", ")}
        </div>
      )}
      {org.known_weaknesses?.length > 0 && (
        <div className="text-[12px] text-white/55 mt-0.5">
          <span className="text-red-400/70">Weaknesses:</span> {org.known_weaknesses.slice(0, 3).join(", ")}
        </div>
      )}
      {org.notes && <div className="text-[12px] text-white/50 mt-2 line-clamp-2">{org.notes}</div>}
    </div>
  );
}

function EmptyState({ missionId, onAdd, onSeeded }: { missionId: string; onAdd: () => void; onSeeded: () => void }) {
  const seedFn = useServerFn(seedMissionIntelligence);
  const [seeding, setSeeding] = useState(false);
  const generate = async () => {
    setSeeding(true);
    try {
      await seedFn({ data: { missionId, force: true } });
      onSeeded();
    } catch (e) {
      console.log("[intel-orgs] generate failed", e);
    } finally {
      setSeeding(false);
    }
  };
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-[14px] text-white/60">No organizations or regulatory sources captured yet.</div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          onClick={generate}
          disabled={seeding}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] disabled:opacity-50"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {seeding ? "Generating…" : "Generate with IRIS"}
        </button>
        <button onClick={onAdd} className="text-[12px] underline" style={{ color: GOLD }}>Add manually</button>
      </div>
    </div>
  );
}

function AddOrgDialog({ missionId, onClose, onSaved }: { missionId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("competitor");
  const [incumbency, setIncumbency] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: ent, error: e1 } = await (supabase as any)
        .from("intel_entities")
        .insert({ entity_type: "organization", name: name.trim(), mission_ids: [missionId] })
        .select()
        .single();
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("intel_organizations").insert({
        entity_id: ent.id,
        mission_id: missionId,
        org_type: orgType,
        incumbency_status: incumbency,
        notes: notes || null,
      });
      if (e2) throw e2;
      onSaved();
    } catch (err) {
      console.error("[AddOrg] failed", err);
      alert("Failed to save organization.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-lg p-5" style={{ background: "#0a121e", border: "1px solid rgba(196,154,43,0.3)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[14px] font-medium text-white">Add Organization</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} /></Field>
          <Field label="Type">
            <select value={orgType} onChange={(e) => setOrgType(e.target.value)} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {ORG_TYPE_OPTIONS.map((g) => <option key={g.value} value={g.value} style={{ background: "#0a121e" }}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="Incumbency">
            <select value={incumbency} onChange={(e) => setIncumbency(e.target.value)} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <option value="unknown" style={{ background: "#0a121e" }}>Unknown</option>
              <option value="incumbent" style={{ background: "#0a121e" }}>Incumbent</option>
              <option value="challenger" style={{ background: "#0a121e" }}>Challenger</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5 text-[14px] text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
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
