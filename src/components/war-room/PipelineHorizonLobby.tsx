/**
 * PipelineHorizonLobby
 *
 * Lobby-level market awareness. Shows curated, IRIS-interpreted intelligence.
 * NOT a news feed — every item shows WHY it matters to Athena.
 *
 * PLACEMENT: Lobby only (/select-engagement)
 * NOT IN: Mission pages, Command Center, admin pages
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, RefreshCw } from "lucide-react";

type HorizonItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  source_url: string | null;
  horizon_category: string;
  iris_type: string | null;
  iris_headline: string | null;
  iris_action: string | null;
  strategic_relevance: number | null;
  urgency_score: number | null;
  affected_states: string[] | null;
  affected_programs: string[] | null;
  published_at: string | null;
  ingested_at: string;
};

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  "Federal Signal":      { color: "#60a5fa", bg: "rgba(96,165,250,0.06)",  border: "rgba(96,165,250,0.2)",  icon: "🏛️" },
  "Market Signal":       { color: "#a78bfa", bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.2)", icon: "📊" },
  "Procurement Signal":  { color: "#C49A2A", bg: "rgba(196,154,42,0.06)",  border: "rgba(196,154,42,0.2)",  icon: "📋" },
  "State Signal":        { color: "#34d399", bg: "rgba(52,211,153,0.06)",   border: "rgba(52,211,153,0.2)",  icon: "📍" },
  "Athena Signal":       { color: "#C49A2A", bg: "rgba(196,154,42,0.08)",   border: "rgba(196,154,42,0.3)",  icon: "⚡" },
};

const IRIS_TYPE_COLOR: Record<string, string> = {
  alert:          "#ef4444",
  recommendation: "#f59e0b",
  insight:        "#C49A2A",
  signal:         "#60a5fa",
};

function relTime(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  limit?: number;
  showHeader?: boolean;
}

export function PipelineHorizonLobby({ limit = 6, showHeader = true }: Props) {
  const [items, setItems] = useState<HorizonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_horizon")
      .select("id,title,summary,source,source_url,horizon_category,iris_type,iris_headline,iris_action,strategic_relevance,urgency_score,affected_states,affected_programs,published_at,ingested_at")
      .eq("status", "active")
      .eq("is_mission_specific", false) // Lobby shows general, not mission-specific
      .order("urgency_score", { ascending: false })
      .order("ingested_at", { ascending: false })
      .limit(limit * 3); // fetch more for filtering
    setItems((data ?? []) as HorizonItem[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const categories = ["all", ...Array.from(new Set(items.map(i => i.horizon_category)))];
  const filtered = activeFilter === "all" ? items : items.filter(i => i.horizon_category === activeFilter);
  const displayed = filtered.slice(0, limit);

  if (!loading && items.length === 0) return null; // No horizon items — hide section silently

  return (
    <div style={{ marginTop: 0 }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 0 0 2px" }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              Pipeline Horizon
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginLeft: 8 }}>
              Market awareness · IRIS interpreted
            </span>
          </div>
          <button onClick={load} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 4 }}>
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        </div>
      )}

      {/* Category filter */}
      {categories.length > 2 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveFilter(cat)} style={{
              fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              border: `0.5px solid ${activeFilter === cat ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
              background: activeFilter === cat ? "rgba(255,255,255,0.06)" : "transparent",
              color: activeFilter === cat ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {cat === "all" ? "All" : cat.replace(" Signal", "")}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 52, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)" }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {displayed.map(item => {
            const cfg = CATEGORY_CONFIG[item.horizon_category] ?? CATEGORY_CONFIG["Federal Signal"];
            const irisColor = item.iris_type ? IRIS_TYPE_COLOR[item.iris_type] : cfg.color;

            return (
              <div key={item.id} style={{
                borderRadius: 8,
                border: `0.5px solid ${cfg.border}`,
                background: cfg.bg,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, lineHeight: 1 }}>{cfg.icon}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                    color: cfg.color,
                  }}>
                    {item.horizon_category}
                  </span>
                  {item.iris_type && (
                    <>
                      <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>·</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: irisColor,
                      }}>
                        IRIS {item.iris_type}
                      </span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                    {relTime(item.ingested_at)}
                  </span>
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}>
                      <ExternalLink style={{ width: 10, height: 10 }} />
                    </a>
                  )}
                </div>

                {/* IRIS interpretation — not the raw title */}
                {item.iris_headline ? (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                    {item.iris_headline}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.5 }}>
                    {item.title}
                  </p>
                )}

                {/* Recommended action */}
                {item.iris_action && (
                  <p style={{ fontSize: 11, color: irisColor, margin: 0, opacity: 0.85, fontStyle: "italic" }}>
                    → {item.iris_action}
                  </p>
                )}

                {/* Context tags */}
                {((item.affected_states ?? []).length > 0 || (item.affected_programs ?? []).length > 0) && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(item.affected_states ?? []).slice(0,3).map(s => (
                      <span key={s} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>{s}</span>
                    ))}
                    {(item.affected_programs ?? []).slice(0,2).map(p => (
                      <span key={p} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length > limit && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "center", margin: "4px 0 0" }}>
              +{filtered.length - limit} more items
            </p>
          )}
        </div>
      )}
    </div>
  );
}
