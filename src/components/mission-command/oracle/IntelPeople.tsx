import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X } from "lucide-react";

const GOLD = "#C49A2B";

const ROLE_GROUPS = [
  { id: "evaluator", label: "Evaluators", color: "#ef4444" },
  { id: "stakeholder", label: "Stakeholders", color: "#3b82f6" },
  { id: "influencer", label: "Influencers", color: "#f59e0b" },
  { id: "champion", label: "Champions", color: "#10b981" },
  { id: "expert", label: "Experts", color: "#8b5cf6" },
  { id: "adversary", label: "Adversaries", color: "#dc2626" },
  { id: "contact", label: "Contacts", color: "#64748b" },
];

export function IntelPeople({ missionId }: { missionId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["intel-people", missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("intel_people")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const people = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-xs text-white/50">{people.length} {people.length === 1 ? "person" : "people"}</div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs"
          style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "0.5px solid rgba(196,154,43,0.3)" }}
        >
          <Plus className="h-3 w-3" /> Add Person
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : people.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-6">
          {ROLE_GROUPS.map((g) => {
            const items = people.filter((p) => p.role_type === g.id);
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
                  {items.map((p) => (
                    <PersonCard key={p.id} person={p} accent={g.color} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddPersonDialog
          missionId={missionId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["intel-people", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-completeness", missionId] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function PersonCard({ person, accent }: { person: any; accent: string }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(5,13,24,0.5)", border: `1px solid ${accent}33`, borderLeftWidth: 3 }}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-white font-medium">{person.name || "Unnamed"}</div>
          {person.title && <div className="text-xs text-white/55">{person.title}</div>}
        </div>
        <div className="flex gap-1">
          {person.influence_level && (
            <Badge label={person.influence_level} />
          )}
          {person.relationship_stance && (
            <Badge label={person.relationship_stance} />
          )}
        </div>
      </div>
      {person.known_priorities?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {person.known_priorities.slice(0, 4).map((p: string, i: number) => (
            <span
              key={i}
              style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
            >
              {p}
            </span>
          ))}
        </div>
      )}
      {person.notes && <div className="text-xs text-white/50 mt-2 line-clamp-2">{person.notes}</div>}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
      {label}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-sm text-white/60">No people captured yet.</div>
      <button onClick={onAdd} className="mt-3 text-xs underline" style={{ color: GOLD }}>Add your first person</button>
    </div>
  );
}

// Person is stored as a row in intel_people. The person's display name is
// the linked entity's name in intel_entities. We create both in one shot.
function AddPersonDialog({
  missionId,
  onClose,
  onSaved,
}: {
  missionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [roleType, setRoleType] = useState("stakeholder");
  const [influence, setInfluence] = useState("medium");
  const [stance, setStance] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: ent, error: e1 } = await (supabase as any)
        .from("intel_entities")
        .insert({ entity_type: "person", name: name.trim(), mission_ids: [missionId] })
        .select()
        .single();
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("intel_people").insert({
        entity_id: ent.id,
        mission_id: missionId,
        role_type: roleType,
        influence_level: influence,
        relationship_stance: stance,
        title: title || null,
        notes: notes || null,
      });
      if (e2) throw e2;
      onSaved();
    } catch (err) {
      console.error("[AddPerson] failed", err);
      alert("Failed to save person.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-lg p-5" style={{ background: "#0a121e", border: "1px solid rgba(196,154,43,0.3)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-white">Add Person</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Input label="Name *" value={name} onChange={setName} />
          <Input label="Title" value={title} onChange={setTitle} />
          <Select label="Role" value={roleType} onChange={setRoleType} options={ROLE_GROUPS.map((g) => ({ value: g.id, label: g.label }))} />
          <Select label="Influence" value={influence} onChange={setInfluence} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
          <Select label="Stance" value={stance} onChange={setStance} options={[{ value: "ally", label: "Ally" }, { value: "neutral", label: "Neutral" }, { value: "unknown", label: "Unknown" }, { value: "hostile", label: "Hostile" }]} />
          <div>
            <label className="text-xs text-white/60 block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded px-2 py-1.5 text-sm text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/60">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="px-3 py-1.5 text-xs rounded"
            style={{ background: GOLD, color: "#000" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-white/60 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-2 py-1.5 text-sm text-white"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-xs text-white/60 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-2 py-1.5 text-sm text-white"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#0a121e" }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
