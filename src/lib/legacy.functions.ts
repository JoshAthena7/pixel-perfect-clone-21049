// Cross-engagement Legacy Record for the current writer.
// Aggregates wins, awarded $, states, people served, contributions, streak.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LegacyRecord = {
  wins: number;
  awardedUsd: number;
  states: number;
  peopleServed: number;
  contributions: number;
  missionsTouched: number;
  streakDays: number;
};

export const getMyLegacyRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LegacyRecord> => {
    const { userId } = context as { userId: string };

    // Resolve writer identity from auth_user alias
    const { data: alias } = await supabaseAdmin
      .from("writer_identity_aliases" as never)
      .select("writer_id")
      .eq("alias_kind", "auth_user")
      .eq("alias_value", userId)
      .maybeSingle();

    const writerId = (alias as { writer_id?: string } | null)?.writer_id;
    if (!writerId) {
      return { wins: 0, awardedUsd: 0, states: 0, peopleServed: 0, contributions: 0, missionsTouched: 0, streakDays: 0 };
    }

    // Pull all contributions for this writer
    const { data: contribs } = await supabaseAdmin
      .from("contributions" as never)
      .select("mission_id, occurred_at")
      .eq("writer_id", writerId);

    const rows = (contribs ?? []) as Array<{ mission_id: string | null; occurred_at: string }>;
    const missionIds = Array.from(new Set(rows.map((r) => r.mission_id).filter((x): x is string => !!x)));

    // Streak: consecutive days (UTC) up to today with at least one contribution
    const dayKeys = new Set(rows.map((r) => r.occurred_at.slice(0, 10)));
    let streak = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      if (dayKeys.has(key)) {
        streak += 1;
        d.setUTCDate(d.getUTCDate() - 1);
      } else {
        // allow today to have no entry yet — only break the streak from yesterday onward
        if (streak === 0 && key === new Date().toISOString().slice(0, 10)) {
          d.setUTCDate(d.getUTCDate() - 1);
          continue;
        }
        break;
      }
    }

    let wins = 0, awardedUsd = 0, peopleServed = 0, states = 0;
    if (missionIds.length > 0) {
      const [outcomesRes, missionsRes] = await Promise.all([
        supabaseAdmin
          .from("mission_outcomes" as never)
          .select("mission_id, outcome, awarded_value_usd, population_impacted")
          .in("mission_id", missionIds),
        supabaseAdmin
          .from("missions" as never)
          .select("id, state")
          .in("id", missionIds),
      ]);
      const outcomes = (outcomesRes.data ?? []) as Array<{
        mission_id: string; outcome: string; awarded_value_usd: number | null; population_impacted: number | null;
      }>;
      const wonMissions = new Set<string>();
      for (const o of outcomes) {
        if (o.outcome === "won") {
          wins += 1;
          awardedUsd += Number(o.awarded_value_usd ?? 0);
          peopleServed += Number(o.population_impacted ?? 0);
          wonMissions.add(o.mission_id);
        }
      }
      const missionsData = (missionsRes.data ?? []) as Array<{ id: string; state: string | null }>;
      const stateSet = new Set(
        missionsData
          .filter((m) => wonMissions.has(m.id) && m.state)
          .map((m) => m.state as string),
      );
      states = stateSet.size;
    }

    return {
      wins,
      awardedUsd,
      states,
      peopleServed,
      contributions: rows.length,
      missionsTouched: missionIds.length,
      streakDays: streak,
    };
  });
