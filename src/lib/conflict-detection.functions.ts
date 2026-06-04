// H1: Cross-mission conflict-of-interest detection.
//
// A conflict is defined as two or more *active* missions that share the same
// state + procurement_id. Atlas does NOT auto-block. It surfaces the conflict
// for Admin review and requires an explicit acknowledgment (with justification)
// before either mission proceeds. The acknowledgment is written to
// olympus_audit_log so the trail is permanent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: platform admin required");
}

export type ConflictMission = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  procurement_id: string | null;
  status: string | null;
};

export type ConflictPair = {
  mission_a: ConflictMission;
  mission_b: ConflictMission;
  acknowledged: boolean;
};

const ACTIVE_STATUSES = ["Active", "active", "Open", "open", "in_progress"];

// ─── Check on creation ────────────────────────────────────────────────────
export const checkMissionConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        state: z.string().min(1).max(64).nullable().optional(),
        procurementId: z.string().min(1).max(128).nullable().optional(),
        excludeMissionId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.state || !data.procurementId) {
      return { conflicts: [] as ConflictMission[] };
    }
    let q = supabase
      .from("missions")
      .select("id,name,client,state,procurement_id,status")
      .eq("state", data.state)
      .eq("procurement_id", data.procurementId)
      .in("status", ACTIVE_STATUSES);
    if (data.excludeMissionId) q = q.neq("id", data.excludeMissionId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { conflicts: (rows ?? []) as ConflictMission[] };
  });

// ─── List unreviewed conflicts for the Olympus dashboard ──────────────────
export const listUnreviewedConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConflictPair[]> => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("missions")
      .select("id,name,client,state,procurement_id,status")
      .not("procurement_id", "is", null)
      .in("status", ACTIVE_STATUSES);
    const missions = (rows ?? []) as ConflictMission[];

    // Group by (state, procurement_id)
    const groups = new Map<string, ConflictMission[]>();
    for (const m of missions) {
      const k = `${m.state ?? ""}::${m.procurement_id ?? ""}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }

    const pairs: ConflictPair[] = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const [a, b] =
            list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
          pairs.push({ mission_a: a, mission_b: b, acknowledged: false });
        }
      }
    }
    if (pairs.length === 0) return [];

    // Mark which are already acknowledged
    const ids = pairs.flatMap((p) => [p.mission_a.id, p.mission_b.id]);
    const { data: acks } = await supabase
      .from("mission_conflict_ack")
      .select("mission_a_id,mission_b_id")
      .in("mission_a_id", ids)
      .in("mission_b_id", ids);
    const ackSet = new Set(
      (acks ?? []).map((a: any) => `${a.mission_a_id}::${a.mission_b_id}`),
    );
    for (const p of pairs) {
      if (ackSet.has(`${p.mission_a.id}::${p.mission_b.id}`)) p.acknowledged = true;
    }
    return pairs.filter((p) => !p.acknowledged);
  });

// ─── Record acknowledgment ────────────────────────────────────────────────
export const acknowledgeConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionAId: z.string().uuid(),
        missionBId: z.string().uuid(),
        justification: z.string().min(10).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [a, b] =
      data.missionAId < data.missionBId
        ? [data.missionAId, data.missionBId]
        : [data.missionBId, data.missionAId];

    const { error } = await supabase.from("mission_conflict_ack").insert({
      mission_a_id: a,
      mission_b_id: b,
      acknowledged_by: userId,
      justification: data.justification,
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);

    await supabase.from("olympus_audit_log").insert({
      user_id: userId,
      action_type: "mission_conflict_acknowledged",
      action_summary: `Admin acknowledged potential conflict between two active missions (same state + procurement_id).`,
      target_table: "mission_conflict_ack",
      metadata: {
        mission_a_id: a,
        mission_b_id: b,
        justification: data.justification,
      },
    });
    return { ok: true };
  });
