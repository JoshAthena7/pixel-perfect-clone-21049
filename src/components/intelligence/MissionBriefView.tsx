import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, RefreshCw, FileText, Calendar, AlertTriangle, TrendingUp, Sparkles, Target } from "lucide-react";
import { getMissionIntelligence, generateIrisIntelligence } from "@/lib/iris-intelligence.functions";
import { listMissionDocuments } from "@/lib/iris-intelligence.functions";
import { IntelligenceSkeleton, IntelligenceErrorCard, IntelligenceEmpty } from "./IntelligenceSkeleton";
import { toast } from "sonner";

type Severity = "High" | "Medium" | "Low";
type Confidence = "Pursue" | "Pursue with Caution" | "Needs More Analysis";

interface MissionBrief {
  procurement_overview?: {
    program_name?: string;
    state?: string;
    agency?: string;
    contract_type?: string;
    contract_value_estimate?: string;
    contract_term?: string;
    populations_served?: string[];
    summary?: string;
  };
  why_this_exists?: string;
  buyer_objectives?: string[];
  key_deadlines?: Array<{ event: string; date: string; notes: string }>;
  key_risks?: Array<{ risk: string; severity: Severity; basis: string }>;
  key_opportunities?: Array<{ opportunity: string; strength: Severity; basis: string }>;
  recommended_win_themes?: Array<{ theme: string; rationale: string }>;
  iris_assessment?: {
    headline?: string;
    watch_items?: string[];
    confidence_signal?: Confidence;
  };
  source_references?: Array<{ document: string; insight_supported: string }>;
}

const NAVY = "#1F3864";
const GOLD = "#C9A84C";

export function MissionBriefView({ missionId }: { missionId: string }) {
  const getFn = useServerFn(getMissionIntelligence);
  const listDocsFn = useServerFn(listMissionDocuments);
  const generateFn = useServerFn(generateIrisIntelligence);
  const [regenerating, setRegenerating] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mission-intelligence", missionId, "mission_brief"],
    queryFn: () => getFn({ data: { mission_id: missionId, layer: "mission_brief" } }),
  });

  if (isLoading) return <IntelligenceSkeleton label="Loading Mission Brief" />;
  if (error) return <IntelligenceErrorCard onRetry={() => refetch()} />;

  const intel = data?.intelligence;
  if (!intel) return <IntelligenceEmpty missionId={missionId} layerLabel="Mission Brief" />;

  let brief: MissionBrief;
  try {
    brief = intel.content as MissionBrief;
    if (!brief || typeof brief !== "object") throw new Error("invalid");
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
      const res = await generateFn({ data: { mission_id: missionId, document_ids: ids, layer: "mission_brief" } });
      if (!res.success) toast.error(`Regeneration failed: ${res.error}`);
      else {
        toast.success(`Mission Brief v${res.version} regenerated`);
        refetch();
      }
    } finally {
      setRegenerating(false);
    }
  }

  const a = brief.iris_assessment;
  const po = brief.procurement_overview;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-6" style={{ background: "#0a0e1a" }}>
      {/* SECTION 1 — IRIS Assessment Banner */}
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-6" style={{ borderLeft: `4px solid ${GOLD}` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest" style={{ color: GOLD }}>
              IRIS Assessment
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white leading-snug">
              {a?.headline ?? "—"}
            </h2>
            {a?.watch_items && a.watch_items.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-white/60 mb-1">Watch:</p>
                <ul className="list-disc list-inside text-sm text-white/80 space-y-0.5">
                  {a.watch_items.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
          <ConfidenceBadge value={a?.confidence_signal} />
        </div>
      </section>

      {/* SECTION 2 — Procurement Overview */}
      <Section title="Procurement Overview" icon={<FileText className="h-4 w-4" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Program" value={po?.program_name} />
          <Field label="State" value={po?.state} />
          <Field label="Agency" value={po?.agency} />
          <Field label="Contract Type" value={po?.contract_type} />
          <Field label="Estimated Value" value={po?.contract_value_estimate} />
          <Field label="Term" value={po?.contract_term} />
        </div>
        {po?.populations_served && po.populations_served.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-white/40 mb-1">Populations Served</p>
            <div className="flex flex-wrap gap-1.5">
              {po.populations_served.map((p, i) => (
                <span key={i} className="px-2 py-0.5 text-xs rounded bg-white/5 text-white/80 border border-white/10">{p}</span>
              ))}
            </div>
          </div>
        )}
        {po?.summary && (
          <p className="mt-4 text-sm text-white/80 leading-relaxed">{po.summary}</p>
        )}
        {brief.why_this_exists && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs uppercase tracking-wide text-white/40 mb-1">Why This Exists</p>
            <p className="text-sm text-white/80">{brief.why_this_exists}</p>
          </div>
        )}
        {brief.buyer_objectives && brief.buyer_objectives.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs uppercase tracking-wide text-white/40 mb-1">Buyer Objectives</p>
            <ul className="list-disc list-inside text-sm text-white/80 space-y-0.5">
              {brief.buyer_objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        )}
      </Section>

      {/* SECTION 3 — Risks | Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Key Risks" icon={<AlertTriangle className="h-4 w-4 text-red-400" />}>
          <ul className="space-y-3">
            {(brief.key_risks ?? []).map((r, i) => (
              <li key={i} className="rounded-md border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white font-medium">{r.risk}</p>
                  <SeverityBadge value={r.severity} kind="risk" />
                </div>
                <p className="mt-1 text-xs text-white/60">{r.basis}</p>
              </li>
            ))}
            {(!brief.key_risks || brief.key_risks.length === 0) && <EmptyText>No risks identified.</EmptyText>}
          </ul>
        </Section>
        <Section title="Key Opportunities" icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}>
          <ul className="space-y-3">
            {(brief.key_opportunities ?? []).map((o, i) => (
              <li key={i} className="rounded-md border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white font-medium">{o.opportunity}</p>
                  <SeverityBadge value={o.strength} kind="opportunity" />
                </div>
                <p className="mt-1 text-xs text-white/60">{o.basis}</p>
              </li>
            ))}
            {(!brief.key_opportunities || brief.key_opportunities.length === 0) && <EmptyText>No opportunities identified.</EmptyText>}
          </ul>
        </Section>
      </div>

      {/* SECTION 4 — Win Themes */}
      <Section title="Recommended Win Themes" icon={<Target className="h-4 w-4" style={{ color: GOLD }} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(brief.recommended_win_themes ?? []).map((t, i) => (
            <div key={i} className="rounded-md border p-4" style={{ borderColor: `${GOLD}40`, background: `${GOLD}08` }}>
              <p className="font-medium text-white">{t.theme}</p>
              <p className="mt-1 text-xs text-white/70">{t.rationale}</p>
            </div>
          ))}
          {(!brief.recommended_win_themes || brief.recommended_win_themes.length === 0) && <EmptyText>No win themes generated.</EmptyText>}
        </div>
      </Section>

      {/* SECTION 5 — Deadlines */}
      <Section title="Key Deadlines" icon={<Calendar className="h-4 w-4" />}>
        {brief.key_deadlines && brief.key_deadlines.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                <th className="pb-2 pr-4">Event</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {brief.key_deadlines.map((d, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">{d.event}</td>
                  <td className="py-2 pr-4 text-white/80 whitespace-nowrap">{d.date}</td>
                  <td className="py-2 text-white/60">{d.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyText>No deadlines extracted.</EmptyText>
        )}
      </Section>

      {/* SECTION 6 — Source References */}
      <Collapsible title="IRIS Intelligence Sources" subtitle="All intelligence is traceable to source documents">
        <ul className="space-y-2">
          {(brief.source_references ?? []).map((s, i) => (
            <li key={i} className="text-sm">
              <span className="text-white font-medium">{s.document}</span>
              <span className="text-white/50"> — {s.insight_supported}</span>
            </li>
          ))}
          {(!brief.source_references || brief.source_references.length === 0) && <EmptyText>No source references.</EmptyText>}
        </ul>
      </Collapsible>

      {/* SECTION 7 — Footer */}
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

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value || "—"}</p>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-white/40">{children}</p>;
}

function ConfidenceBadge({ value }: { value?: Confidence }) {
  if (!value) return null;
  const styles: Record<Confidence, { bg: string; text: string }> = {
    "Pursue": { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7" },
    "Pursue with Caution": { bg: "rgba(245,158,11,0.15)", text: "#fcd34d" },
    "Needs More Analysis": { bg: "rgba(239,68,68,0.15)", text: "#fca5a5" },
  };
  const s = styles[value] ?? styles["Needs More Analysis"];
  return (
    <span className="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.text }}>
      {value}
    </span>
  );
}

export function SeverityBadge({ value, kind }: { value: Severity; kind: "risk" | "opportunity" }) {
  const palette = kind === "risk"
    ? { High: { bg: "rgba(239,68,68,0.2)", fg: "#fca5a5" }, Medium: { bg: "rgba(245,158,11,0.2)", fg: "#fcd34d" }, Low: { bg: "rgba(148,163,184,0.2)", fg: "#cbd5e1" } }
    : { High: { bg: "rgba(16,185,129,0.2)", fg: "#6ee7b7" }, Medium: { bg: "rgba(56,189,248,0.2)", fg: "#7dd3fc" }, Low: { bg: "rgba(148,163,184,0.2)", fg: "#cbd5e1" } };
  const s = palette[value] ?? palette.Low;
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {value}
    </span>
  );
}

export function Collapsible({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-white/60">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs italic text-white/40">{subtitle}</p>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-white/50" /> : <ChevronRight className="h-4 w-4 text-white/50" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
