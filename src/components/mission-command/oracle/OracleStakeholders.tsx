import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, EmptyState, SkeletonList, OlympusLink } from "./OracleShared";

type Person = {
  id: string;
  mission_id: string;
  name: string | null;
  title: string | null;
  organization: string | null;
  role_type: string;
  influence_level: string | null;
  relationship_stance: string | null;
  notes: string | null;
  known_priorities: string[] | null;
};

type OracleCtx = {
  client: string | null;
  agency: string | null;
  agencyCode: string | null;
  program: string | null;
};

// Oracle's Stakeholders view shows the canonical role types that count as
// "stakeholders" in the strategic sense — drawn straight from intel_people.
const ORACLE_ROLE_TYPES = ["decision_maker", "evaluator", "stakeholder", "advocate"];

const BASE_TYPES = [
  { id: "all", label: "All" },
  { id: "evaluator", label: "Evaluator" },
  { id: "decision_maker", label: "Decision Maker" },
  { id: "stakeholder", label: "Stakeholder" },
  { id: "advocate", label: "Advocate" },
];

const STANCE_COLOR: Record<string, string> = {
  ally: "#7DCF7D",
  neutral: "rgba(255,255,255,0.5)",
  unknown: "rgba(140,130,230,0.9)",
  hostile: "#E04A4A",
};

export function OracleStakeholders({ missionId, isAdmin, ctx }: { missionId: string; isAdmin: boolean; ctx?: OracleCtx }) {
  const [type, setType] = useState("all");
  const agencyTag = ctx?.agencyCode || ctx?.agency || ctx?.client || null;
  const TYPES = BASE_TYPES.map((t) => {
    if (!agencyTag) return t;
    if (t.id === "all") return { ...t, label: `All ${agencyTag}` };
    if (t.id === "evaluator") return { ...t, label: `${agencyTag} Evaluators` };
    return t;
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-stakeholders", missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("intel_people")
        .select("id,mission_id,name,title,organization,role_type,influence_level,relationship_stance,notes,known_priorities")
        .eq("mission_id", missionId)
        .in("role_type", ORACLE_ROLE_TYPES);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const f = type === "all" ? list : list.filter((s) => s.role_type === type);
    return [...f].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [data, type]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const isActive = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className="rounded-full"
              style={{
                padding: "3px 10px",
                fontSize: 11,
                color: isActive ? "#C49A2B" : "rgba(255,255,255,0.45)",
                background: isActive ? "rgba(196,154,43,0.12)" : "transparent",
                border: `0.5px solid ${isActive ? "rgba(196,154,43,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isAdmin && <OlympusLink>Manage stakeholders in Olympus →</OlympusLink>}

      {isLoading ? (
        <SkeletonList count={2} />
      ) : filtered.length === 0 ? (
        <EmptyState>{agencyTag ? `No stakeholders for ${agencyTag} yet. Add them in Olympus.` : "No stakeholders configured. Add them in Olympus."}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <StakeholderCard key={s.id} profile={s} />
          ))}
        </div>
      )}

      <div className="italic text-center pt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        Stakeholders are the canonical contact set from Intelligence → People. Add or edit in Olympus.
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

function StakeholderCard({ profile }: { profile: Person }) {
  const stance = profile.relationship_stance ?? null;
  const stanceColor = stance ? STANCE_COLOR[stance] ?? "rgba(255,255,255,0.5)" : null;
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full flex items-center justify-center shrink-0"
          style={{
            width: 36,
            height: 36,
            background: "rgba(196,154,43,0.15)",
            color: "#C49A2B",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {initials(profile.name ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-white truncate" style={{ fontSize: 13, fontWeight: 500 }}>
                {profile.name ?? "Unnamed"}
              </div>
              <div className="truncate" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {profile.title ?? ""}
                {profile.organization ? ` · ${profile.organization}` : ""}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className="rounded"
                style={{
                  padding: "1px 6px",
                  fontSize: 9,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                  textTransform: "capitalize",
                }}
              >
                {profile.role_type.replace(/_/g, " ")}
              </span>
              {stance && stanceColor && (
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    background: "rgba(255,255,255,0.04)",
                    color: stanceColor,
                    textTransform: "capitalize",
                  }}
                >
                  {stance}
                </span>
              )}
            </div>
          </div>
          {profile.notes && (
            <div className="mt-2" style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>
              {profile.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
