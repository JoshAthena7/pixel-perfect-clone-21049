import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { supabase } from "@/integrations/supabase/client";

type MomentumPayload = {
  composite: number;
  pace_score: number;
  oracle_score: number;
  activity_score: number;
  risk_score: number;
  finalized: number;
  total_questions: number;
  days_remaining: number;
  days_elapsed: number;
  active_today: number;
  sos_unresolved: number;
  oracle_approved: number;
};

type MomentumResult = {
  data: MomentumPayload;
  delta: number; // composite - yesterday
};

const REFRESH_MS = 30 * 60 * 1000;

function colorForScore(s: number): string {
  if (s >= 80) return "rgba(74,222,128,0.9)";
  if (s >= 60) return "rgba(196,154,43,0.9)";
  if (s >= 40) return "rgba(251,146,60,0.9)";
  return "rgba(248,113,113,0.9)";
}

function useMomentum(missionId: string | undefined) {
  return useQuery<MomentumResult | null>({
    queryKey: ["mission-momentum", missionId],
    enabled: !!missionId,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
    queryFn: async () => {
      if (!missionId) return null;
      const { data: rpcData, error } = await supabase.rpc("calculate_mission_momentum" as any, {
        p_mission_id: missionId,
      });
      if (error) throw error;
      const payload = rpcData as MomentumPayload;

      // Upsert today's snapshot (best-effort)
      try {
        await (supabase.from as any)("mission_momentum_daily").upsert(
          {
            mission_id: missionId,
            score_date: new Date().toISOString().slice(0, 10),
            composite_score: payload.composite,
            pace_score: payload.pace_score,
            oracle_score: payload.oracle_score,
            activity_score: payload.activity_score,
            risk_score: payload.risk_score,
          },
          { onConflict: "mission_id,score_date" },
        );
      } catch {
        /* no-op */
      }

      // Yesterday's score
      let delta = 0;
      try {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().slice(0, 10);
        const { data: prior } = await (supabase.from as any)("mission_momentum_daily")
          .select("composite_score")
          .eq("mission_id", missionId)
          .eq("score_date", yStr)
          .maybeSingle();
        if (prior && typeof prior.composite_score === "number") {
          delta = payload.composite - prior.composite_score;
        }
      } catch {
        /* no-op */
      }

      return { data: payload, delta };
    },
  });
}

function DirectionIndicator({ delta }: { delta: number }) {
  if (Math.abs(delta) <= 1) {
    return (
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>· {delta >= 0 ? "+" : ""}{delta}</span>
    );
  }
  const positive = delta > 0;
  const color = positive ? "rgba(74,222,128,0.95)" : "rgba(248,113,113,0.95)";
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      <span style={{ fontWeight: 800 }}>{positive ? "↑" : "↓"}</span>
      {positive ? "+" : ""}{delta}
    </span>
  );
}

function SubScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 24px", gap: 8, alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: "rgba(196,154,43,0.9)" }} />
      </div>
      <span style={{ color: "rgba(255,255,255,0.85)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function MomentumTooltipContent({ result }: { result: MomentumResult }) {
  const { data, delta } = result;
  return (
    <div
      style={{
        width: 300,
        padding: 12,
        background: "#0a0f1a",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        color: "white",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
        zIndex: 9999,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
        Mission Momentum · <span style={{ color: colorForScore(data.composite) }}>{data.composite}</span>{" "}
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>
          ({delta >= 0 ? "↑+" : "↓"}{delta} since yesterday)
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SubScoreBar label="Finalization Pace" value={data.pace_score} />
        <SubScoreBar label="ORACLE Coverage" value={data.oracle_score} />
        <SubScoreBar label="Team Activity" value={data.activity_score} />
        <SubScoreBar label="Risk Health" value={data.risk_score} />
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          fontSize: 10,
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {data.days_remaining}d remaining · {data.finalized} of {data.total_questions} finalized · {data.active_today} active today
      </div>
    </div>
  );
}

export function MomentumScorePill({ missionId }: { missionId: string }) {
  const { data: result, isLoading } = useMomentum(missionId);

  if (isLoading || !result) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: "4px 12px",
          fontSize: 11,
          color: "rgba(255,255,255,0.45)",
        }}
      >
        ⚡ MOMENTUM <span style={{ opacity: 0.5 }}>—</span>
      </div>
    );
  }

  const color = colorForScore(result.data.composite);

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.05)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: "4px 12px",
              cursor: "default",
            }}
          >
            <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.55)" }}>⚡ MOMENTUM</span>
            <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {result.data.composite}
            </span>
            <DirectionIndicator delta={result.delta} />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" align="end" sideOffset={6}>
            <MomentumTooltipContent result={result} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function MomentumScoreCompact({ missionId }: { missionId: string }) {
  const { data: result, isLoading } = useMomentum(missionId);

  if (isLoading || !result) {
    return (
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
        Mission Momentum: <span style={{ opacity: 0.6 }}>loading…</span>
      </div>
    );
  }

  const color = colorForScore(result.data.composite);

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div style={{ fontSize: 11, marginTop: 8, cursor: "default", color: "rgba(255,255,255,0.65)" }}>
            Mission Momentum:{" "}
            <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{result.data.composite}</span>{" "}
            <DirectionIndicator delta={result.delta} />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="top" align="start" sideOffset={6}>
            <MomentumTooltipContent result={result} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
