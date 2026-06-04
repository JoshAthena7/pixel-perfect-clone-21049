// The Atrium — cross-engagement common space data.
// Latest win, recent activity, live writers, viewer's own profile card.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AtriumContributor = {
  writerId: string;
  displayName: string;
  contributionCount: number;
};

export type AtriumWin = {
  missionId: string;
  missionName: string;
  client: string | null;
  state: string | null;
  awardedUsd: number;
  peopleServed: number;
  wonAt: string | null;
  contributors: AtriumContributor[];
};

export type AtriumActivity = {
  id: string;
  writerId: string;
  displayName: string;
  eventType: string;
  missionId: string | null;
  missionName: string | null;
  occurredAt: string;
};

export type AtriumLiveWriter = {
  writerId: string;
  displayName: string;
  lastSeen: string;
};

export type AtriumViewerCard = {
  displayName: string;
  wins: number;
  awardedUsd: number;
  states: number;
  peopleServed: number;
  streakDays: number;
};

export type AtriumPayload = {
  latestWin: AtriumWin | null;
  activity: AtriumActivity[];
  liveWriters: AtriumLiveWriter[];
  viewer: AtriumViewerCard | null;
  totals: { wins: number; awardedUsd: number; peopleServed: number; states: number };
};

async function nameMap(writerIds: string[]): Promise<Map<string, string>> {
  if (writerIds.length === 0) return new Map();
  const { data: aliases } = await supabaseAdmin
    .from("writer_identity_aliases" as never)
    .select("writer_id, alias_kind, alias_value")
    .in("writer_id", writerIds);
  const rows = (aliases ?? []) as Array<{ writer_id: string; alias_kind: string; alias_value: string }>;
  const byWriter: Record<string, { auth?: string; email?: string; name?: string }> = {};
  for (const r of rows) {
    byWriter[r.writer_id] ??= {};
    if (r.alias_kind === "auth_user") byWriter[r.writer_id].auth = r.alias_value;
    else if (r.alias_kind === "email") byWriter[r.writer_id].email = r.alias_value;
    else if (r.alias_kind === "display_name") byWriter[r.writer_id].name = r.alias_value;
  }
  const authIds = Object.values(byWriter).map((v) => v.auth).filter((x): x is string => !!x);
  let profileNames: Record<string, string> = {};
  if (authIds.length) {
    const { data: profs } = await supabaseAdmin
      .from("profiles" as never)
      .select("id, display_name, email")
      .in("id", authIds);
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
      const nm = p.display_name?.trim() || p.email?.split("@")[0] || null;
      if (nm) profileNames[p.id] = nm;
    }
  }
  const out = new Map<string, string>();
  for (const [wid, v] of Object.entries(byWriter)) {
    const nm = (v.auth && profileNames[v.auth]) || v.name || v.email?.split("@")[0] || "Writer";
    out.set(wid, nm);
  }
  return out;
}

export const getAtrium = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtriumPayload> => {
    const { userId } = context as { userId: string };

    // Latest win
    const { data: outcomes } = await supabaseAdmin
      .from("mission_outcomes" as never)
      .select("mission_id, outcome, awarded_value_usd, population_impacted, decided_at, created_at")
      .eq("outcome", "won")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const wonRows = (outcomes ?? []) as Array<{
      mission_id: string; awarded_value_usd: number | null; population_impacted: number | null;
      decided_at: string | null; created_at: string;
    }>;

    let latestWin: AtriumWin | null = null;
    let totals = { wins: wonRows.length, awardedUsd: 0, peopleServed: 0, states: 0 };
    const stateSet = new Set<string>();

    if (wonRows.length > 0) {
      const missionIds = wonRows.map((r) => r.mission_id);
      const { data: missions } = await supabaseAdmin
        .from("missions" as never)
        .select("id, name, client, state")
        .in("id", missionIds);
      const mMap = new Map(
        ((missions ?? []) as Array<{ id: string; name: string; client: string | null; state: string | null }>)
          .map((m) => [m.id, m]),
      );
      for (const r of wonRows) {
        totals.awardedUsd += Number(r.awarded_value_usd ?? 0);
        totals.peopleServed += Number(r.population_impacted ?? 0);
        const m = mMap.get(r.mission_id);
        if (m?.state) stateSet.add(m.state);
      }
      totals.states = stateSet.size;

      const top = wonRows[0];
      const topMission = mMap.get(top.mission_id);
      const { data: contribs } = await supabaseAdmin
        .from("contributions" as never)
        .select("writer_id")
        .eq("mission_id", top.mission_id);
      const counts = new Map<string, number>();
      for (const c of (contribs ?? []) as Array<{ writer_id: string }>) {
        counts.set(c.writer_id, (counts.get(c.writer_id) ?? 0) + 1);
      }
      const writerIds = Array.from(counts.keys());
      const nm = await nameMap(writerIds);
      const contributors = writerIds
        .map((wid) => ({
          writerId: wid,
          displayName: nm.get(wid) ?? "Writer",
          contributionCount: counts.get(wid) ?? 0,
        }))
        .sort((a, b) => b.contributionCount - a.contributionCount);

      latestWin = {
        missionId: top.mission_id,
        missionName: topMission?.name ?? "Mission",
        client: topMission?.client ?? null,
        state: topMission?.state ?? null,
        awardedUsd: Number(top.awarded_value_usd ?? 0),
        peopleServed: Number(top.population_impacted ?? 0),
        wonAt: top.decided_at ?? top.created_at,
        contributors,
      };
    }

    // Activity feed — last 40 contributions across firm
    const { data: feedRows } = await supabaseAdmin
      .from("contributions" as never)
      .select("id, writer_id, event_type, mission_id, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(40);
    const feed = (feedRows ?? []) as Array<{
      id: string; writer_id: string; event_type: string; mission_id: string | null; occurred_at: string;
    }>;
    const feedWriterIds = Array.from(new Set(feed.map((r) => r.writer_id)));
    const feedMissionIds = Array.from(new Set(feed.map((r) => r.mission_id).filter((x): x is string => !!x)));
    const [feedNames, feedMissions] = await Promise.all([
      nameMap(feedWriterIds),
      feedMissionIds.length
        ? supabaseAdmin.from("missions" as never).select("id, name").in("id", feedMissionIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const fmMap = new Map(
      ((feedMissions.data ?? []) as Array<{ id: string; name: string }>).map((m) => [m.id, m.name]),
    );
    const activity: AtriumActivity[] = feed.map((r) => ({
      id: r.id,
      writerId: r.writer_id,
      displayName: feedNames.get(r.writer_id) ?? "Writer",
      eventType: r.event_type,
      missionId: r.mission_id,
      missionName: r.mission_id ? fmMap.get(r.mission_id) ?? null : null,
      occurredAt: r.occurred_at,
    }));

    // Live writers — distinct writers active in last 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const liveMap = new Map<string, string>();
    for (const r of feed) {
      if (r.occurred_at >= cutoff && !liveMap.has(r.writer_id)) {
        liveMap.set(r.writer_id, r.occurred_at);
      }
    }
    const liveWriters: AtriumLiveWriter[] = Array.from(liveMap.entries()).map(([writerId, lastSeen]) => ({
      writerId,
      displayName: feedNames.get(writerId) ?? "Writer",
      lastSeen,
    }));

    // Viewer card
    const { data: alias } = await supabaseAdmin
      .from("writer_identity_aliases" as never)
      .select("writer_id")
      .eq("alias_kind", "auth_user")
      .eq("alias_value", userId)
      .maybeSingle();
    const myWriterId = (alias as { writer_id?: string } | null)?.writer_id;
    let viewer: AtriumViewerCard | null = null;
    if (myWriterId) {
      const { data: myContribs } = await supabaseAdmin
        .from("contributions" as never)
        .select("mission_id, occurred_at")
        .eq("writer_id", myWriterId);
      const mine = (myContribs ?? []) as Array<{ mission_id: string | null; occurred_at: string }>;
      const myMissionIds = Array.from(new Set(mine.map((r) => r.mission_id).filter((x): x is string => !!x)));
      const dayKeys = new Set(mine.map((r) => r.occurred_at.slice(0, 10)));
      let streak = 0;
      const d = new Date();
      const todayKey = new Date().toISOString().slice(0, 10);
      if (!dayKeys.has(todayKey)) d.setUTCDate(d.getUTCDate() - 1);
      while (dayKeys.has(d.toISOString().slice(0, 10))) {
        streak += 1;
        d.setUTCDate(d.getUTCDate() - 1);
      }
      let wins = 0, awardedUsd = 0, peopleServed = 0, statesC = 0;
      if (myMissionIds.length > 0) {
        const [oRes, mRes] = await Promise.all([
          supabaseAdmin.from("mission_outcomes" as never)
            .select("mission_id, outcome, awarded_value_usd, population_impacted").in("mission_id", myMissionIds),
          supabaseAdmin.from("missions" as never).select("id, state").in("id", myMissionIds),
        ]);
        const oRows = (oRes.data ?? []) as Array<{
          mission_id: string; outcome: string; awarded_value_usd: number | null; population_impacted: number | null;
        }>;
        const wonSet = new Set<string>();
        for (const o of oRows) {
          if (o.outcome === "won") {
            wins += 1;
            awardedUsd += Number(o.awarded_value_usd ?? 0);
            peopleServed += Number(o.population_impacted ?? 0);
            wonSet.add(o.mission_id);
          }
        }
        const myStates = new Set(
          ((mRes.data ?? []) as Array<{ id: string; state: string | null }>)
            .filter((m) => wonSet.has(m.id) && m.state)
            .map((m) => m.state as string),
        );
        statesC = myStates.size;
      }
      const myName = (await nameMap([myWriterId])).get(myWriterId) ?? "You";
      viewer = { displayName: myName, wins, awardedUsd, states: statesC, peopleServed, streakDays: streak };
    }

    return { latestWin, activity, liveWriters, viewer, totals };
  });
