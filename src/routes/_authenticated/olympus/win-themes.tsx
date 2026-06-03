import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trophy, Trash2, X } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/olympus/win-themes")({
  component: WinThemesPage,
});

type Theme = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  key_message: string | null;
  question_ids: string[] | null;
  status: string | null;
};

type Q = { id: string; question_number: string; title: string };

function WinThemesPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Theme> | null>(null);

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ["olympus-themes", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase.from("win_themes").select("*").eq("mission_id", missionId!).order("created_at");
      return (data ?? []) as Theme[];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["olympus-themes-questions", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .eq("mission_id", missionId!)
        .order("question_number");
      return (data ?? []) as Q[];
    },
  });

  async function remove(t: Theme) {
    if (!confirm(`Delete win theme "${t.title}"?`)) return;
    const { error } = await supabase.from("win_themes").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Theme deleted");
    await logOlympusAction({
      action_type: "win_theme.delete",
      action_summary: `Deleted win theme "${t.title}"`,
      mission_id: missionId!,
      target_table: "win_themes",
      target_id: t.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-themes", missionId] });
  }

  if (!missionId) {
    return <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">Select a mission to manage win themes.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Win Themes</div>
          <h1 className="h1-display mt-1">Mission Win Themes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define and link themes to questions — they surface as chips in the Cockpit automatically.
          </p>
        </div>
        <button
          onClick={() => setEditing({ mission_id: missionId, title: "", description: "", key_message: "", question_ids: [] })}
          className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32]"
        >
          <Plus className="h-4 w-4" /> Add Win Theme
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}</div>
      ) : themes.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
          <Trophy className="mx-auto mb-2 h-6 w-6 opacity-60" />
          No win themes yet. Add one to start aligning your proposal.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.map((t) => {
            const linked = (t.question_ids ?? []).length;
            return (
              <div key={t.id} className="rounded-[10px] border border-border bg-surface p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[color:var(--athena-gold)]" />
                    <h3 className="text-sm font-semibold">{t.title}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(t)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(t)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                {t.key_message && (
                  <div className="mt-3 rounded-md border-l-2 border-[color:var(--athena-gold)] bg-background px-3 py-2 text-xs italic">
                    “{t.key_message}”
                  </div>
                )}
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Linked to {linked} question{linked === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ThemeModal
          theme={editing}
          missionId={missionId}
          questions={questions}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["olympus-themes", missionId] }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ThemeModal({ theme, missionId, questions, onClose, onSaved }: {
  theme: Partial<Theme>; missionId: string; questions: Q[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: theme.title ?? "",
    description: theme.description ?? "",
    key_message: theme.key_message ?? "",
    question_ids: theme.question_ids ?? [],
  });
  const [busy, setBusy] = useState(false);
  const isNew = !theme.id;

  function toggleQ(id: string) {
    setForm((f) => ({
      ...f,
      question_ids: f.question_ids.includes(id) ? f.question_ids.filter((x) => x !== id) : [...f.question_ids, id],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    setBusy(true);
    const payload: any = {
      mission_id: missionId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      key_message: form.key_message.trim() || null,
      question_ids: form.question_ids.length ? form.question_ids : null,
    };
    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      payload.created_by = user?.id;
    }
    const res = isNew
      ? await supabase.from("win_themes").insert(payload).select("id").single()
      : await supabase.from("win_themes").update(payload).eq("id", theme.id!).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(isNew ? "Theme created" : "Theme updated");
    await logOlympusAction({
      action_type: isNew ? "win_theme.create" : "win_theme.update",
      action_summary: `${isNew ? "Created" : "Updated"} win theme "${form.title.trim()}"`,
      mission_id: missionId,
      target_table: "win_themes",
      target_id: res.data?.id ?? theme.id ?? null,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-[10px] border border-border bg-surface p-6 max-h-[85vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>{isNew ? "New Theme" : "Edit Theme"}</div>
        <h2 className="mt-1 text-lg font-semibold">Win Theme</h2>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Operational Excellence" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Description</label>
            <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Key message (one-liner)</label>
            <input value={form.key_message ?? ""} onChange={(e) => setForm({ ...form, key_message: e.target.value })}
              placeholder="We deliver measurable health outcomes at scale."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Link to questions ({form.question_ids.length} selected)
            </label>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background p-2">
              {questions.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">No questions yet for this mission.</div>
              ) : questions.map((q) => (
                <label key={q.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" checked={form.question_ids.includes(q.id)} onChange={() => toggleQ(q.id)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-mono text-[11px] text-muted-foreground mr-2">{q.question_number}</span>
                    <span className="truncate">{q.title}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <footer className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Saving…" : isNew ? "Create Theme" : "Save Changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
