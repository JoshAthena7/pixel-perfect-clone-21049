import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { relativeTime } from "@/lib/time";

type HolyGrail = {
  summary?: string;
  client?: string;
  scope?: string;
  key_dates?: Array<{ label: string; date: string }>;
  evaluation_criteria?: Array<{ criterion: string; weight?: string; notes?: string }>;
  must_have_requirements?: string[];
  scored_requirements?: string[];
  page_limits?: string;
  submission_format?: string;
  incumbent_signals?: string[];
  win_factors?: string[];
  risks?: string[];
  open_questions?: string[];
};

export function HolyGrailPanel({ engagementId, refreshKey = 0 }: { engagementId: string; refreshKey?: number }) {
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("engagement_research")
        .select("*")
        .eq("engagement_id", engagementId)
        .eq("category", "holy_grail")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setRow(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [engagementId, refreshKey]);

  if (loading) return null;
  if (!row) {
    return (
      <Card className="border-dashed border-border bg-surface/60 p-4 lg:col-span-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary/70" />
          No Holy Grail analysis yet. Leadership can run analysis from any RFP in the library below.
        </div>
      </Card>
    );
  }

  const c: HolyGrail = row.content ?? {};

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-surface p-6 lg:col-span-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-bold">Holy Grail — RFP Intelligence</h2>
            <p className="text-xs text-muted-foreground">
              {row.title} • updated {relativeTime(row.updated_at)}
            </p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {c.summary && (
            <Section title="Executive Summary" className="md:col-span-2">
              <p className="text-sm leading-relaxed">{c.summary}</p>
            </Section>
          )}
          {c.client && <Section title="Client"><p className="text-sm">{c.client}</p></Section>}
          {c.scope && <Section title="Scope"><p className="text-sm">{c.scope}</p></Section>}
          {c.page_limits && <Section title="Page / Format Limits"><p className="text-sm">{c.page_limits}</p></Section>}
          {c.submission_format && <Section title="Submission Format"><p className="text-sm">{c.submission_format}</p></Section>}

          {c.key_dates?.length ? (
            <Section title="Key Dates">
              <ul className="space-y-1 text-sm">
                {c.key_dates.map((d, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium">{d.date}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {c.evaluation_criteria?.length ? (
            <Section title="Evaluation Criteria">
              <ul className="space-y-1.5 text-sm">
                {c.evaluation_criteria.map((e, i) => (
                  <li key={i}>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{e.criterion}</span>
                      {e.weight && <span className="text-primary">{e.weight}</span>}
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <BulletSection title="Must-Have Requirements" items={c.must_have_requirements} />
          <BulletSection title="Scored Requirements" items={c.scored_requirements} />
          <BulletSection title="Win Factors" items={c.win_factors} tone="success" />
          <BulletSection title="Risks / Red Flags" items={c.risks} tone="danger" />
          <BulletSection title="Incumbent Signals" items={c.incumbent_signals} />
          <BulletSection title="Open Questions" items={c.open_questions} />
        </div>
      )}
    </Card>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-border bg-surface/80 p-3 ${className}`}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function BulletSection({ title, items, tone }: { title: string; items?: string[]; tone?: "success" | "danger" }) {
  if (!items?.length) return null;
  const dot = tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-red-500" : "bg-primary/70";
  return (
    <Section title={title}>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
