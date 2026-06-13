import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X } from "lucide-react";

const GOLD = "#C49A2B";

const ORG_GROUPS = [
  { id: "competitor", label: "Competitors", color: "#ef4444" },
  { id: "agency", label: "State Agencies", color: "#3b82f6" },
  { id: "provider", label: "Providers", color: "#10b981" },
  { id: "advocacy", label: "Advocacy", color: "#f59e0b" },
  { id: "vendor", label: "Vendors", color: "#8b5cf6" },
  { id: "partner", label: "Partners", color: "#06b6d4" },
  { id: "subcontractor", label: "Subcontractors", color: "#a3e635" },
  { id: "unknown", label: "Other", color: "#64748b" },
];

export function IntelOrganizations({ missionId }: { missionId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["intel-orgs", missionId],
    queryFn: async () => {
      const [{ data: orgs }, { data: ents }] = await Promise.all([
        (supabase as any).from("intel_organizations").select("*").eq("mission_id", missionId),
        (supabase as any).from("intel_entities").select("id,name").eq("entity_type", "organization"),
      ]);
      const nameById = new Map<string, string>((ents ?? []).map((e: any) => [e.id, e.name]));
      return ((orgs ?? []) as any[]).map((o: any) => ({ ...o, name: nameById.get(o.entity_id) }));
    },
  });

  const orgs = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-xs text-white/50">{orgs.length} {orgs.length === 1 ? "organization" : "organizations"}</div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          <Plus className="h-3 w-3" /> Add Organization
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : orgs.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-6">
          {ORG_GROUPS.map((g) => {
            const items = orgs.filter((o) => o.org_type === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id}>
                <div
                  className="text-[10px] uppercase tracking-wider mb-2 pb-1"
                  style={{ color: g.color, borderBottom: `1px solid ${g.color}33` }}
                >
                  {g.label} ({items.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((o) => (
                    <OrgCard key={o.id} org={o} accent={g.color} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddOrgDialog
          missionId={missionId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["intel-orgs", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-completeness", missionId] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function OrgCard({ org, accent }: { org: any; accent: string }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${accent}33`, borderLeftWidth: 3 }}
    >
      <div className="flex justify-between items-start">
        <div className="text-sm text-white font-medium">{org.name || "Unnamed"}</div>
        {org.incumbency_status && org.incumbency_status !== "unknown" && (
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
            {org.incumbency_status}
          </span>
        )}
      </div>
      {org.known_strengths?.length > 0 && (
        <div className="text-xs text-white/55 mt-1">
          <span className="text-emerald-400/70">Strengths:</span> {org.known_strengths.slice(0, 3).join(", ")}
        </div>
      )}
      {org.known_weaknesses?.length > 0 && (
        <div className="text-xs text-white/55 mt-0.5">
          <span className="text-red-400/70">Weaknesses:</span> {org.known_weaknesses.slice(0, 3).join(", ")}
        </div>
      )}
      {org.notes && <div className="text-xs text-white/50 mt-2 line-clamp-2">{org.notes}</div>}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-sm text-white/60">No organizations captured yet.</div>
      <button onClick={onAdd} className="mt-3 text-xs underline" style={{ color: GOLD }}>Add your first organization</button>
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
          <h3 className="text-sm font-medium text-white">Add Organization</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} /></Field>
          <Field label="Type">
            <select value={orgType} onChange={(e) => setOrgType(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {ORG_GROUPS.map((g) => <option key={g.id} value={g.id} style={{ background: "#0a121e" }}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="Incumbency">
            <select value={incumbency} onChange={(e) => setIncumbency(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <option value="unknown" style={{ background: "#0a121e" }}>Unknown</option>
              <option value="incumbent" style={{ background: "#0a121e" }}>Incumbent</option>
              <option value="challenger" style={{ background: "#0a121e" }}>Challenger</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5 text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
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
