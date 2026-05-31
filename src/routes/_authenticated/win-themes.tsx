import { Navigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Sparkles, Check, X, Wand2, Loader2, Plus } from "lucide-react";
import { Watermark } from "@/components/war-room/Watermark";
import {
  suggestWinThemeMappings,
  generateWinThemeHints,
  extractRfpQuestionsFromOpportunity,
} from "@/lib/ai/win-theme-mappings.functions";

export const Route = createFileRoute("/_authenticated/win-themes")({
  head: () => ({ meta: [{ title: "Win Themes — Athena" }] }),
  component: () => <Navigate to="/pulse" replace />,
});

type Section = { id: string; section_name: string };
type Theme = { id: string; title: string; description: string | null };
type Question = { id: string; section_id: string | null; question_number: string | null; title: string | null; body: string };
type Mapping = {
  id: string;
  win_theme_id: string;
  section_id: string | null;
  question_id: string | null;
  writer_hint: string | null;
  ai_suggested: boolean;
  ai_similarity: number | null;
  confirmed: boolean;
};

function LeadWinThemes() {
  const { engagement, isLeadership } = useEngagement();
  const { user } = useSession();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newQNum, setNewQNum] = useState("");
  const [newQTitle, setNewQTitle] = useState("");
  const [newQBody, setNewQBody] = useState("");
  const [newQSection, setNewQSection] = useState<string>("");

  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!engagement) return;
    const [t, s, q, m] = await Promise.all([
      supabase.from("win_themes").select("id, title, description").eq("engagement_id", engagement.id).order("created_at", { ascending: false }),
      supabase.from("heatmap_sections").select("id, section_name").eq("engagement_id", engagement.id).order("sort_order"),
      supabase.from("rfp_questions").select("id, section_id, question_number, title, body").eq("engagement_id", engagement.id).order("sort_order"),
      supabase.from("win_theme_mappings").select("*").eq("engagement_id", engagement.id),
    ]);
    setThemes((t.data ?? []) as Theme[]);
    setSections((s.data ?? []) as Section[]);
    setQuestions((q.data ?? []) as Question[]);
    setMappings((m.data ?? []) as Mapping[]);
    if (!selectedThemeId && t.data?.[0]) setSelectedThemeId(t.data[0].id);
  }, [engagement, selectedThemeId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedTheme = themes.find((t) => t.id === selectedThemeId) ?? null;
  const themeMappings = useMemo(
    () => mappings.filter((m) => m.win_theme_id === selectedThemeId),
    [mappings, selectedThemeId],
  );
  const reviewQueue = useMemo(() => mappings.filter((m) => m.ai_suggested && !m.confirmed), [mappings]);
  const sectionMap = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s.section_name])), [sections]);
  const themeMap = useMemo(() => Object.fromEntries(themes.map((t) => [t.id, t.title])), [themes]);
  const questionMap = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const questionsBySection = useMemo(() => {
    const out: Record<string, Question[]> = { _unsectioned: [] };
    for (const q of questions) {
      const key = q.section_id ?? "_unsectioned";
      (out[key] ??= []).push(q);
    }
    return out;
  }, [questions]);

  async function addTheme(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !title.trim()) return;
    const { error } = await supabase
      .from("win_themes")
      .insert({ engagement_id: engagement.id, title: title.trim(), description: description || null });
    if (error) return toast.error(error.message);
    setTitle("");
    setDescription("");
    load();
  }

  async function removeTheme(id: string) {
    if (!confirm("Delete this win theme and all its mappings?")) return;
    const { error } = await supabase.from("win_themes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selectedThemeId === id) setSelectedThemeId(null);
    load();
  }

  async function toggleMapping(opts: { sectionId?: string | null; questionId?: string | null }) {
    if (!engagement || !selectedThemeId || !user) return;
    const existing = themeMappings.find(
      (m) => (m.section_id ?? null) === (opts.sectionId ?? null) && (m.question_id ?? null) === (opts.questionId ?? null),
    );
    if (existing) {
      const { error } = await supabase.from("win_theme_mappings").delete().eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("win_theme_mappings").insert({
        engagement_id: engagement.id,
        win_theme_id: selectedThemeId,
        section_id: opts.sectionId ?? null,
        question_id: opts.questionId ?? null,
        confirmed: true,
        ai_suggested: false,
        created_by: user.id,
      });
      if (error) return toast.error(error.message);
    }
    load();
  }

  async function saveHint(mappingId: string, hint: string) {
    const { error } = await supabase.from("win_theme_mappings").update({ writer_hint: hint || null }).eq("id", mappingId);
    if (error) toast.error(error.message);
  }

  async function confirmSuggestion(mappingId: string) {
    const { error } = await supabase.from("win_theme_mappings").update({ confirmed: true }).eq("id", mappingId);
    if (error) return toast.error(error.message);
    load();
  }

  async function dismissSuggestion(mappingId: string) {
    const { error } = await supabase.from("win_theme_mappings").delete().eq("id", mappingId);
    if (error) return toast.error(error.message);
    load();
  }

  async function runSuggest() {
    if (!engagement) return;
    setBusy("suggest");
    try {
      const r = (await suggestWinThemeMappings({ data: { engagementId: engagement.id } })) as any;
      toast.success(r.created > 0 ? `AI suggested ${r.created} new mappings.` : "No new suggestions.");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Suggest failed");
    } finally {
      setBusy(null);
    }
  }

  async function runHints() {
    if (!engagement) return;
    setBusy("hints");
    try {
      const r = (await generateWinThemeHints({
        data: { engagementId: engagement.id, themeId: selectedThemeId ?? undefined, onlyMissing: true },
      })) as any;
      toast.success(`Generated ${r.updated} writer hints.`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Hint generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function extractQuestions() {
    if (!engagement) return;
    setBusy("extract");
    try {
      const r = (await extractRfpQuestionsFromOpportunity({ data: { engagementId: engagement.id } })) as any;
      if (!r.ok) toast.info(r.message ?? "Nothing extracted");
      else toast.success(`Imported ${r.created} questions from RFP analysis.`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed");
    } finally {
      setBusy(null);
    }
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !newQBody.trim()) return;
    const { error } = await supabase.from("rfp_questions").insert({
      engagement_id: engagement.id,
      question_number: newQNum || null,
      title: newQTitle || null,
      body: newQBody.trim(),
      section_id: newQSection || null,
      sort_order: questions.length,
    });
    if (error) return toast.error(error.message);
    setNewQNum("");
    setNewQTitle("");
    setNewQBody("");
    setNewQSection("");
    load();
  }

  async function removeQuestion(id: string) {
    const { error } = await supabase.from("rfp_questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Watermark />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Win Themes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Themes writers should land in every section — and per-question writer hints that turn strategy into instruction.
          </p>
        </div>
        {isLeadership && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={extractQuestions} disabled={busy === "extract"}>
              {busy === "extract" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Import questions from RFP
            </Button>
            <Button size="sm" variant="outline" onClick={runSuggest} disabled={busy === "suggest"}>
              {busy === "suggest" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              AI suggest mappings
            </Button>
            <Button size="sm" variant="outline" onClick={runHints} disabled={busy === "hints" || !selectedThemeId}>
              {busy === "hints" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
              AI generate hints
            </Button>
          </div>
        )}
      </div>

      {isLeadership && reviewQueue.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-600">
            <Sparkles className="h-4 w-4" />
            AI has suggested {reviewQueue.length} mapping{reviewQueue.length === 1 ? "" : "s"} — review and confirm.
          </div>
          <ul className="space-y-2">
            {reviewQueue.slice(0, 20).map((m) => {
              const themeTitle = themeMap[m.win_theme_id] ?? "Theme";
              const targetLabel = m.question_id
                ? `Q ${questionMap[m.question_id]?.question_number ?? "?"} — ${questionMap[m.question_id]?.title ?? questionMap[m.question_id]?.body.slice(0, 80) ?? ""}`
                : m.section_id
                  ? `Section: ${sectionMap[m.section_id] ?? "?"}`
                  : "Unknown target";
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-surface/50 p-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold">{themeTitle}</span>
                    <span className="text-muted-foreground"> → {targetLabel}</span>
                    {m.ai_similarity != null && (
                      <span className="ml-2 text-[10px] text-muted-foreground">{Math.round(m.ai_similarity * 100)}% match</span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => confirmSuggestion(m.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(m.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left: theme list */}
        <div className="space-y-3">
          {isLeadership && (
            <Card className="border-border bg-surface p-3">
              <form onSubmit={addTheme} className="space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Theme title" />
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
                <Button type="submit" size="sm" className="w-full" disabled={!title.trim()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add theme
                </Button>
              </form>
            </Card>
          )}
          {themes.map((t) => {
            const count = mappings.filter((m) => m.win_theme_id === t.id && m.confirmed).length;
            return (
              <Card
                key={t.id}
                className={`cursor-pointer p-3 transition-colors ${selectedThemeId === t.id ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/40"}`}
                onClick={() => setSelectedThemeId(t.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.title}</div>
                    {t.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</div>}
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{count} mapping{count === 1 ? "" : "s"}</div>
                  </div>
                  {isLeadership && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTheme(t.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {themes.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-surface/40 p-4 text-center text-xs text-muted-foreground">
              No win themes yet.
            </div>
          )}
        </div>

        {/* Right: mapping interface */}
        <div className="space-y-4">
          {!selectedTheme ? (
            <Card className="border-dashed border-border bg-surface/40 p-6 text-center text-sm text-muted-foreground">
              Select a theme to map it to sections and questions.
            </Card>
          ) : (
            <>
              <Card className="border-border bg-surface p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Editing</div>
                <div className="text-base font-semibold">{selectedTheme.title}</div>
                {selectedTheme.description && (
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{selectedTheme.description}</p>
                )}
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Sections */}
                <Card className="border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold">Sections</h3>
                  <div className="space-y-1">
                    {sections.map((s) => {
                      const mapping = themeMappings.find((m) => m.section_id === s.id && m.question_id === null);
                      const checked = !!mapping;
                      const isSuggested = mapping?.ai_suggested && !mapping?.confirmed;
                      return (
                        <label key={s.id} className={`flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isLeadership}
                            onChange={() => toggleMapping({ sectionId: s.id, questionId: null })}
                          />
                          <span className="flex-1">{s.section_name}</span>
                          {isSuggested && <Badge variant="outline" className="border-amber-500/40 text-amber-600"><Sparkles className="mr-1 h-3 w-3" />AI</Badge>}
                        </label>
                      );
                    })}
                    {sections.length === 0 && <p className="text-xs text-muted-foreground">No sections.</p>}
                  </div>
                </Card>

                {/* Questions grouped by section */}
                <Card className="border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold">RFP Questions</h3>
                  <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
                    {sections.map((s) => {
                      const list = questionsBySection[s.id] ?? [];
                      if (list.length === 0) return null;
                      return (
                        <div key={s.id}>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{s.section_name}</div>
                          {list.map((q) => {
                            const mapping = themeMappings.find((m) => m.question_id === q.id);
                            const checked = !!mapping;
                            const isSuggested = mapping?.ai_suggested && !mapping?.confirmed;
                            return (
                              <div key={q.id} className={`rounded-md p-2 text-sm transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={checked}
                                    disabled={!isLeadership}
                                    onChange={() => toggleMapping({ sectionId: null, questionId: q.id })}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      {q.question_number && <span className="text-xs font-mono text-primary">{q.question_number}</span>}
                                      <span className="text-sm font-medium">{q.title ?? q.body.slice(0, 80)}</span>
                                      {isSuggested && (
                                        <Badge variant="outline" className="ml-auto border-amber-500/40 text-amber-600">
                                          <Sparkles className="mr-1 h-3 w-3" />AI
                                        </Badge>
                                      )}
                                    </div>
                                    {checked && (
                                      <div className="mt-2 space-y-1">
                                        <Textarea
                                          rows={2}
                                          defaultValue={mapping!.writer_hint ?? ""}
                                          placeholder="How should the writer use this theme here?"
                                          onBlur={(e) => saveHint(mapping!.id, e.target.value)}
                                          className="text-xs"
                                        />
                                        {isSuggested && (
                                          <div className="flex gap-1">
                                            <Button size="sm" variant="outline" onClick={() => confirmSuggestion(mapping!.id)}>
                                              <Check className="mr-1 h-3 w-3" /> Confirm
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(mapping!.id)}>
                                              <X className="mr-1 h-3 w-3" /> Dismiss
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!q.title && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{q.body}</p>}
                                  </div>
                                  {isLeadership && (
                                    <Button size="sm" variant="ghost" onClick={() => removeQuestion(q.id)} title="Delete question">
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {(questionsBySection._unsectioned ?? []).length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Unsectioned</div>
                        {questionsBySection._unsectioned.map((q) => {
                          const mapping = themeMappings.find((m) => m.question_id === q.id);
                          const checked = !!mapping;
                          return (
                            <div key={q.id} className={`rounded-md p-2 text-sm ${checked ? "bg-primary/5" : ""}`}>
                              <label className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" checked={checked} disabled={!isLeadership} onChange={() => toggleMapping({ questionId: q.id })} />
                                <span className="flex-1">{q.title ?? q.body.slice(0, 100)}</span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {questions.length === 0 && (
                      <p className="text-xs text-muted-foreground">No RFP questions yet. Use "Import questions from RFP" above or add one below.</p>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* Manual add question */}
          {isLeadership && (
            <Card className="border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Add an RFP question</h3>
              <form onSubmit={addQuestion} className="grid gap-2 sm:grid-cols-2">
                <Input value={newQNum} onChange={(e) => setNewQNum(e.target.value)} placeholder="Q # (e.g. 3.3)" />
                <select
                  className="rounded-md border border-input bg-background px-2 text-sm"
                  value={newQSection}
                  onChange={(e) => setNewQSection(e.target.value)}
                >
                  <option value="">— Section (optional) —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.section_name}</option>
                  ))}
                </select>
                <Input className="sm:col-span-2" value={newQTitle} onChange={(e) => setNewQTitle(e.target.value)} placeholder="Short title" />
                <Textarea className="sm:col-span-2" rows={2} value={newQBody} onChange={(e) => setNewQBody(e.target.value)} placeholder="Full question text" />
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm" disabled={!newQBody.trim()}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add question
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
