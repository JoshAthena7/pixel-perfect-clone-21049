import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X, MapPin } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/admin/comparables")({
  component: ComparablesPage,
});

const STATES = ["PA", "MA", "CT", "TX", "IL", "OH", "CO", "WA"];

function ComparablesPage() {
  const { isAdmin } = useIsAdmin();
  const [filter, setFilter] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const { data: items = [], refetch } = useQuery({
    queryKey: ["state-comparables"],
    queryFn: async () => (await supabase.from("state_comparables").select("*").order("state").order("topic")).data ?? [],
  });

  const filtered = filter ? items.filter((i: any) => i.state === filter) : items;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-10 py-10 space-y-8">
        <header className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">Oracle · Cross-State Intelligence</div>
            <h1 className="mt-2 text-3xl font-light tracking-tight flex items-center gap-3">
              <MapPin className="h-6 w-6 text-primary" />
              State Comparables
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              How comparable states have addressed similar procurement questions. IRIS pulls these into responses when relevant.
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setAdding(!adding)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New comparable
            </button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilter("")} className={`rounded-full border px-3 py-1 text-xs ${!filter ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>All</button>
          {STATES.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 text-xs ${filter === s ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{s}</button>
          ))}
        </div>

        {adding && isAdmin && <AddForm onDone={() => { setAdding(false); refetch(); }} />}

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No comparables for this state yet.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c: any) => (
              <li key={c.id} className="rounded-md border border-border bg-background p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{c.state} · {c.topic}</div>
                  {isAdmin && (
                    <button onClick={async () => { await supabase.from("state_comparables").delete().eq("id", c.id); refetch(); }}
                      className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <div className="mt-1 text-base font-medium">{c.program_name}</div>
                <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{c.approach}</p>
                {c.outcome && <p className="mt-2 text-xs text-muted-foreground"><span className="font-mono uppercase text-[10px]">Outcome</span> · {c.outcome}</p>}
                {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline truncate">{c.source_url}</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ state: "PA", program_name: "", topic: "", approach: "", outcome: "", source_url: "" });
  async function save() {
    if (!form.program_name.trim() || !form.topic.trim() || !form.approach.trim()) {
      toast.error("Program, topic and approach are required");
      return;
    }
    const { error } = await supabase.from("state_comparables").insert({ ...form, source_url: form.source_url || null });
    if (error) return toast.error(error.message);
    toast.success("Comparable added");
    onDone();
  }
  return (
    <div className="rounded-md border border-border bg-surface/30 p-5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="Program name (e.g. PA CSA)" value={form.program_name} onChange={(e) => setForm({ ...form, program_name: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input placeholder="Topic (e.g. provider network)" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      </div>
      <textarea placeholder="Approach…" value={form.approach} onChange={(e) => setForm({ ...form, approach: e.target.value })} rows={3}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input placeholder="Outcome / data (optional)" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input placeholder="Source URL (optional)" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs">Cancel</button>
        <button onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Save</button>
      </div>
    </div>
  );
}
