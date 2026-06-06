import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SubmissionCountdown } from "@/lib/countdowns";

type StripData = {
  missionName: string;
  total: number;
  green: number;
  yellow: number;
  red: number;
  health: "Green" | "Yellow" | "Red";
  nextGateName: string | null;
  nextGateDate: string | null;
  submissionDate: string | null;
};

function classifyHealth(g: number, y: number, r: number): "Green" | "Yellow" | "Red" {
  if (r > 0) return "Red";
  if (y > 0) return "Yellow";
  return "Green";
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  return diff;
}


export function StudioHealthStrip({ missionId }: { missionId: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isSectionWorkspace = path.includes("/sections/") && path.split("/").length > 5;

  const { data: role } = useQuery({
    queryKey: ["studio-strip-role", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("mission_id", missionId)
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.role as string | undefined) ?? null;
    },
  });

  const { data } = useQuery<StripData | null>({
    queryKey: ["studio-health-strip", missionId],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const [missionRes, qRes, gatesRes] = await Promise.all([
        supabase.from("missions").select("name,submission_date").eq("id", missionId).maybeSingle(),
        supabase.from("question_records").select("health").eq("mission_id", missionId),
        supabase.from("mission_review_gates").select("gate_name,target_date").eq("mission_id", missionId).order("target_date", { ascending: true }),
      ]);
      const mission = missionRes.data;
      if (!mission) return null;
      const qs = (qRes.data ?? []) as Array<{ health: string | null }>;
      let g = 0, y = 0, r = 0;
      for (const q of qs) {
        const h = (q.health ?? "yellow").toLowerCase();
        if (h === "green") g++;
        else if (h === "red") r++;
        else y++;
      }
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (gatesRes.data ?? []).find((gate: any) => gate.target_date && gate.target_date >= today);
      return {
        missionName: mission.name,
        total: qs.length,
        green: g,
        yellow: y,
        red: r,
        health: classifyHealth(g, y, r),
        nextGateName: upcoming?.gate_name ?? null,
        nextGateDate: upcoming?.target_date ?? null,
        submissionDate: mission.submission_date,
      };
    },
  });

  // Pulse on health worsening (Green→Yellow, Yellow→Red, Green→Red)
  const prev = useRef<"Green" | "Yellow" | "Red" | null>(null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!data) return;
    const rank = { Green: 0, Yellow: 1, Red: 2 };
    if (prev.current && rank[data.health] > rank[prev.current]) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 3000);
      return () => clearTimeout(t);
    }
    prev.current = data.health;
  }, [data?.health]);

  // Hide for leaders
  if (role === "admin" || role === "lead") return null;
  if (!data) {
    return <div className="h-8 border-b border-border bg-surface" />;
  }

  const dotColor =
    data.health === "Red" ? "var(--red, #ef4444)"
    : data.health === "Yellow" ? "var(--yellow, #eab308)"
    : "var(--green, #22c55e)";

  const gateDays = daysUntil(data.nextGateDate);

  const gateTextColor =
    gateDays !== null && gateDays <= 3 ? "var(--red, #ef4444)"
    : gateDays !== null && gateDays <= 7 ? "var(--yellow, #eab308)"
    : undefined;

  const target = isQuestionWorkspace
    ? { to: "/missions/$missionId/overview" as const, params: { missionId } }
    : { to: "/missions/$missionId/overview" as const, params: { missionId } };

  return (
    <Link
      {...target}
      className="block h-8 border-b border-border bg-surface px-4 flex items-center gap-3 text-[12px] text-muted-foreground hover:bg-surface-hover transition-colors"
      title="Open mission home"
    >
      <span className="relative inline-flex h-2 w-2 shrink-0">
        {pulse && (
          <span
            className="absolute inset-0 animate-ping rounded-full"
            style={{ background: dotColor, opacity: 0.7 }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
        />
      </span>
      <span className="text-foreground font-medium truncate">{data.missionName}</span>
      <Sep />
      <span>{data.total} total</span>
      <Sep />
      <span className="inline-flex items-center gap-3">
        <Dot color="var(--green, #22c55e)" /> <span>{data.green} Green</span>
        <Dot color="var(--yellow, #eab308)" /> <span>{data.yellow} Yellow</span>
        <Dot color="var(--red, #ef4444)" /> <span>{data.red} Red</span>
      </span>
      {data.nextGateName && (
        <>
          <Sep />
          <span style={gateTextColor ? { color: gateTextColor } : undefined}>
            {data.nextGateName}{gateDays !== null ? ` in ${gateDays} day${gateDays === 1 ? "" : "s"}` : ""}
          </span>
        </>
      )}
      {data.submissionDate && (
        <>
          <Sep />
          <SubmissionCountdown date={data.submissionDate} />
        </>
      )}
    </Link>
  );
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 4px ${color}` }}
    />
  );
}
