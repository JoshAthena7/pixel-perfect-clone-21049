import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Sparkles, Lightbulb, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  suggestWinThemeMappings,
  generateWinThemeHints,
  extractRfpQuestionsFromOpportunity,
} from "@/lib/ai/win-theme-mappings.functions";

type Question = {
  id: string;
  question_number: string | null;
  title: string | null;
  body: string;
  section_id: string | null;
};

type Theme = { id: string; title: string; description: string | null };

type Mapping = {
  id: string;
  win_theme_id: string;
  question_id: string | null;
  writer_hint: string | null;
  ai_suggested: boolean;
  confirmed: boolean;
};

export function RfpQuestionsThemesPanel({
  engagementId,
  isLeadership,
}: {
  engagementId: string;
  isLeadership: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [hintDraft, setHintDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: qs }, { data: ths }, { data: mps }] = await Promise.all([
      supabase
        .from("rfp_questions")
        .select("id, question_number, title, body, section_id")
        .eq("engagement_id", engagementId)
        .order("sort_order"),
      supabase
        .from("win_themes")
        .select("id, title, description")
        .eq("engagement_id", engagementId)
        .order("created_at"),
      supabase
        .from("win_theme_mappings")
        .select("id, win_theme_id, question_id, writer_hint, ai_suggested, confirmed")
        .eq("engagement_id", engagementId)
        .not("question_id", "is", null),
    ]);
    setQuestions((qs as Question[]) ?? []);
    setThemes((ths as Theme[]) ?? []);
    setMappings((mps as Mapping[]) ?? []);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  async function importQuestions() {
    setWorking("import");
    try {
      const res: any = await extractRfpQuestionsFromOpportunity({ data: { engagementId } });
      if (res?.created) toast.success(`Imported ${res.created} requirements`);
      else toast.info(res?.message ?? "Nothing imported");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setWorking(null);
    }
  }

  async function runSuggest() {
    setWorking("suggest");
    try {
      const res: any = await suggestWinThemeMappings({ data: { engagementId } });
      toast.success(`${res?.created ?? 0} suggestions added`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Suggest failed");
    } finally {
      setWorking(null);
    }
  }

  async function generateHints() {
    setWorking("hints");
    try {
      const res: any = await generateWinThemeHints({
        data: { engagementId, onlyMissing: true },
      });
      toast.success(`${res?.updated ?? 0} hints generated`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Hint generation failed");
    } finally {
      setWorking(null);
    }
  }

  async function addMapping(themeId: string, questionId: string) {
    const { error } = await supabase.from("win_theme_mappings").insert({
      engagement_id: engagementId,
      win_theme_id: themeId,
      question_id: questionId,
      ai_suggested: false,
      confirmed: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Theme mapped");
    await load();
  }

  async function removeMapping(id: string) {
    const { error } = await supabase.from("win_theme_mappings").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  }

  async function saveHint(mappingId: string) {
    const hint = (hintDraft[mappingId] ?? "").trim();
    const { error } = await supabase
      .from("win_theme_mappings")
      .update({ writer_hint: hint || null, updated_at: new Date().toISOString() })
      .eq("id", mappingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Hint saved");
    setHintDraft((d) => {
      const next = { ...d };
      delete next[mappingId];
      return next;
    });
    await load();
  }

  if (loading) return null;

  return (
    <Card className="mt-4 border-border bg-surface/60 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">RFP Questions & Win Theme Mappings</h3>
          <Badge variant="outline" className="text-[10px]">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isLeadership && questions.length === 0 && (
            <Button size="sm" variant="outline" onClick={importQuestions} disabled={working === "import"}>
              {working === "import" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Import from RFP
            </Button>
          )}
          {isLeadership && questions.length > 0 && themes.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={runSuggest} disabled={working === "suggest"}>
                {working === "suggest" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                Suggest mappings
              </Button>
              <Button size="sm" variant="outline" onClick={generateHints} disabled={working === "hints"}>
                {working === "hints" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lightbulb className="mr-1 h-3 w-3" />}
                Generate hints
              </Button>
            </>
          )}
          <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {questions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No RFP questions imported yet. {isLeadership ? "Click 'Import from RFP' to extract from the Opportunity analysis." : "Leadership can import them."}
            </p>
          ) : (
            questions.map((q) => {
              const qMappings = mappings.filter((m) => m.question_id === q.id);
              const mappedThemeIds = new Set(qMappings.map((m) => m.win_theme_id));
              const availableThemes = themes.filter((t) => !mappedThemeIds.has(t.id));
              return (
                <div key={q.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">
                        {q.question_number && (
                          <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            {q.question_number}
                          </span>
                        )}
                        {q.title ?? q.body.slice(0, 100)}
                      </p>
                      {q.title && <p className="mt-1 text-xs text-muted-foreground">{q.body.slice(0, 240)}{q.body.length > 240 ? "…" : ""}</p>}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {qMappings.map((m) => {
                      const theme = themes.find((t) => t.id === m.win_theme_id);
                      if (!theme) return null;
                      const isEditing = hintDraft[m.id] !== undefined;
                      return (
                        <Popover key={m.id}>
                          <PopoverTrigger asChild>
                            <button
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                m.ai_suggested && !m.confirmed
                                  ? "border-purple-500/40 bg-purple-500/10 text-purple-600"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              {theme.title}
                              {m.writer_hint && <Lightbulb className="h-2.5 w-2.5" />}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <p className="text-xs font-bold">{theme.title}</p>
                            {theme.description && (
                              <p className="mt-1 text-[11px] text-muted-foreground">{theme.description}</p>
                            )}
                            <div className="mt-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Writer hint</p>
                              {isLeadership ? (
                                <>
                                  <Textarea
                                    rows={3}
                                    className="mt-1 text-xs"
                                    placeholder="How should the writer land this theme here?"
                                    value={hintDraft[m.id] ?? m.writer_hint ?? ""}
                                    onChange={(e) =>
                                      setHintDraft((d) => ({ ...d, [m.id]: e.target.value }))
                                    }
                                  />
                                  {isEditing && (
                                    <div className="mt-2 flex gap-1">
                                      <Button size="sm" className="h-7 text-xs" onClick={() => saveHint(m.id)}>
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                          setHintDraft((d) => {
                                            const n = { ...d };
                                            delete n[m.id];
                                            return n;
                                          })
                                        }
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </>
                              ) : m.writer_hint ? (
                                <p className="mt-1 text-xs">{m.writer_hint}</p>
                              ) : (
                                <p className="mt-1 text-xs italic text-muted-foreground">No hint yet.</p>
                              )}
                            </div>
                            {isLeadership && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2 h-7 w-full text-xs text-red-500 hover:text-red-600"
                                onClick={() => removeMapping(m.id)}
                              >
                                <X className="mr-1 h-3 w-3" /> Remove mapping
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      );
                    })}

                    {isLeadership && availableThemes.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
                            <Plus className="h-2.5 w-2.5" /> Add theme
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="start">
                          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Unmapped themes
                          </p>
                          <div className="max-h-60 space-y-1 overflow-y-auto">
                            {availableThemes.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => addMapping(t.id, q.id)}
                                className="block w-full rounded p-1.5 text-left text-xs hover:bg-accent"
                              >
                                <p className="font-medium">{t.title}</p>
                                {t.description && (
                                  <p className="line-clamp-1 text-[10px] text-muted-foreground">{t.description}</p>
                                )}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}

                    {qMappings.length === 0 && !isLeadership && (
                      <span className="text-[11px] italic text-muted-foreground">No themes mapped yet.</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
