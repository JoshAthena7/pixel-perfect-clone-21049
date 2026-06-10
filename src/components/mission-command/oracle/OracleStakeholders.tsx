import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { enrichStakeholder } from "@/lib/oracle.functions";
import { ClientIntelligenceTab } from "@/components/mission-command/ClientIntelligenceTab";
import type { Database } from "@/integrations/supabase/types";

type Stakeholder = Database["public"]["Tables"]["stakeholder_profiles"]["Row"];

const STAKEHOLDER_TYPES = [
  { value: "evaluator", label: "Evaluator" },
  { value: "influencer", label: "Influencer" },
  { value: "advocate", label: "Advocate" },
];

const SUB_TYPES: Record<string, string[]> = {
  influencer: ["Governor", "Commissioner", "Program Director", "Budget Office", "Legislator"],
  advocate: ["Family Organization", "Provider Association", "Trade Association", "Disability Organization", "Coalition"],
  evaluator: [],
};

export function OracleStakeholders({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<Stakeholder | null>(null);
  const enrich = useServerFn(enrichStakeholder);

  const { data: stakes = [] } = useQuery({
    queryKey: ["oracle-stakeholders", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("stakeholder_profiles").select("*").eq("mission_id", missionId).order("created_at", { ascending: false });
      return (data ?? []) as Stakeholder[];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<Stakeholder>) => {
      const { data, error } = await supabase.from("stakeholder_profiles").insert({
        mission_id: missionId,
        name: payload.name!,
        title: payload.title ?? null,
        organization: payload.organization ?? null,
        stakeholder_type: payload.stakeholder_type!,
        sub_type: payload.sub_type ?? null,
        public_priorities: payload.public_priorities ?? null,
        known_concerns: payload.known_concerns ?? null,
        is_manually_added: true,
      }).select("id").single();
      if (error) throw error;
      try { await enrich({ data: { stakeholderId: data.id } }); } catch (e) { console.error(e); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oracle-stakeholders", missionId] });
      setAddOpen(false);
      toast.success("Stakeholder added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const evaluators = stakes.filter((s) => s.stakeholder_type === "evaluator");
  const influencers = stakes.filter((s) => s.stakeholder_type === "influencer");
  const advocates = stakes.filter((s) => s.stakeholder_type === "advocate");

  const Column = ({ title, items }: { title: string; items: Stakeholder[] }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider">{title} <span className="text-muted-foreground">({items.length})</span></h3>
      </div>
      {items.length === 0 && <div className="text-xs text-muted-foreground italic">None yet</div>}
      {items.map((s) => (
        <div key={s.id} className="rounded-lg border bg-card p-3">
          <div className="font-medium">{s.name}</div>
          {s.title && <div className="text-xs text-muted-foreground">{s.title}</div>}
          {s.organization && <div className="text-xs">{s.organization}</div>}
          {s.sub_type && <Badge variant="outline" className="text-[10px] mt-1">{s.sub_type}</Badge>}
          {s.public_priorities && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.public_priorities}</p>}
          <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setViewing(s)}>View Full Profile</Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stakeholders</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Stakeholder</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column title="Evaluators" items={evaluators} />
        <Column title="Influencers" items={influencers} />
        <Column title="Advocates" items={advocates} />
      </div>

      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Client Intelligence Notes</h3>
        <ClientIntelligenceTab missionId={missionId} />
      </div>

      {addOpen && <AddPanel onClose={() => setAddOpen(false)} onSubmit={(v) => create.mutate(v)} />}
      {viewing && <ProfilePanel s={viewing} onClose={() => setViewing(null)} onUpdated={() => qc.invalidateQueries({ queryKey: ["oracle-stakeholders", missionId] })} />}
    </div>
  );
}

function AddPanel({ onClose, onSubmit }: { onClose: () => void; onSubmit: (v: Partial<Stakeholder>) => void }) {
  const [form, setForm] = useState<Partial<Stakeholder>>({ stakeholder_type: "evaluator" });
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-card border-l p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Add Stakeholder</h3>
        <div className="space-y-3">
          <Input placeholder="Name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Title" value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Organization" value={form.organization ?? ""} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          <select value={form.stakeholder_type} onChange={(e) => setForm({ ...form, stakeholder_type: e.target.value, sub_type: undefined })} className="w-full border rounded px-2 py-2 bg-background text-sm">
            {STAKEHOLDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {(SUB_TYPES[form.stakeholder_type ?? ""] ?? []).length > 0 && (
            <select value={form.sub_type ?? ""} onChange={(e) => setForm({ ...form, sub_type: e.target.value })} className="w-full border rounded px-2 py-2 bg-background text-sm">
              <option value="">— Sub-type —</option>
              {SUB_TYPES[form.stakeholder_type ?? ""].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <Textarea placeholder="Public priorities" value={form.public_priorities ?? ""} onChange={(e) => setForm({ ...form, public_priorities: e.target.value })} />
          <Textarea placeholder="Known concerns" value={form.known_concerns ?? ""} onChange={(e) => setForm({ ...form, known_concerns: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!form.name} onClick={() => onSubmit(form)}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({ s, onClose, onUpdated }: { s: Stakeholder; onClose: () => void; onUpdated: () => void }) {
  const statements = Array.isArray(s.recent_statements) ? (s.recent_statements as { date?: string; text?: string; url?: string }[]) : [];
  const [newStmt, setNewStmt] = useState({ date: "", text: "", url: "" });

  const addStatement = async () => {
    if (!newStmt.text) return;
    const updated = [...statements, newStmt];
    await supabase.from("stakeholder_profiles").update({ recent_statements: updated }).eq("id", s.id);
    setNewStmt({ date: "", text: "", url: "" });
    onUpdated();
  };

  const remove = async () => {
    if (!confirm(`Delete ${s.name}?`)) return;
    await supabase.from("stakeholder_profiles").delete().eq("id", s.id);
    onClose(); onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-card border-l p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{s.name}</h3>
            <div className="text-sm text-muted-foreground">{s.title} {s.organization && `@ ${s.organization}`}</div>
            <Badge variant="outline" className="mt-1 text-[10px]">{s.stakeholder_type}{s.sub_type ? ` · ${s.sub_type}` : ""}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {s.public_priorities && <Section title="Public Priorities">{s.public_priorities}</Section>}
        {s.known_concerns && <Section title="Known Concerns">{s.known_concerns}</Section>}
        {s.relationship_to_athena && <Section title="Relationship to Athena">{s.relationship_to_athena}</Section>}
        {s.relationship_to_incumbent && <Section title="Relationship to Incumbent">{s.relationship_to_incumbent}</Section>}

        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Recent Statements</h4>
          {statements.length === 0 && <div className="text-xs text-muted-foreground italic">No statements logged.</div>}
          <div className="space-y-2">
            {statements.map((st, i) => (
              <div key={i} className="border-l-2 border-primary/30 pl-2 text-sm">
                <div className="text-[10px] text-muted-foreground">{st.date}</div>
                <div>{st.text}</div>
                {st.url && <a href={st.url} target="_blank" rel="noreferrer" className="text-[10px] underline">source</a>}
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            <Input placeholder="Date" value={newStmt.date} onChange={(e) => setNewStmt({ ...newStmt, date: e.target.value })} />
            <Textarea placeholder="Statement text" value={newStmt.text} onChange={(e) => setNewStmt({ ...newStmt, text: e.target.value })} />
            <Input placeholder="Source URL" value={newStmt.url} onChange={(e) => setNewStmt({ ...newStmt, url: e.target.value })} />
            <Button size="sm" onClick={addStatement}>Add Statement</Button>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="destructive" size="sm" onClick={remove}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{children}</p>
    </div>
  );
}
