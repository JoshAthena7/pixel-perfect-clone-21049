import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { analyzeCategory, startHolyGrailRun, finishHolyGrailRun, generateHolyGrailSummary } from "@/lib/ai/holy-grail.functions";
import { toast } from "sonner";
import { RfpQuestionsThemesPanel } from "./RfpQuestionsThemesPanel";
import { PolicyPanel } from "./PolicyPanel";
import { CompliancePanel } from "./CompliancePanel";

type CategoryKey = "opportunity" | "market" | "political" | "competitive" | "customer" | "provider" | "community";

const CATEGORIES: { key: CategoryKey; label: string; storage: string; question: string }[] = [
  { key: "opportunity", label: "Opportunity", storage: "holy_grail_opportunity", question: "What is being bought?" },
  { key: "market", label: "Market", storage: "holy_grail_market", question: "What environment are bidders entering?" },
  { key: "political", label: "Political", storage: "holy_grail_political", question: "What political problem is the state trying to solve?" },
  { key: "competitive", label: "Competitive", storage: "holy_grail_competitive", question: "Who is likely to win if nothing changes?" },
  { key: "customer", label: "Customer", storage: "holy_grail_customer", question: "What problem are they actually buying a solution for?" },
  { key: "provider", label: "Provider Ecosystem", storage: "holy_grail_provider", question: "Who can help or hurt implementation?" },
  { key: "community", label: "Community", storage: "holy_grail_community", question: "What are people experiencing that state leadership may not fully see?" },
];

type Row = { id: string; category: string; title: string | null; content: any; confidence_score: number | null; updated_at: string };

export function HolyGrailPanel({
  engagementId,
  refreshKey = 0,
  isLeadership = false,
}: {
  engagementId: string;
  refreshKey?: number;
  isLeadership?: boolean;
}) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<CategoryKey>("opportunity");
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepDone, setStepDone] = useState(0);
  const [refreshingCat, setRefreshingCat] = useState<CategoryKey | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("engagement_research")
      .select("id, category, title, content, confidence_score, updated_at")
      .eq("engagement_id", engagementId)
      .like("category", "holy_grail%")
      .order("updated_at", { ascending: false });
    const map: Record<string, Row> = {};
    (data ?? []).forEach((r: any) => {
      if (!map[r.category]) map[r.category] = r;
    });
    setRows(map);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function runFullAnalysis() {
    if (running) return;
    setRunning(true);
    setStepDone(0);
    setCurrentStep("starting");
    let createdRunId: string | null = null;
    try {
      const run = (await startHolyGrailRun({ data: { engagementId } })) as any;
      createdRunId = run.id;
      setRunId(createdRunId);
      const steps: CategoryKey[] = ["market", "political", "competitive", "customer", "provider", "community"];
      let i = 1;
      for (const cat of steps) {
        setCurrentStep(cat);
        await analyzeCategory({ data: { engagementId, category: cat, runId: createdRunId!, force: false } });
        setStepDone(i++);
        await load();
      }
      await finishHolyGrailRun({ data: { runId: createdRunId!, status: "done" } });
      toast.success("Holy Grail complete");
    } catch (err: any) {
      const msg = err?.message ?? "Analysis failed";
      toast.error(msg);
      if (createdRunId) {
        try { await finishHolyGrailRun({ data: { runId: createdRunId, status: "failed", error: msg } }); } catch {}
      }
    } finally {
      setRunning(false);
      setCurrentStep(null);
      setRunId(null);
      load();
    }
  }

  async function refreshCategory(cat: CategoryKey) {
    if (cat === "opportunity") {
      toast.info("Re-run Opportunity by clicking the Holy Grail button on an RFP file in the library.");
      return;
    }
    setRefreshingCat(cat);
    try {
      await analyzeCategory({ data: { engagementId, category: cat as any, force: true } });
      toast.success(`${cat} refreshed`);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Refresh failed");
    } finally {
      setRefreshingCat(null);
    }
  }

  async function runSummary(style: "executive" | "brief" | "actions" = "executive") {
    if (summarizing) return;
    setSummarizing(true);
    try {
      await generateHolyGrailSummary({ data: { engagementId, style } });
      toast.success("Executive summary ready");
      setShowSummary(true);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not generate summary");
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) return null;

  const anyContent = Object.keys(rows).length > 0;
  if (!anyContent && !isLeadership) {
    return (
      <Card className="border-dashed border-border bg-surface/60 p-4 lg:col-span-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary/70" />
          No Holy Grail analysis yet. Leadership can run it.
        </div>
      </Card>
    );
  }

  const activeDef = CATEGORIES.find((c) => c.key === active)!;
  const activeRow = rows[activeDef.storage];
  const oppRow = rows["holy_grail_opportunity"];
  const hasOpportunity = !!oppRow;
  const summaryRow = rows["holy_grail_summary"];
  const categoryCount = CATEGORIES.reduce((n, c) => n + (rows[c.storage] ? 1 : 0), 0);
  const canSummarize = categoryCount >= 1;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-surface p-6 lg:col-span-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-bold">Holy Grail — Full Opportunity Intelligence</h2>
            <p className="text-xs text-muted-foreground">
              {hasOpportunity ? <>Opportunity from <strong>{oppRow.title}</strong> · updated {relativeTime(oppRow.updated_at)}</> : "Start by analyzing an RFP, then run full intelligence."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runSummary("executive")}
            disabled={summarizing || !canSummarize}
            title={canSummarize ? "Synthesize all sections into a 90-second executive summary" : "Run at least one category first"}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summarizing ? "Summarizing…" : summaryRow ? "Regenerate Summary" : "Generate Summary"}
          </button>
          {isLeadership && (
            <button
              onClick={runFullAnalysis}
              disabled={running || !hasOpportunity}
              title={hasOpportunity ? "Run all 6 web-research categories" : "Analyze an RFP first"}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {running ? `Researching ${currentStep ?? "…"} (${stepDone}/6)` : "Run Full Intelligence"}
            </button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <>
          {summaryRow && (
            <SummaryCard
              row={summaryRow}
              show={showSummary}
              onToggle={() => setShowSummary((v) => !v)}
              onRegenerate={(style) => runSummary(style)}
              regenerating={summarizing}
            />
          )}

          {/* Tab bar */}
          <div className="mt-4 flex flex-wrap gap-1 border-b border-border/60">
            {CATEGORIES.map((c) => {
              const row = rows[c.storage];
              const has = !!row;
              const isActive = c.key === active;
              return (
                <button
                  key={c.key}
                  onClick={() => setActive(c.key)}
                  className={`relative flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "border-primary text-primary"
                      : has
                        ? "border-transparent text-foreground hover:text-primary"
                        : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
                  }`}
                >
                  {c.label}
                  {has && row.confidence_score != null && (
                    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      row.confidence_score >= 0.7 ? "bg-emerald-500/15 text-emerald-600"
                      : row.confidence_score >= 0.4 ? "bg-amber-500/15 text-amber-600"
                      : "bg-red-500/15 text-red-600"
                    }`}>
                      {Math.round(row.confidence_score * 100)}%
                    </span>
                  )}
                  {currentStep === c.key && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
              );
            })}
          </div>

          {/* Strategic question */}
          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Strategic Question</p>
            <p className="text-sm font-medium text-primary">{activeDef.question}</p>
          </div>

          {/* Active section */}
          <div className="mt-4">
            {!activeRow ? (
              <div className="rounded-md border border-dashed border-border bg-surface/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No {activeDef.label} intelligence yet.
                </p>
                {isLeadership && active !== "opportunity" && hasOpportunity && (
                  <button
                    onClick={() => refreshCategory(active)}
                    disabled={refreshingCat === active}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    {refreshingCat === active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Research {activeDef.label}
                  </button>
                )}
                {!hasOpportunity && active !== "opportunity" && (
                  <p className="mt-2 text-xs text-muted-foreground">Run Opportunity analysis first.</p>
                )}
              </div>
            ) : (
              <SectionContent
                row={activeRow}
                categoryKey={active}
                onRefresh={isLeadership ? () => refreshCategory(active) : undefined}
                refreshing={refreshingCat === active}
              />
            )}
          </div>

          <PolicyPanel engagementId={engagementId} isLeadership={isLeadership} />
          <CompliancePanel engagementId={engagementId} isLeadership={isLeadership} />
          <RfpQuestionsThemesPanel engagementId={engagementId} isLeadership={isLeadership} />
        </>
      )}
    </Card>
  );
}

function SectionContent({
  row,
  categoryKey,
  onRefresh,
  refreshing,
}: {
  row: Row;
  categoryKey: CategoryKey;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const c = row.content ?? {};
  const sources: string[] = c._sources ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Updated {relativeTime(row.updated_at)}</span>
        {onRefresh && categoryKey !== "opportunity" && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        )}
      </div>

      {c.summary && (
        <div className="mb-3 rounded-md border border-border bg-surface/80 p-3">
          <p className="text-sm leading-relaxed">{c.summary}</p>
        </div>
      )}

      {categoryKey === "opportunity" && <OpportunityView c={c} />}
      {categoryKey === "market" && <MarketView c={c} />}
      {categoryKey === "political" && <PoliticalView c={c} />}
      {categoryKey === "competitive" && <CompetitiveView c={c} />}
      {categoryKey === "customer" && <CustomerView c={c} />}
      {categoryKey === "provider" && <ProviderView c={c} />}
      {categoryKey === "community" && <CommunityView c={c} />}

      {sources.length > 0 && (
        <details className="mt-4 rounded-md border border-border bg-surface/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {sources.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ============ Per-category renderers ============

function OpportunityView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Program" value={c.program_name} />
      <Field label="Agency" value={c.agency} />
      <Field label="State" value={c.state} />
      <Field label="Population Served" value={c.population_served} />
      <Field label="Enrollment" value={c.enrollment} />
      <Field label="Budget" value={c.budget} />
      <Field label="Contract Term" value={c.contract_term} />
      <Field label="Procurement Vehicle" value={c.procurement_vehicle} />
      <Field label="Page Limits" value={c.page_limits} />
      <Field label="Submission Format" value={c.submission_format} />
      <BulletField label="Incumbents" items={c.incumbents} className="md:col-span-2" />
      <BulletField label="Regions" items={c.regions} className="md:col-span-2" />
      {c.timeline?.length ? (
        <Section title="Timeline" className="md:col-span-2">
          <ul className="space-y-1 text-sm">
            {c.timeline.map((d: any, i: number) => (
              <li key={i} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium">{d.date}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {c.evaluation_criteria?.length ? (
        <Section title="Evaluation Criteria" className="md:col-span-2">
          <ul className="space-y-1.5 text-sm">
            {c.evaluation_criteria.map((e: any, i: number) => (
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
      <BulletField label="Mandatory Requirements" items={c.mandatory_requirements} />
      <BulletField label="Scored Requirements" items={c.scored_requirements} />
      <BulletField label="Historical Awards" items={c.historical_awards} className="md:col-span-2" />
      <BulletField label="Win Factors" items={c.win_factors} tone="success" />
      <BulletField label="Risks" items={c.risks} tone="danger" />
      <BulletField label="Open Questions" items={c.open_questions} className="md:col-span-2" />
    </div>
  );
}

function MarketView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Program Structure" value={c.program_structure} className="md:col-span-2" />
      <Field label="Enrollment Trends" value={c.enrollment_trends} />
      <Field label="Population Change" value={c.population_change} />
      <Field label="Fiscal Outlook" value={c.fiscal_outlook} />
      <Field label="Managed Care Maturity" value={c.managed_care_maturity} />
      <Field label="Provider Market Dynamics" value={c.provider_market_dynamics} className="md:col-span-2" />
      <BulletField label="MCO Landscape" items={c.mco_landscape} />
      <BulletField label="Recent Legislation" items={c.recent_legislation} />
      {c.market_share?.length ? (
        <Section title="Market Share" className="md:col-span-2">
          <ul className="space-y-1 text-sm">
            {c.market_share.map((m: any, i: number) => (
              <li key={i} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                <span className="font-medium">{m.plan}</span>
                <span className="text-primary">{m.share}{m.notes && <span className="ml-2 text-xs text-muted-foreground">— {m.notes}</span>}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function PoliticalView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {c.inferred_political_problem && (
        <Section title="Inferred Political Problem" className="md:col-span-2">
          <p className="text-sm font-medium text-primary">{c.inferred_political_problem}</p>
        </Section>
      )}
      <BulletField label="Governor Priorities" items={c.governor_priorities} />
      <BulletField label="Medicaid Director Priorities" items={c.medicaid_director_priorities} />
      <BulletField label="Leadership Changes" items={c.leadership_changes} />
      <BulletField label="Legislative Pressures" items={c.legislative_pressures} />
      <BulletField label="Budget Pressures" items={c.budget_pressures} />
      <BulletField label="Advocacy Influence" items={c.advocacy_influence} />
      <BulletField label="Provider Association Influence" items={c.provider_association_influence} />
      <Field label="Election Considerations" value={c.election_considerations} className="md:col-span-2" />
    </div>
  );
}

function CompetitiveView({ c }: { c: any }) {
  return (
    <div className="space-y-3">
      {c.likely_winner_if_nothing_changes && (
        <Section title="Likely Winner If Nothing Changes">
          <p className="text-sm font-medium text-primary">{c.likely_winner_if_nothing_changes}</p>
        </Section>
      )}
      {c.likely_bidders?.length ? (
        <div className="space-y-3">
          {c.likely_bidders.map((b: any, i: number) => (
            <div key={i} className="rounded-md border border-border bg-surface/80 p-3">
              <h4 className="text-sm font-bold">{b.name}</h4>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <BulletField label="Strengths" items={b.strengths} tone="success" />
                <BulletField label="Weaknesses" items={b.weaknesses} tone="danger" />
                <BulletField label="Recent Wins" items={b.recent_wins} />
                <BulletField label="Recent Losses" items={b.recent_losses} />
                <Field label="Local Footprint" value={b.local_footprint} />
                <Field label="Provider Relationships" value={b.provider_relationships} />
                <Field label="Community Relationships" value={b.community_relationships} />
                <Field label="State Reputation" value={b.state_reputation} />
                <Field label="Executive Relationships" value={b.executive_relationships} className="md:col-span-2" />
                <BulletField label="Known Performance Issues" items={b.known_performance_issues} tone="danger" className="md:col-span-2" />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">No bidder profiles extracted.</p>}
    </div>
  );
}

function CustomerView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {c.inferred_real_problem && (
        <Section title="Inferred Real Problem" className="md:col-span-2">
          <p className="text-sm font-medium text-primary">{c.inferred_real_problem}</p>
        </Section>
      )}
      <BulletField label="Keeps Them Up at Night" items={c.keeps_them_up_at_night} tone="danger" />
      <BulletField label="Embarrassments" items={c.embarrassments} tone="danger" />
      <BulletField label="Auditor Criticisms" items={c.auditor_criticisms} />
      <BulletField label="Legislator Criticisms" items={c.legislator_criticisms} />
      <BulletField label="Advocate Criticisms" items={c.advocate_criticisms} />
      <BulletField label="Stated Fixes" items={c.stated_fixes} tone="success" />
    </div>
  );
}

function ProviderView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BulletField label="Hospital Systems" items={c.hospital_systems} />
      <BulletField label="FQHCs" items={c.fqhcs} />
      <BulletField label="Behavioral Health" items={c.behavioral_health} />
      <BulletField label="HCBS" items={c.hcbs} />
      <BulletField label="IDD" items={c.idd} />
      <BulletField label="LTSS" items={c.ltss} />
      <BulletField label="Associations" items={c.associations} className="md:col-span-2" />
      <BulletField label="Happy" items={c.happy} tone="success" />
      <BulletField label="Angry" items={c.angry} tone="danger" />
      <BulletField label="Ignored" items={c.ignored} />
      <BulletField label="Influential" items={c.influential} />
    </div>
  );
}

function CommunityView({ c }: { c: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BulletField label="Disability Advocates" items={c.disability_advocates} />
      <BulletField label="Aging Advocates" items={c.aging_advocates} />
      <BulletField label="Family Organizations" items={c.family_orgs} />
      <BulletField label="Child Welfare" items={c.child_welfare} />
      <BulletField label="Behavioral Coalitions" items={c.behavioral_coalitions} />
      <BulletField label="Provider Coalitions" items={c.provider_coalitions} />
      <BulletField label="Tribal Organizations" items={c.tribal_orgs} />
      <BulletField label="Community Leaders" items={c.community_leaders} />
      <BulletField label="Complaints" items={c.complaints} tone="danger" />
      <BulletField label="Frustrations" items={c.frustrations} tone="danger" />
      <BulletField label="Gaps" items={c.gaps} />
      <BulletField label="Emerging Needs" items={c.emerging_needs} tone="success" />
    </div>
  );
}

// ============ Primitives ============

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-border bg-surface/80 p-3 ${className}`}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, className = "" }: { label: string; value?: string; className?: string }) {
  if (!value) return null;
  return (
    <Section title={label} className={className}>
      <p className="text-sm">{value}</p>
    </Section>
  );
}

function BulletField({
  label,
  items,
  tone,
  className = "",
}: {
  label: string;
  items?: string[];
  tone?: "success" | "danger";
  className?: string;
}) {
  if (!items?.length) return null;
  const dot = tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-red-500" : "bg-primary/70";
  return (
    <Section title={label} className={className}>
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

type SummaryStyle = "executive" | "brief" | "actions";

function SummaryCard({
  row,
  show,
  onToggle,
  onRegenerate,
  regenerating,
}: {
  row: Row;
  show: boolean;
  onToggle: () => void;
  onRegenerate: (style: SummaryStyle) => void;
  regenerating: boolean;
}) {
  const c = row.content ?? {};
  const rec: string = c.bid_recommendation ?? "";
  const recTone =
    rec.startsWith("BID-WITH") ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
    : rec.startsWith("NO") ? "bg-red-500/15 text-red-600 border-red-500/30"
    : rec.startsWith("BID") ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-surface p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Executive Summary</p>
            <p className="text-xs text-muted-foreground">Generated {relativeTime(row.updated_at)}</p>
          </div>
          {rec && (
            <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${recTone}`}>
              {rec}
            </span>
          )}
          {c.win_probability && (
            <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Win: {c.win_probability}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRegenerate("brief")}
            disabled={regenerating}
            title="Tighten to ~180 words"
            className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >Brief</button>
          <button
            onClick={() => onRegenerate("actions")}
            disabled={regenerating}
            title="Lead with next actions"
            className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >Actions</button>
          <button onClick={onToggle} className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground">
            {show ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {show && (
        <div className="mt-3 space-y-3">
          {c.headline && <p className="text-sm font-semibold leading-snug">{c.headline}</p>}

          {Array.isArray(c.key_findings) && c.key_findings.length > 0 && (
            <SummaryList title="Key Findings" items={c.key_findings} />
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {Array.isArray(c.win_themes) && c.win_themes.length > 0 && (
              <SummaryList title="Win Themes" items={c.win_themes} tone="success" />
            )}
            {Array.isArray(c.top_risks) && c.top_risks.length > 0 && (
              <SummaryList title="Top Risks" items={c.top_risks} tone="danger" />
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {c.competitive_picture && <SummaryBlock title="Competitive" text={c.competitive_picture} />}
            {c.political_picture && <SummaryBlock title="Political" text={c.political_picture} />}
            {c.customer_picture && <SummaryBlock title="Customer" text={c.customer_picture} />}
          </div>

          {Array.isArray(c.next_actions) && c.next_actions.length > 0 && (
            <SummaryList title="Next Actions" items={c.next_actions} tone="primary" />
          )}
          {Array.isArray(c.open_questions) && c.open_questions.length > 0 && (
            <SummaryList title="Open Questions" items={c.open_questions} />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryList({ title, items, tone }: { title: string; items: string[]; tone?: "success" | "danger" | "primary" }) {
  const dot =
    tone === "success" ? "bg-emerald-500"
    : tone === "danger" ? "bg-red-500"
    : tone === "primary" ? "bg-primary"
    : "bg-muted-foreground/50";
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="leading-snug">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-surface/70 p-2.5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="text-xs leading-relaxed">{text}</p>
    </div>
  );
}
