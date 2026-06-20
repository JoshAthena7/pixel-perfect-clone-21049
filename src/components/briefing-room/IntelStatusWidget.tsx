import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAccess";
import { MomentumScoreCompact } from "@/components/momentum/MomentumScore";
import { OracleMissingCompactWarning } from "@/components/mission-command/oracle/checklist/OracleMissingCompactWarning";

const GOLD = "#D4AF37";
const COVERAGE_TARGET = 15;

type Counts = { approved: number; pushed: number; needs_review: number; dismissed: number };

export function IntelStatusWidget({ missionId }: { missionId: string }) {
  const { isAdmin } = useIsAdmin();
  const { data } = useQuery({
    queryKey: ["intel-status-widget", missionId],
    queryFn: async (): Promise<Counts> => {
      const statuses = ["approved", "pushed", "needs_review", "dismissed"] as const;
      const out: Counts = { approved: 0, pushed: 0, needs_review: 0, dismissed: 0 };
      await Promise.all(
        statuses.map(async (s) => {
          const { count } = await supabase
            .from("oracle_signals")
            .select("id", { head: true, count: "exact" })
            .eq("mission_id", missionId)
            .eq("status", s);
          out[s] = count ?? 0;
        }),
      );
      return out;
    },
    staleTime: 30_000,
  });

  const counts = data ?? { approved: 0, pushed: 0, needs_review: 0, dismissed: 0 };
  const active = counts.approved + counts.pushed;
  const ready = active >= COVERAGE_TARGET;

  if (!isAdmin) return null;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div
        className="mb-3"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: GOLD,
          fontWeight: 700,
        }}
      >
        Intel Status
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Pill label="Approved" value={counts.approved} color="#4ade80" />
        <Pill label="Pushed" value={counts.pushed} color="#60a5fa" />
        <Pill label="Needs Review" value={counts.needs_review} color={GOLD} />
        <Pill label="Dismissed" value={counts.dismissed} color="rgba(255,255,255,0.35)" />
      </div>

      <MomentumScoreCompact missionId={missionId} />



      {ready ? (
        <div
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full w-full justify-center"
          style={{
            background: "rgba(74,222,128,0.12)",
            border: "1px solid rgba(74,222,128,0.4)",
            color: "#4ade80",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={14} />
          ORACLE Active
        </div>
      ) : (
        // Coverage <15: surface a single contextual link to the ORACLE page.
        // No Setup Wizard link — ORACLE is the canonical intel surface.
        <Link
          to="/missions/$missionId/olympus"
          params={{ missionId }}
          className="inline-flex items-center gap-1 hover:underline"
          style={{ fontSize: 11, fontWeight: 600, color: GOLD }}
        >
          Feed ORACLE <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-md px-2.5 py-2 flex items-center justify-between"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}
