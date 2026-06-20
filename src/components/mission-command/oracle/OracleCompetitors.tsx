import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, EmptyState, SkeletonList, OlympusLink } from "./OracleShared";
import type { Database } from "@/integrations/supabase/types";

type Competitor = Database["public"]["Tables"]["competitor_profiles"]["Row"];

type OracleCtx = {
  client: string | null;
  agency: string | null;
  agencyCode: string | null;
  program: string | null;
};

export function OracleCompetitors({ missionId, isAdmin, ctx }: { missionId: string; isAdmin: boolean; ctx?: OracleCtx }) {
  const contextTag = ctx?.program
    ? `${ctx.agencyCode || ctx.agency || ctx.client || ""} ${ctx.program}`.trim()
    : ctx?.agencyCode || ctx?.agency || ctx?.client || null;
  const emptyMsg = contextTag
    ? `No competitor profiles for ${contextTag} yet. Add them in Olympus.`
    : "No competitor profiles added yet. Add them in Olympus.";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-competitors", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_profiles")
        .select("*")
        .eq("mission_id", missionId);
      if (error) throw error;
      return (data ?? []) as Competitor[];
    },
    staleTime: 60_000,
  });

  const sorted = useMemo(() => {
    const list = data ?? [];
    return [...list].sort((a, b) => {
      const ai = (a.competitor_type ?? "").toLowerCase() === "incumbent" ? 0 : 1;
      const bi = (b.competitor_type ?? "").toLowerCase() === "incumbent" ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [data]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  return (
    <div className="space-y-3">
      {isAdmin && <OlympusLink>Manage competitors in Olympus →</OlympusLink>}
      {isLoading ? (
        <SkeletonList count={2} />
      ) : sorted.length === 0 ? (
        <EmptyState>{emptyMsg}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((c) => (
            <CompetitorCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <div className="italic text-center pt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        Competitor profiles configured in Olympus. IRIS enriches from public sources.
      </div>
    </div>
  );
}

function CompetitorCard({ c }: { c: Competitor }) {
  const isIncumbent = (c.competitor_type ?? "").toLowerCase() === "incumbent";
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-white truncate" style={{ fontSize: 13, fontWeight: 500 }}>
          {c.organization_name}
        </div>
        {isIncumbent ? (
          <span
            className="rounded shrink-0"
            style={{
              padding: "1px 8px",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.05em",
              background: "rgba(224,74,74,0.15)",
              color: "#f08080",
              border: "0.5px solid rgba(224,74,74,0.3)",
            }}
          >
            INCUMBENT
          </span>
        ) : (
          <span
            className="rounded shrink-0"
            style={{
              padding: "1px 8px",
              fontSize: 9,
              fontWeight: 600,
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            COMPETITOR
          </span>
        )}
      </div>

      <div className="grid gap-2 mt-3 sm:grid-cols-2">
        <Field label="Likely Narrative" tone="neutral">
          {c.likely_narrative}
        </Field>
        <Field label="Known Weaknesses" tone="red">
          {c.known_weaknesses}
        </Field>
        <Field label="Our Counter" tone="gold">
          {c.differentiation_strategy}
        </Field>
        <Field label="Win Probability Impact" tone="amber">
          {c.iris_confidence ? `IRIS confidence: ${c.iris_confidence}` : null}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, tone, children }: { label: string; tone: "neutral" | "red" | "gold" | "amber"; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    neutral: "rgba(255,255,255,0.65)",
    red: "#f08080",
    gold: "#C49A2B",
    amber: "#EF9F27",
  };
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: "", letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
        {label}
      </div>
      <div className="mt-1" style={{ fontSize: 11, lineHeight: 1.5, color: colors[tone] }}>
        {children || <span className="italic" style={{ color: "rgba(255,255,255,0.35)" }}>Not yet profiled.</span>}
      </div>
    </div>
  );
}
