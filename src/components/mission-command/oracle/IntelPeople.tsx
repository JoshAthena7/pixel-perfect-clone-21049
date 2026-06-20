import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X, Sparkles, Users } from "lucide-react";
import { upsertIntelPerson } from "@/lib/intel-people-upsert.functions";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";

const GOLD = "#C49A2B";

const PEOPLE_CATEGORIES = [
  "field_intelligence",
  "competitive_landscape",
  "regulatory_state",
  "regulatory_federal",
];

const ROLE_OPTIONS = [
  { value: "decision_maker", label: "Decision Maker" },
  { value: "evaluator", label: "Evaluator" },
  { value: "stakeholder", label: "Stakeholder" },
  { value: "influencer", label: "Influencer" },
  { value: "champion", label: "Champion" },
  { value: "advocate", label: "Advocate" },
  { value: "expert", label: "Expert" },
  { value: "legislator", label: "Legislator" },
  { value: "media", label: "Media" },
  { value: "adversary", label: "Adversary" },
  { value: "contact", label: "Contact" },
];

type SourceEntry = {
  key: string;
  name: string;
  category: string;
  count: number;
  lastUpdated: string | null;
  fromOracle: boolean;
};

export function IntelPeople({ missionId }: { missionId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["intel-people-sourced", missionId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data: m } = await sb.from("missions").select("state_code").eq("id", missionId).maybeSingle();
      const stateCode = m?.state_code ?? null;
      const orParts = [`tier.eq.platform`, `and(tier.eq.mission,mission_id.eq.${missionId})`];
      if (stateCode) orParts.push(`and(tier.eq.state,state_code.eq.${stateCode})`);

      const [{ data: signals }, { data: legacy }] = await Promise.all([
        sb
          .from("oracle_signals")
          .select("source_name, category, created_at")
          .in("category", PEOPLE_CATEGORIES)
          .neq("status", "dismissed")
          .or(orParts.join(",")),
        sb.from("intel_people").select("id,name,title,organization,role_type,influence_level,relationship_stance,notes").eq("mission_id", missionId),
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
      const legacyEntries = ((legacy ?? []) as any[]).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
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
          {totalCount} {totalCount === 1 ? "source" : "sources"}
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
          <Plus className="h-3 w-3" /> Add Person
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : totalCount === 0 ? (
        <EmptyState missionId={missionId} onAdd={() => setShowAdd(true)} onSeeded={() => qc.invalidateQueries({ queryKey: ["intel-people-sourced", missionId] })} />
      ) : (
        <div className="space-y-6">
          {oracleEntries.length > 0 && (
            <section>
              <div className="text-[11px] mb-2 pb-1" style={{ color: GOLD, borderBottom: `1px solid ${GOLD}33` }}>
                ORACLE Sources ({oracleEntries.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {oracleEntries.map((e) => <SourceCard key={e.key} entry={e} />)}
              </div>
            </section>
          )}
          {legacyEntries.length > 0 && (
            <section>
              <div className="text-[11px] mb-2 pb-1 text-white/55" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                Manual Entries ({legacyEntries.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {legacyEntries.map((p: any) => <LegacyPersonCard key={p.id} person={p} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {showAdd && (
        <AddPersonDialog
          missionId={missionId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["intel-people-sourced", missionId] });
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
            <Users className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            <span className="truncate">{entry.name}</span>
          </div>
          <div className="text-[11px] text-white/45 mt-0.5">{entry.category.replace(/_/g, " ")}</div>
        </div>
        {entry.fromOracle && (
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(196,154,43,0.15)", color: GOLD, border: `0.5px solid ${GOLD}55`, whiteSpace: "nowrap" }}>
            ORACLE
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-white/55">
        <span>{entry.count} {entry.count === 1 ? "item" : "items"}</span>
        <span>Updated {dtLabel}</span>
      </div>
    </div>
  );
}

function LegacyPersonCard({ person }: { person: any }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(5,13,24,0.5)", border: "1px solid rgba(255,255,255,0.08)", borderLeftWidth: 3, borderLeftColor: "rgba(255,255,255,0.2)" }}>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <div className="text-[14px] text-white font-medium truncate">{person.name || "Unnamed"}</div>
          {(person.title || person.organization) && (
            <div className="text-[12px] text-white/55 truncate">{[person.title, person.organization].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <div className="flex gap-1">
          {person.influence_level && <Badge label={person.influence_level} />}
          {person.relationship_stance && <Badge label={person.relationship_stance} />}
        </div>
      </div>
      {person.notes && <div className="text-[12px] text-white/50 mt-2 line-clamp-2">{person.notes}</div>}
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

function EmptyState({ missionId, onAdd, onSeeded }: { missionId: string; onAdd: () => void; onSeeded: () => void }) {
  const seedFn = useServerFn(seedMissionIntelligence);
  const [seeding, setSeeding] = useState(false);
  const generate = async () => {
    setSeeding(true);
    try {
      await seedFn({ data: { missionId, force: true } });
      onSeeded();
    } catch (e) {
      console.log("[intel-people] generate failed", e);
    } finally {
      setSeeding(false);
    }
  };
  return (
    <div className="rounded-lg py-12 text-center" style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      <div className="text-[14px] text-white/60">No people or field-intelligence sources captured yet.</div>
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

function AddPersonDialog({
  missionId,
  onClose,
  onSaved,
}: {
  missionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertIntelPerson);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState("stakeholder");
  const [influence, setInfluence] = useState<"high" | "medium" | "low">("medium");
  const [stance, setStance] = useState<"ally" | "neutral" | "unknown" | "hostile">("unknown");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await upsert({
        data: {
          mission_id: missionId,
          name: name.trim(),
          role_type: roleType as any,
          title: title.trim() || null,
          organization: organization.trim() || null,
          email: email.trim() || null,
          influence_level: influence,
          relationship_stance: stance,
          notes: notes.trim() || null,
        },
      });
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
          <h3 className="text-[14px] font-medium text-white">Add Person</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-white/60" /></button>
        </div>
        <div className="space-y-3">
          <Input label="Name *" value={name} onChange={setName} />
          <Input label="Title" value={title} onChange={setTitle} />
          <Select label="Role" value={roleType} onChange={setRoleType} options={ROLE_OPTIONS} />
          <Select label="Influence" value={influence} onChange={(v) => setInfluence(v as typeof influence)} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
          <Select label="Stance" value={stance} onChange={(v) => setStance(v as typeof stance)} options={[{ value: "ally", label: "Ally" }, { value: "neutral", label: "Neutral" }, { value: "unknown", label: "Unknown" }, { value: "hostile", label: "Hostile" }]} />
          <Input label="Organization" value={organization} onChange={setOrganization} />
          <Input label="Email" value={email} onChange={setEmail} />
          <div>
            <label className="text-[12px] text-white/60 block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded px-2 py-1.5 text-[14px] text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/60">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="px-3 py-1.5 text-[12px] rounded"
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
      <label className="text-[12px] text-white/60 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-2 py-1.5 text-[14px] text-white"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[12px] text-white/60 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-2 py-1.5 text-[14px] text-white"
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
