import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Sparkles, Brain, Building2, Users, Shield, Eye, Flame, AlertTriangle } from "lucide-react";
import { getMissionIntelligence, listMissionDocuments, generateIrisIntelligence } from "@/lib/iris-intelligence.functions";
import { IntelligenceSkeleton, IntelligenceErrorCard, IntelligenceEmpty } from "./IntelligenceSkeleton";
import { SeverityBadge, Collapsible } from "./MissionBriefView";
import { toast } from "sonner";

type Severity = "High" | "Medium" | "Low";
type Position = "Supportive" | "Neutral" | "Cautious" | "Unknown";

interface StrategicAssessment {
  what_the_state_really_wants?: string;
  political_environment?: { summary?: string; key_signals?: string[]; risk_level?: Severity };
  program_history?: { summary?: string; key_events?: Array<{ event: string; significance: string }> };
  stakeholder_landscape?: Array<{ stakeholder: string; role: string; position: Position; strategic_note: string }>;
  incumbent_analysis?: { incumbent_name?: string; performance_signals?: string[]; vulnerabilities?: string[]; strengths?: string[] };
  competitive_implications?: string[];
  evaluation_priorities?: Array<{ factor: string; weight_signal: Severity; notes: string }>;
  emerging_themes?: Array<{ theme: string; evidence: string; strategic_implication: string }>;
  potential_landmines?: Array<{ issue: string; severity: Severity; mitigation: string }>;
  iris_interpretation?: {
    what_matters?: string;
    what_changed?: string | null;
    what_leadership_should_know?: string;
    what_could_cause_loss?: string[];
  };
  source_references?: Array<{ document: string; insight_supported: string }>;
}

const NAVY = "#1F3864";
const GOLD = "#C9A84C";

export function StrategicAssessmentView({ missionId }: { missionId: string }) {
  const getFn = useServerFn(getMissionIntelligence);
  const listDocsFn = useServerFn(listMissionDocuments);
  const generateFn = useServerFn(generateIrisIntelligence);
  const [regenerating, setRegenerating] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mission-intelligence", missionId, "strategic_assessment"],
    queryFn: () => getFn({ data: { mission_id: missionId, layer: "strategic_assessment" } }),
    refetchInterval: (q) => (regenerating || !q.state.data?.intelligence ? 5000 : false),
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <IntelligenceSkeleton label="Loading Strategic Assessment" />;
  if (error) return <IntelligenceErrorCard onRetry={() => refetch()} />;

  const intel = data?.intelligence;
  if (!intel) return <IntelligenceEmpty missionId={missionId} layerLabel="Strategic Assessment" />;

  let sa: StrategicAssessment;
  try {
    sa = intel.content as StrategicAssessment;
    if (!sa || typeof sa !== "object") throw new Error("invalid");
  } catch {
    return <IntelligenceErrorCard onRetry={() => refetch()} />;
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const docs = await listDocsFn({ data: { mission_id: missionId } });
      const ids = (docs.documents ?? []).filter((d) => d.processing_status === "complete").map((d) => d.id);
      if (ids.length === 0) {
        toast.error("No completed documents to regenerate from");
        return;
      }
      const res = await generateFn({ data: { mission_id: missionId, document_ids: ids, layer: "strategic_assessment" } });
      if (!res.success) toast.error(`Regeneration failed: ${res.error}`);
      else {
        toast.success(`Strategic Assessment v${res.version} regenerated`);
        refetch();
      }
    } finally {
      setRegenerating(false);
    }
  }

  const ii = sa.iris_interpretation;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-6" style={{ background: "#0a0e1a" }}>
      {/* SECTION 1 — IRIS Interpretation Panel */}
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-6" style={{ borderLeft: `4px solid ${GOLD}` }}>
        <p className="text-xs uppercase tracking-widest mb-4" style={{ color: GOLD }}>
          <Brain className="inline h-3.5 w-3.5 mr-1.5" />
          IRIS Interpretation
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Box label="What Matters" body={ii?.what_matters} />
          <Box label="What Leadership Should Know" body={ii?.what_leadership_should_know} />
        </div>
        {ii?.what_changed && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs uppercase tracking-wide text-white/40 mb-1">What Changed</p>
            <p className="text-sm text-white/80">{ii.what_changed}</p>
          </div>
        )}
        {ii?.what_could_cause_loss && ii.what_could_cause_loss.length > 0 && (
          <div className="mt-4 pt-4 border-t border-red-500/20">
            <p className="text-xs uppercase tracking-wide font-semibold text-red-300 mb-2">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              What Could Cause Loss
            </p>
            <ul className="list-disc list-inside text-sm text-white/80 space-y-0.5">
              {ii.what_could_cause_loss.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* SECTION 2 — What The State Really Wants */}
      {sa.what_the_state_really_wants && (
        <section className="rounded-lg border border-white/10 p-7" style={{ background: `linear-gradient(135deg, ${NAVY}40, transparent)` }}>
          <p className="text-xs uppercase tracking-widest text-white/60 mb-3" style={{ color: GOLD }}>
            What The State Really Wants
          </p>
          <p className="text-lg text-white leading-relaxed font-light">
            {sa.what_the_state_really_wants}
          </p>
        </section>
      )}

      {/* SECTION 3 — Three column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Political Environment" icon={<Eye className="h-4 w-4" />}>
          {sa.political_environment ? (
            <>
              {sa.political_environment.risk_level && (
                <div className="mb-3">
                  <SeverityBadge value={sa.political_environment.risk_level} kind="risk" />
                </div>
              )}
              <p className="text-sm text-white/80 mb-3">{sa.political_environment.summary}</p>
              {sa.political_environment.key_signals && (
                <ul className="list-disc list-inside text-xs text-white/60 space-y-0.5">
                  {sa.political_environment.key_signals.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </>
          ) : <EmptyText>Not assessed.</EmptyText>}
        </Section>
        <Section title="Program History" icon={<Building2 className="h-4 w-4" />}>
          {sa.program_history ? (
            <>
              <p className="text-sm text-white/80 mb-3">{sa.program_history.summary}</p>
              {sa.program_history.key_events && sa.program_history.key_events.length > 0 && (
                <ul className="space-y-2">
                  {sa.program_history.key_events.map((e, i) => (
                    <li key={i} className="text-xs">
                      <span className="text-white font-medium">{e.event}</span>
                      <span className="text-white/50"> — {e.significance}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : <EmptyText>Not assessed.</EmptyText>}
        </Section>
        <Section title="Evaluation Priorities">
          {sa.evaluation_priorities && sa.evaluation_priorities.length > 0 ? (
            <ul className="space-y-2">
              {sa.evaluation_priorities.map((p, i) => (
                <li key={i} className="rounded-md bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium">{p.factor}</span>
                    <SeverityBadge value={p.weight_signal} kind="opportunity" />
                  </div>
                  <p className="mt-1 text-xs text-white/60">{p.notes}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyText>Not assessed.</EmptyText>}
        </Section>
      </div>

      {/* SECTION 4 — Stakeholder Landscape */}
      <Section title="Stakeholder Landscape" icon={<Users className="h-4 w-4" />}>
        {sa.stakeholder_landscape && sa.stakeholder_landscape.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                <th className="pb-2 pr-3">Stakeholder</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Position</th>
                <th className="pb-2">Strategic Note</th>
              </tr>
            </thead>
            <tbody>
              {sa.stakeholder_landscape.map((s, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2 pr-3 text-white font-medium">{s.stakeholder}</td>
                  <td className="py-2 pr-3 text-white/70">{s.role}</td>
                  <td className="py-2 pr-3"><PositionBadge value={s.position} /></td>
                  <td className="py-2 text-white/60">{s.strategic_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyText>No stakeholders mapped.</EmptyText>}
      </Section>

      {/* SECTION 5 — Incumbent Analysis */}
      {sa.incumbent_analysis && (
        <Section title="Incumbent Analysis" icon={<Shield className="h-4 w-4" />}>
          <p className="text-base font-medium text-white mb-4">
            {sa.incumbent_analysis.incumbent_name || "Unknown"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SubList label="Performance Signals" items={sa.incumbent_analysis.performance_signals} />
            <SubList label="Vulnerabilities" items={sa.incumbent_analysis.vulnerabilities} tone="warn" />
            <SubList label="Strengths" items={sa.incumbent_analysis.strengths} tone="good" />
          </div>
        </Section>
      )}

      {/* Competitive Implications */}
      {sa.competitive_implications && sa.competitive_implications.length > 0 && (
        <Section title="Competitive Implications">
          <ul className="list-disc list-inside text-sm text-white/80 space-y-1">
            {sa.competitive_implications.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Section>
      )}

      {/* SECTION 6 — Emerging Themes */}
      <Section title="Emerging Themes" icon={<Flame className="h-4 w-4" style={{ color: GOLD }} />}>
        {sa.emerging_themes && sa.emerging_themes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sa.emerging_themes.map((t, i) => (
              <div key={i} className="rounded-md border border-white/10 bg-white/[0.02] p-4">
                <p className="font-medium text-white">{t.theme}</p>
                <p className="mt-2 text-xs"><span className="text-white/40 uppercase tracking-wide">Evidence: </span><span className="text-white/70">{t.evidence}</span></p>
                <p className="mt-1 text-xs"><span className="text-white/40 uppercase tracking-wide">Implication: </span><span className="text-white/70">{t.strategic_implication}</span></p>
              </div>
            ))}
          </div>
        ) : <EmptyText>No themes identified.</EmptyText>}
      </Section>

      {/* SECTION 7 — Potential Landmines */}
      <Section title="Potential Landmines" icon={<AlertTriangle className="h-4 w-4 text-red-400" />}>
        {sa.potential_landmines && sa.potential_landmines.length > 0 ? (
          <div className="space-y-3">
            {sa.potential_landmines.map((l, i) => (
              <div key={i} className="rounded-md border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white font-medium">{l.issue}</p>
                  <SeverityBadge value={l.severity} kind="risk" />
                </div>
                <p className="mt-2 text-xs"><span className="text-white/40 uppercase tracking-wide">Mitigation: </span><span className="text-white/70">{l.mitigation}</span></p>
              </div>
            ))}
          </div>
        ) : <EmptyText>No landmines flagged.</EmptyText>}
      </Section>

      {/* SECTION 8 — Source References */}
      <Collapsible title="IRIS Intelligence Sources" subtitle="All intelligence is traceable to source documents">
        <ul className="space-y-2">
          {(sa.source_references ?? []).map((s, i) => (
            <li key={i} className="text-sm">
              <span className="text-white font-medium">{s.document}</span>
              <span className="text-white/50"> — {s.insight_supported}</span>
            </li>
          ))}
          {(!sa.source_references || sa.source_references.length === 0) && <EmptyText>No source references.</EmptyText>}
        </ul>
      </Collapsible>

      {/* Footer */}
      <footer className="flex items-center justify-between pt-4 border-t border-white/10 text-xs text-white/40">
        <p>
          <Sparkles className="inline h-3 w-3 mr-1" style={{ color: GOLD }} />
          Generated by IRIS™ · Version {intel.version} · {new Date(intel.generated_at).toLocaleString()}
        </p>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs disabled:opacity-50"
          style={{ background: NAVY, color: "white" }}
        >
          <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
      </footer>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
      <h3 className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60 mb-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Box({ label, body }: { label: string; body?: string }) {
  return (
    <div className="rounded-md bg-white/[0.03] border border-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-white/40 mb-1">{label}</p>
      <p className="text-sm text-white/85">{body || "—"}</p>
    </div>
  );
}

function SubList({ label, items, tone }: { label: string; items?: string[]; tone?: "warn" | "good" }) {
  const color = tone === "warn" ? "text-amber-200" : tone === "good" ? "text-emerald-200" : "text-white/80";
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40 mb-2">{label}</p>
      {items && items.length > 0 ? (
        <ul className={`list-disc list-inside text-sm space-y-0.5 ${color}`}>
          {items.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      ) : <p className="text-sm italic text-white/30">—</p>}
    </div>
  );
}

function PositionBadge({ value }: { value: Position }) {
  const styles: Record<Position, { bg: string; fg: string }> = {
    Supportive: { bg: "rgba(16,185,129,0.18)", fg: "#6ee7b7" },
    Neutral: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1" },
    Cautious: { bg: "rgba(245,158,11,0.18)", fg: "#fcd34d" },
    Unknown: { bg: "rgba(56,189,248,0.18)", fg: "#7dd3fc" },
  };
  const s = styles[value] ?? styles.Unknown;
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {value}
    </span>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-white/40">{children}</p>;
}
