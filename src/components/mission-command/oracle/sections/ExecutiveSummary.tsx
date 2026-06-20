import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GOLD, coveragePercent, coverageSentence } from "./coverage";

const STORAGE_KEY_PREFIX = "atlas_intel_last_visit:";

export function ExecutiveSummary({
  missionId,
  approvedCount,
  signals,
}: {
  missionId: string;
  approvedCount: number;
  signals: any[];
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: northStar } = useQuery({
    queryKey: ["mission-north-star", missionId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("mission_north_star")
        .select("content, status")
        .eq("mission_id", missionId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.content ?? null;
    },
    staleTime: 60_000,
  });

  // Top signal: highest relevance approved/pushed
  const topSignal = useMemo(() => {
    const approved = signals.filter((s) =>
      ["approved", "pushed"].includes(s.status)
    );
    approved.sort(
      (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
    );
    return approved[0] ?? null;
  }, [signals]);

  // Since last visit
  const [sinceLastVisit, setSinceLastVisit] = useState<number>(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = STORAGE_KEY_PREFIX + missionId;
    const prev = window.localStorage.getItem(key);
    const prevTime = prev ? new Date(prev).getTime() : 0;
    if (prevTime > 0) {
      const count = signals.filter(
        (s) => new Date(s.created_at).getTime() > prevTime
      ).length;
      setSinceLastVisit(count);
    }
    window.localStorage.setItem(key, new Date().toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const pct = coveragePercent(approvedCount);
  const sentence = coverageSentence(approvedCount);

  return (
    <section id="section-summary">
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(196,154,43,0.06), rgba(196,154,43,0.02))",
          border: "1px solid rgba(196,154,43,0.15)",
          borderRadius: 6,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* North Star (40%) */}
          <div className="lg:col-span-4">
            <Label>NORTH STAR</Label>
            {northStar ? (
              <>
                <div
                  style={{
                    color: "white",
                    fontSize: 13,
                    fontFamily: "Georgia, serif",
                    fontStyle: "italic",
                    lineHeight: 1.6,
                    marginTop: 6,
                    display: "-webkit-box",
                    WebkitLineClamp: expanded ? "unset" : 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {northStar}
                </div>
                {northStar.length > 220 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1"
                    style={{
                      fontSize: 10,
                      color: GOLD,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {expanded ? "Show less" : "Read more"}
                  </button>
                )}
              </>
            ) : (
              <div
                className="italic mt-1"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}
              >
                North star not yet defined — complete Mission Setup.
              </div>
            )}
          </div>

          {/* Top signal (30%) */}
          <div className="lg:col-span-3 relative">
            <Label>TOP SIGNAL</Label>
            {topSignal ? (
              <>
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: GOLD,
                    background: "rgba(196,154,43,0.15)",
                    border: "0.5px solid rgba(196,154,43,0.4)",
                  }}
                >
                  {topSignal.relevance_score ?? 0}
                </span>
                <div
                  className="mt-1"
                  style={{
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                    paddingRight: 36,
                  }}
                >
                  {truncate(topSignal.title, 60)}
                </div>
                {topSignal.why_it_matters && (
                  <div
                    className="mt-1"
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {topSignal.why_it_matters}
                  </div>
                )}
              </>
            ) : (
              <div
                className="mt-1"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
              >
                No signals yet. Process RFP to surface key signals.
              </div>
            )}
          </div>

          {/* Coverage (30%) */}
          <div className="lg:col-span-3">
            <Label>INTELLIGENCE COVERAGE</Label>
            <div
              style={{ fontSize: 28, color: "white", fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}
            >
              {pct}%
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.5)",
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              {sentence}
            </div>
            {sinceLastVisit > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: "#22c55e",
                  marginTop: 6,
                }}
              >
                ↑ {sinceLastVisit} new {sinceLastVisit === 1 ? "item" : "items"} since your last visit
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 8,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: GOLD,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function truncate(s: string | null | undefined, n: number): string {
  const v = s ?? "";
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
}
