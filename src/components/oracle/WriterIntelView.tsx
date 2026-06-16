import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { summarizeCompetitor } from "@/lib/competitor-intel.functions";

// ---------- Type → visual treatment ------------------------------------------------
type Treatment = {
  color: string;
  bg: string;
  bucket: 0 | 1 | 2 | 3; // 0 = priority risk, 1 = requirement, 2 = opportunity, 3 = rest
  typeLabel: string;
  tag: string;
};

const STEEL = "#9aa6b2";

function treat(nodeType: string | null | undefined, confidence: string | null | undefined): Treatment {
  const t = (nodeType ?? "").toLowerCase();
  if (t === "requirement" || t === "evaluation_criterion") {
    return { color: "#C49A2B", bg: "rgba(196,154,43,0.08)", bucket: 1, typeLabel: "Evaluator Priority", tag: "From the RFP" };
  }
  if (t === "risk" || t === "threat") {
    const high = (confidence ?? "").toLowerCase() === "high";
    return { color: "#E0644A", bg: "rgba(224,100,74,0.08)", bucket: high ? 0 : 3, typeLabel: "Watch Signal", tag: "Risk" };
  }
  if (t === "competitor" || t === "competitive") {
    return { color: "#EF9F27", bg: "rgba(239,159,39,0.08)", bucket: 3, typeLabel: "Competitive Signal", tag: "Competitor Intel" };
  }
  if (t === "stakeholder") {
    return { color: "#B79CE1", bg: "rgba(183,156,225,0.08)", bucket: 3, typeLabel: "Stakeholder Signal", tag: "Key Person" };
  }
  if (t === "opportunity" || t === "differentiator") {
    return { color: "#7DCF7D", bg: "rgba(125,207,125,0.08)", bucket: 2, typeLabel: "Your Advantage", tag: "Opportunity" };
  }
  if (t === "regulatory" || t === "compliance") {
    return { color: "#B79CE1", bg: "rgba(183,156,225,0.08)", bucket: 3, typeLabel: "Regulatory Signal", tag: "Regulatory" };
  }
  return { color: STEEL, bg: "rgba(154,166,178,0.06)", bucket: 3, typeLabel: "Intelligence Signal", tag: "IRIS Read" };
}

function confRank(c: string | null | undefined): number {
  const v = (c ?? "").toLowerCase();
  if (v === "high") return 2;
  if (v === "medium" || v === "med") return 1;
  return 0;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function firstNumeric(metadata: any): { value: string; label?: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  for (const [k, v] of Object.entries(metadata)) {
    if (typeof v === "number" && Number.isFinite(v)) return { value: String(v), label: k.replace(/_/g, " ") };
    if (typeof v === "string" && /^-?\d+(\.\d+)?%?$/.test(v)) return { value: v, label: k.replace(/_/g, " ") };
  }
  return null;
}

// ---------- Data hooks --------------------------------------------------------------

type Node = {
  id: string;
  node_type: string | null;
  label: string | null;
  description: string | null;
  metadata: any;
  source: string | null;
  confidence_level: string | null;
  updated_at: string | null;
};

function useNodes(missionId: string) {
  return useQuery({
    queryKey: ["writer-intel-nodes", missionId],
    queryFn: async (): Promise<Node[]> => {
      const { data } = await supabase
        .from("intelligence_graph_nodes")
        .select("id,node_type,label,description,metadata,source,confidence_level,updated_at")
        .eq("mission_id", missionId)
        .eq("is_active", true);
      return (data ?? []) as Node[];
    },
    staleTime: 60_000,
  });
}

function useEngagement(missionId: string) {
  return useQuery({
    queryKey: ["writer-intel-engagement", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("oracle_engagement_config")
        .select("competitors,top_risks,discriminators,mission_profile")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
}

// ---------- Helpers for engagement_config shapes ------------------------------------

function asText(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.text ?? v.value ?? v.label ?? v.name ?? "";
  return String(v);
}

type CompetitorRow = { name: string; intel: string; raw: any };

function normalizeCompetitors(raw: any): CompetitorRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => {
      if (typeof c === "string") return { name: c, intel: "", raw: c };
      if (c && typeof c === "object") {
        return {
          name: c.name ?? c.label ?? c.competitor ?? "Unknown",
          intel: c.intel ?? c.notes ?? c.summary ?? "",
          raw: c,
        };
      }
      return { name: String(c), intel: "", raw: c };
    })
    .filter((c) => c.name && c.name !== "Unknown");
}

// ---------- Component ---------------------------------------------------------------

export function WriterIntelView({ missionId }: { missionId: string }) {
  const { data: nodes, isLoading } = useNodes(missionId);
  const { data: eng } = useEngagement(missionId);

  const sorted = useMemo(() => {
    const list = (nodes ?? []).slice();
    list.sort((a, b) => {
      const ta = treat(a.node_type, a.confidence_level);
      const tb = treat(b.node_type, b.confidence_level);
      if (ta.bucket !== tb.bucket) return ta.bucket - tb.bucket;
      return confRank(b.confidence_level) - confRank(a.confidence_level);
    });
    return list;
  }, [nodes]);

  const lastUpdated = useMemo(() => {
    const ts = (nodes ?? [])
      .map((n) => (n.updated_at ? new Date(n.updated_at).getTime() : 0))
      .reduce((max, t) => (t > max ? t : max), 0);
    return ts ? new Date(ts).toISOString() : null;
  }, [nodes]);

  const featured = sorted[0];
  const featuredEligible = featured && treat(featured.node_type, featured.confidence_level).bucket <= 1;
  const rest = featuredEligible ? sorted.slice(1) : sorted;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-white" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>
          ⚡ What IRIS Is Watching
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 }}>
          Curated intelligence for your mission. Updated as the environment changes.
        </p>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>
          Last updated {relTime(lastUpdated)}
        </p>
      </header>

      {/* Signals strip */}
      <SignalsStrip eng={eng} />

      {/* Cards */}
      {isLoading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="space-y-4">
          {featuredEligible && featured ? <FeaturedCard node={featured} /> : null}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rest.map((n) => (
              <IntelCard key={n.id} node={n} />
            ))}
          </div>
        </section>
      )}

      {/* Competitor landscape */}
      <CompetitorLandscape missionId={missionId} competitors={normalizeCompetitors(eng?.competitors)} />
    </div>
  );
}

// ---------- Signals strip -----------------------------------------------------------

function SignalsStrip({ eng }: { eng: any }) {
  const competitors = normalizeCompetitors(eng?.competitors);
  const incumbentLabel = competitors[0]
    ? `${competitors[0].name}${competitors[0].intel ? ` · ${competitors[0].intel.slice(0, 28)}` : ""}`
    : "Monitoring";

  const topRisk = asText(Array.isArray(eng?.top_risks) ? eng.top_risks[0] : null).slice(0, 60);
  const strongest = asText(Array.isArray(eng?.discriminators) ? eng.discriminators[0] : null).slice(0, 60);

  const items: { label: string; value: string; color: string }[] = [
    { label: "Incumbent Position", value: incumbentLabel, color: "#EF9F27" },
    { label: "State's Primary Fear", value: topRisk || "Intelligence building…", color: "#E0644A" },
    { label: "Strongest Card", value: strongest || "Intelligence building…", color: "#7DCF7D" },
  ];

  return (
    <div
      className="flex gap-2 overflow-x-auto md:grid md:grid-cols-3 md:gap-3"
      style={{ scrollbarWidth: "thin" }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="shrink-0 md:shrink rounded-md px-3 py-2.5"
          style={{
            minWidth: 220,
            background: "rgba(255,255,255,0.025)",
            border: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
            {it.label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: it.color, marginTop: 4 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Cards -------------------------------------------------------------------

function IntelCard({ node }: { node: Node }) {
  const t = treat(node.node_type, node.confidence_level);
  const [expanded, setExpanded] = useState(false);
  const body = node.description ?? "";
  const truncated = body.length > 180 && !expanded;
  const display = truncated ? body.slice(0, 180).trimEnd() + "…" : body;
  const sourceLabel = node.source && node.source.trim() && !/^https?:/i.test(node.source) ? node.source : "IRIS Analysis";

  return (
    <article
      className="relative rounded-md flex flex-col"
      style={{
        background: t.bg,
        border: "0.5px solid rgba(255,255,255,0.05)",
        borderTop: `3px solid ${t.color}`,
      }}
    >
      <div className="flex-1" style={{ padding: "14px 16px 12px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: t.color, fontWeight: 600 }}>
          {t.typeLabel}
        </div>
        <h3 className="text-white" style={{ fontSize: 14, fontWeight: 600, marginTop: 6, lineHeight: 1.3 }}>
          {node.label ?? "Untitled signal"}
        </h3>
        {body ? (
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 8, lineHeight: 1.5 }}>
            {display}{" "}
            {body.length > 180 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{ color: t.color, fontSize: 11, marginLeft: 4 }}
                className="hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <footer
        className="flex items-center justify-between"
        style={{
          padding: "8px 16px",
          borderTop: "0.5px solid rgba(255,255,255,0.04)",
          fontSize: 10,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.4)" }}>{sourceLabel}</span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: t.bg,
            color: t.color,
            border: `0.5px solid ${t.color}33`,
          }}
        >
          {t.tag}
        </span>
      </footer>
    </article>
  );
}

function FeaturedCard({ node }: { node: Node }) {
  const t = treat(node.node_type, node.confidence_level);
  const num = firstNumeric(node.metadata);
  return (
    <article
      className="rounded-md grid grid-cols-1 md:grid-cols-[1fr_280px] overflow-hidden"
      style={{
        background: t.bg,
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderTop: `3px solid ${t.color}`,
      }}
    >
      <div style={{ padding: "18px 22px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: t.color, fontWeight: 600 }}>
          Featured · {t.typeLabel}
        </div>
        <h2 className="text-white" style={{ fontSize: 18, fontWeight: 600, marginTop: 8, lineHeight: 1.25 }}>
          {node.label ?? "Untitled signal"}
        </h2>
        {node.description ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 10, lineHeight: 1.55 }}>
            {node.description}
          </p>
        ) : null}
        <div className="mt-3">
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 10,
              background: t.bg,
              color: t.color,
              border: `0.5px solid ${t.color}33`,
            }}
          >
            {t.tag}
          </span>
        </div>
      </div>
      <div
        className="hidden md:flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${t.color}10, ${t.color}02)`,
          borderLeft: "0.5px solid rgba(255,255,255,0.04)",
        }}
      >
        {num ? (
          <div className="text-center px-4">
            <div style={{ fontSize: 44, fontWeight: 700, color: t.color, lineHeight: 1 }}>{num.value}</div>
            {num.label ? (
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                {num.label}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: `1px solid ${t.color}40`,
              background: `radial-gradient(circle, ${t.color}20, transparent 70%)`,
            }}
          />
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-md flex flex-col items-center justify-center text-center"
      style={{
        padding: "48px 24px",
        background: "rgba(255,255,255,0.02)",
        border: "0.5px dashed rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="animate-pulse"
        style={{ width: 12, height: 12, borderRadius: "50%", background: "#C49A2B", boxShadow: "0 0 16px #C49A2B66" }}
      />
      <p className="text-white" style={{ fontSize: 14, fontWeight: 500, marginTop: 16 }}>
        IRIS is still building intelligence for this mission.
      </p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
        Check back after document processing completes.
      </p>
    </div>
  );
}

// ---------- Competitor landscape ----------------------------------------------------

function CompetitorLandscape({ missionId, competitors }: { missionId: string; competitors: CompetitorRow[] }) {
  const summarize = useServerFn(summarizeCompetitor);
  const [aiCache, setAiCache] = useState<Record<string, { text: string; loading: boolean; error: boolean }>>({});

  const ensure = useCallback(
    async (name: string) => {
      if (aiCache[name]) return;
      setAiCache((c) => ({ ...c, [name]: { text: "Intel loading…", loading: true, error: false } }));
      try {
        const res = await summarize({ data: { missionId, competitorName: name } });
        setAiCache((c) => ({
          ...c,
          [name]: { text: res.summary, loading: false, error: !res.ok },
        }));
      } catch {
        setAiCache((c) => ({ ...c, [name]: { text: "Intel loading…", loading: false, error: true } }));
      }
    },
    [aiCache, missionId, summarize],
  );

  // Kick off AI fetches for competitors without intel — once per session
  useMemo(() => {
    competitors.forEach((c) => {
      if (!c.intel && !aiCache[c.name]) void ensure(c.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitors]);

  return (
    <section>
      <header className="mb-3">
        <h2 className="text-white" style={{ fontSize: 14, fontWeight: 500 }}>
          Competitive Landscape
        </h2>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          IRIS read · verify with your Engagement Lead
        </p>
      </header>

      {competitors.length === 0 ? (
        <div
          className="rounded-md"
          style={{
            padding: "16px 18px",
            background: "rgba(255,255,255,0.02)",
            border: "0.5px dashed rgba(255,255,255,0.08)",
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          No competitors identified yet. Add them in Strategy Setup.
        </div>
      ) : (
        <ul className="space-y-2">
          {competitors.map((c, i) => {
            const threatLevel = i === 0 ? "High" : i === 1 ? "Med" : "Low";
            const threatColor = threatLevel === "High" ? "#E0644A" : threatLevel === "Med" ? "#EF9F27" : "#7DCF7D";
            const threatPct = threatLevel === "High" ? 85 : threatLevel === "Med" ? 55 : 30;
            const summary = c.intel || aiCache[c.name]?.text || "Intel loading…";
            const isError = !c.intel && aiCache[c.name]?.error;
            return (
              <li
                key={`${c.name}-${i}`}
                className="rounded-md grid grid-cols-1 md:grid-cols-[180px_1fr_140px] items-center gap-3"
                style={{
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="text-white" style={{ fontSize: 13, fontWeight: 500 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.45 }}>
                  {summary}
                  {isError ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAiCache((c2) => {
                          const next = { ...c2 };
                          delete next[c.name];
                          return next;
                        });
                        void ensure(c.name);
                      }}
                      style={{ color: "#C49A2B", fontSize: 11, marginLeft: 8 }}
                      className="hover:underline"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: threatColor, fontWeight: 600, minWidth: 28 }}>{threatLevel}</span>
                  <div
                    className="relative"
                    style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}
                  >
                    <div
                      style={{
                        width: `${threatPct}%`,
                        height: "100%",
                        background: threatColor,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
