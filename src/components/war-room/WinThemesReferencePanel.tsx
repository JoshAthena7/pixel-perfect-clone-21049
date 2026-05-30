import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Sparkles } from "lucide-react";

type Mapping = {
  id: string;
  win_theme_id: string;
  section_id: string | null;
  question_id: string | null;
  writer_hint: string | null;
  ai_suggested: boolean;
  confirmed: boolean;
  win_themes: { title: string; description: string | null } | null;
  rfp_questions: { question_number: string | null; title: string | null; body: string | null } | null;
};

export function WinThemesReferencePanel({
  engagementId,
  sectionId,
}: {
  engagementId: string;
  sectionId: string;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Get questions in this section to also include question-level mappings
      const { data: qs } = await supabase
        .from("rfp_questions")
        .select("id")
        .eq("engagement_id", engagementId)
        .eq("section_id", sectionId);
      const questionIds = (qs ?? []).map((q: any) => q.id);

      // Section-level mappings
      const sectionQuery = supabase
        .from("win_theme_mappings")
        .select(
          "id, win_theme_id, section_id, question_id, writer_hint, ai_suggested, confirmed, win_themes(title, description), rfp_questions(question_number, title, body)",
        )
        .eq("engagement_id", engagementId)
        .eq("confirmed", true)
        .eq("section_id", sectionId);

      const [{ data: sectionRows }, { data: questionRows }] = await Promise.all([
        sectionQuery,
        questionIds.length
          ? supabase
              .from("win_theme_mappings")
              .select(
                "id, win_theme_id, section_id, question_id, writer_hint, ai_suggested, confirmed, win_themes(title, description), rfp_questions(question_number, title, body)",
              )
              .eq("engagement_id", engagementId)
              .eq("confirmed", true)
              .in("question_id", questionIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;
      const combined = [...((sectionRows as any[]) ?? []), ...((questionRows as any[]) ?? [])];
      setMappings(combined as Mapping[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId, sectionId]);

  if (loading) return null;
  if (mappings.length === 0) return null;

  // Group by theme
  const byTheme = new Map<string, Mapping[]>();
  for (const m of mappings) {
    const list = byTheme.get(m.win_theme_id) ?? [];
    list.push(m);
    byTheme.set(m.win_theme_id, list);
  }

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold">Win Themes for This Section</h3>
        <Badge variant="outline" className="text-[10px]">
          {byTheme.size} theme{byTheme.size === 1 ? "" : "s"}
        </Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Land these themes in your draft. Specific writer guidance is highlighted below where available.
      </p>
      <div className="space-y-3">
        {Array.from(byTheme.entries()).map(([themeId, items]) => {
          const theme = items[0].win_themes;
          if (!theme) return null;
          return (
            <div key={themeId} className="rounded-md border border-border bg-surface/80 p-3">
              <p className="text-sm font-semibold text-amber-600">{theme.title}</p>
              {theme.description && (
                <p className="mt-1 text-xs text-muted-foreground">{theme.description}</p>
              )}
              <div className="mt-2 space-y-2">
                {items.map((m) => {
                  if (!m.writer_hint && !m.rfp_questions) return null;
                  return (
                    <div
                      key={m.id}
                      className="rounded border border-amber-500/20 bg-amber-500/5 p-2"
                    >
                      {m.rfp_questions && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.rfp_questions.question_number ? `Q${m.rfp_questions.question_number} — ` : ""}
                          {m.rfp_questions.title ?? m.rfp_questions.body?.slice(0, 80)}
                        </p>
                      )}
                      {m.writer_hint && (
                        <p className="mt-1 flex gap-1.5 text-xs leading-relaxed">
                          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                          <span>{m.writer_hint}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
