import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, EmptyState, SkeletonList, OlympusLink } from "./OracleShared";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["stakeholder_profiles"]["Row"];

const TYPES = [
  { id: "all", label: "All" },
  { id: "evaluator", label: "Evaluator" },
  { id: "influencer", label: "Influencer" },
  { id: "advocacy", label: "Advocacy" },
  { id: "legislative", label: "Legislative" },
  { id: "federal", label: "Federal" },
];

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, inferred: 1, low: 0 };
const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  high: { label: "High confidence", color: "#7DCF7D" },
  medium: { label: "Medium confidence", color: "#EF9F27" },
  inferred: { label: "Inferred", color: "rgba(140,130,230,0.9)" },
  low: { label: "Low", color: "rgba(255,255,255,0.4)" },
};

export function OracleStakeholders({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const [type, setType] = useState("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-stakeholders", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stakeholder_profiles")
        .select("*")
        .eq("mission_id", missionId);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const f = type === "all" ? list : list.filter((s) => (s.stakeholder_type ?? "").toLowerCase() === type);
    return [...f].sort((a, b) => {
      const ar = CONFIDENCE_RANK[(a.iris_confidence ?? "").toLowerCase()] ?? 0;
      const br = CONFIDENCE_RANK[(b.iris_confidence ?? "").toLowerCase()] ?? 0;
      if (br !== ar) return br - ar;
      return (a.stakeholder_type ?? "").localeCompare(b.stakeholder_type ?? "");
    });
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
        <EmptyState>No stakeholder profiles configured. Add them in Olympus.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <StakeholderCard key={s.id} profile={s} />
          ))}
        </div>
      )}

      <div className="italic text-center pt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        Stakeholder profiles built by IRIS from public record. Configured and enriched in Olympus.
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

function StakeholderCard({ profile }: { profile: Profile }) {
  const conf = CONFIDENCE_LABEL[(profile.iris_confidence ?? "").toLowerCase()];
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
                {profile.name}
              </div>
              <div className="truncate" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {profile.title ?? ""}
                {profile.organization ? ` · ${profile.organization}` : ""}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {profile.stakeholder_type && (
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {profile.stakeholder_type}
                </span>
              )}
              {conf && (
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    background: "rgba(255,255,255,0.04)",
                    color: conf.color,
                  }}
                >
                  {conf.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 mt-3">
        <SubCard label="Public Priorities" tone="green">
          {profile.public_priorities || <span className="italic">Not yet profiled.</span>}
        </SubCard>
        <SubCard label="Known Concerns" tone="amber">
          {profile.known_concerns || <span className="italic">Not yet profiled.</span>}
        </SubCard>
      </div>
    </div>
  );
}

function SubCard({ label, tone, children }: { label: string; tone: "green" | "amber"; children: React.ReactNode }) {
  const palette =
    tone === "green"
      ? { bg: "rgba(125,207,125,0.05)", border: "rgba(125,207,125,0.18)", fg: "#7DCF7D" }
      : { bg: "rgba(239,159,39,0.05)", border: "rgba(239,159,39,0.2)", fg: "#EF9F27" };
  return (
    <div className="rounded-md p-2" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: palette.fg, fontWeight: 600 }}>
        {label}
      </div>
      <div className="mt-1" style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.65)" }}>
        {children}
      </div>
    </div>
  );
}
