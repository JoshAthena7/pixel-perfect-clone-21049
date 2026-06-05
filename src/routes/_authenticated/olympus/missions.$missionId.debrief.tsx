import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, AlertTriangle, BookOpen, CheckCircle2, X, Sparkles, Loader2 } from "lucide-react";
import { saveDebrief, generateCanonSuggestions, approveCanonItem } from "@/lib/mission-debrief.functions";

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/debrief")({
  component: DebriefPage,
});

function DebriefPage() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveDebrief);
  const genFn = useServerFn(generateCanonSuggestions);
  const approveFn = useServerFn(approveCanonItem);

  const { data: mission } = useQuery({
    queryKey: ["debrief-mission", missionId],
    queryFn: async () => (await supabase.from("missions").select("name,client,status").eq("id", missionId).maybeSingle()).data,
  });
  const { data: debrief, refetch: refetchDebrief } = useQuery({
    queryKey: ["debrief", missionId],
    queryFn: async () => (await supabase.from("mission_debriefs").select("*").eq("mission_id", missionId).maybeSingle()).data,
  });
  const { data: suggestions = [], refetch: refetchSugg } = useQuery({
    queryKey: ["canon-sugg", missionId],
    queryFn: async () => (await supabase.from("canon_suggestions").select("*").eq("mission_id", missionId).order("created_at", { ascending: false })).data ?? [],
  });

  const [form, setForm] = useState({
    outcome: "won" as "won" | "lost",
    scoredWell: "",
    missed: "",
    evaluatorFeedback: "",
    lessonsLearned: "",
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Hydrate form once
  if (debrief && !form.scoredWell && !form.missed && !form.evaluatorFeedback && !form.lessonsLearned) {
    setForm({
      outcome: (debrief.outcome ?? "won") as "won" | "lost",
      scoredWell: debrief.scored_well ?? "",
      missed: debrief.missed ?? "",
      evaluatorFeedback: debrief.evaluator_feedback ?? "",
      lessonsLearned: debrief.lessons_learned ?? "",
    });
  }

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { missionId, ...form } });
      toast.success("Debrief saved");
      refetchDebrief();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }
  async function generate() {
    if (!debrief?.id) { toast.error("Save the debrief first"); return; }
    setGenerating(true);
    try {
      const { count } = await genFn({ data: { debriefId: debrief.id } });
      toast.success(`${count} suggestions generated`);
      refetchSugg();
    } catch (e: any) { toast.error(e?.message ?? "Generation failed"); }
    finally { setGenerating(false); }
  }
  async function review(id: string, approve: boolean) {
    await approveFn({ data: { id, approve } });
    refetchSugg();
    qc.invalidateQueries({ queryKey: ["intelligence-canon"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-10 py-10 space-y-10">
        <header>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
            Olympus / Mission Debrief
          </div>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">{mission?.name ?? "Mission"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Capture what worked, what missed, and what the firm should remember. Approved Canon items become universal references in every future mission of this opportunity type.
          </p>
        </header>

        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm({ ...form, outcome: "won" })}
              className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${form.outcome === "won" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground"}`}
            >
              <Trophy className="h-4 w-4" /> Won
            </button>
            <button
              onClick={() => setForm({ ...form, outcome: "lost" })}
              className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${form.outcome === "lost" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border text-muted-foreground"}`}
            >
              <AlertTriangle className="h-4 w-4" /> Lost
            </button>
          </div>

          <DebriefField label="What scored well" value={form.scoredWell} onChange={(v) => setForm({ ...form, scoredWell: v })} />
          <DebriefField label="What missed" value={form.missed} onChange={(v) => setForm({ ...form, missed: v })} />
          <DebriefField label="Evaluator feedback (if available)" value={form.evaluatorFeedback} onChange={(v) => setForm({ ...form, evaluatorFeedback: v })} />
          <DebriefField label="Lessons learned" value={form.lessonsLearned} onChange={(v) => setForm({ ...form, lessonsLearned: v })} />

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => navigate({ to: "/olympus" })} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : "Save Debrief"}
            </button>
          </div>
        </section>

        <section className="space-y-4 pt-8 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">IRIS Canon Suggestions</div>
              <h2 className="mt-1 text-lg font-light flex items-center gap-2"><BookOpen className="h-4 w-4" /> Approve what enters the Canon</h2>
            </div>
            <button onClick={generate} disabled={generating || !debrief?.id} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Canon items
            </button>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No suggestions yet. Save the debrief, then generate.</p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((s: any) => (
                <li key={s.id} className={`rounded-md border p-4 ${s.status === "approved" ? "border-emerald-500/30 bg-emerald-500/5" : s.status === "rejected" ? "border-border opacity-50" : "border-border bg-background"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.title}</span>
                        {s.category && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">· {s.category}</span>}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{s.body}</p>
                    </div>
                    {s.status === "pending" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => review(s.id, true)} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10">
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </button>
                        <button onClick={() => review(s.id, false)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover">
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    )}
                    {s.status === "approved" && <span className="text-[11px] text-emerald-400">✓ In Canon</span>}
                    {s.status === "rejected" && <span className="text-[11px] text-muted-foreground">Rejected</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function DebriefField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
