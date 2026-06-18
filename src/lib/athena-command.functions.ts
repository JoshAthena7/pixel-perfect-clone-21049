/**
 * Athena Command — platform-level admin dashboard server functions.
 * All endpoints are admin-only (assertAdmin) and read across ALL missions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

// ---------- Platform Status Bar ----------
export type AthenaPlatformStats = {
  activeMissions: number;
  writersActive24h: number;
  questionsInFlight: number;
  irisRuns24h: number;
  briefsGeneratedToday: number;
};

export const getAthenaPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AthenaPlatformStats> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const c = (q: any) => q.then((r: any) => r.count ?? 0).catch(() => 0);

    const [
      activeMissions,
      questionsInFlight,
      irisRuns24h,
      briefsGeneratedToday,
      writersRows,
    ] = await Promise.all([
      c(supabase.from("missions").select("id", { count: "exact", head: true }).eq("status", "active")),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).in("iris_brief_status", ["queued", "generating"])),
      c(supabase.from("daily_intelligence_briefs").select("id", { count: "exact", head: true }).gte("created_at", since)),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("iris_brief_status", "ready").gte("updated_at", since)),
      supabase.from("question_progress").select("assignee_id").gte("updated_at", since),
    ]);

    const distinct = new Set<string>();
    for (const row of writersRows?.data ?? []) {
      if (row?.assignee_id) distinct.add(String(row.assignee_id));
    }

    return {
      activeMissions,
      questionsInFlight,
      irisRuns24h,
      briefsGeneratedToday,
      writersActive24h: distinct.size,
    };
  });

// ---------- Mission Grid ----------
export type AthenaMissionCard = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  submissionDeadline: string | null;
  questionsTotal: number;
  questionsBriefed: number;
  teamTotal: number;
  teamActive24h: number;
  healthy: number;
  watch: number;
  atRisk: number;
  lastWriterActivityAt: string | null;
  needsAttention: number;
};

export const getAthenaMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AthenaMissionCard[]> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data: missions, error } = await supabase
      .from("missions")
      .select("id,name,client_name,agency_name,status,submission_deadline")
      .order("submission_deadline", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);

    const ids = (missions ?? []).map((m: any) => m.id as string);
    if (ids.length === 0) return [];

    // Parallel per-mission aggregates.
    const cards = await Promise.all(
      (missions ?? []).map(async (m: any) => {
        const [questionsRes, teamRes, progressRes] = await Promise.all([
          supabase
            .from("mission_questions")
            .select("iris_brief_status,health_status,is_withdrawn")
            .eq("mission_id", m.id),
          supabase
            .from("mission_team_members")
            .select("member_id")
            .eq("mission_id", m.id),
          supabase
            .from("question_progress")
            .select("assignee_id,updated_at,last_activity_at")
            .eq("mission_id", m.id),
        ]);

        const qs = (questionsRes.data ?? []).filter((q: any) => !q.is_withdrawn);
        const questionsTotal = qs.length;
        const questionsBriefed = qs.filter((q: any) => q.iris_brief_status === "ready").length;
        let healthy = 0, watch = 0, atRisk = 0;
        for (const q of qs) {
          if (q.health_status === "healthy") healthy++;
          else if (q.health_status === "watch") watch++;
          else if (q.health_status === "at_risk") atRisk++;
        }
        const errorBriefs = (questionsRes.data ?? []).filter((q: any) => q.iris_brief_status === "error").length;

        const teamTotal = (teamRes.data ?? []).length;
        const progress = progressRes.data ?? [];
        const activeWriters = new Set<string>();
        let lastActivityAt: string | null = null;
        for (const p of progress) {
          const ts = (p as any).last_activity_at || (p as any).updated_at;
          if (ts && ts >= since && (p as any).assignee_id) activeWriters.add(String((p as any).assignee_id));
          if (ts && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
        }

        return {
          id: m.id,
          name: m.name,
          client: m.client_name ?? m.agency_name ?? null,
          status: m.status,
          submissionDeadline: m.submission_deadline,
          questionsTotal,
          questionsBriefed,
          teamTotal,
          teamActive24h: activeWriters.size,
          healthy,
          watch,
          atRisk,
          lastWriterActivityAt: lastActivityAt,
          needsAttention: atRisk + errorBriefs,
        } as AthenaMissionCard;
      }),
    );

    // Sort: at_risk desc, then submission_deadline asc
    cards.sort((a, b) => {
      if (b.atRisk !== a.atRisk) return b.atRisk - a.atRisk;
      const ad = a.submissionDeadline ? new Date(a.submissionDeadline).getTime() : Infinity;
      const bd = b.submissionDeadline ? new Date(b.submissionDeadline).getTime() : Infinity;
      return ad - bd;
    });
    return cards;
  });

// ---------- Intel Feed ----------
export type AthenaIntelEvent = {
  id: string;
  missionId: string | null;
  missionName: string | null;
  eventType: string;
  title: string;
  summary: string | null;
  createdAt: string;
};

export const getAthenaIntelFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AthenaIntelEvent[]> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data, error } = await supabase
      .from("intel_events")
      .select("id,mission_id,event_type,title,content,extracted_summary,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const missionIds = Array.from(new Set((data ?? []).map((e: any) => e.mission_id).filter(Boolean)));
    let nameById = new Map<string, string>();
    if (missionIds.length > 0) {
      const { data: missions } = await supabase
        .from("missions")
        .select("id,name")
        .in("id", missionIds);
      nameById = new Map((missions ?? []).map((m: any) => [m.id as string, m.name as string]));
    }

    return (data ?? []).map((e: any) => ({
      id: e.id,
      missionId: e.mission_id,
      missionName: e.mission_id ? nameById.get(e.mission_id) ?? null : null,
      eventType: e.event_type ?? "signal",
      title: e.title ?? "",
      summary: e.extracted_summary ?? e.content ?? null,
      createdAt: e.created_at,
    }));
  });

// ---------- Platform Health ----------
export type AthenaCronJob = {
  jobname: string;
  schedule: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
};

export type AthenaPlatformHealth = {
  cronJobs: AthenaCronJob[];
  briefs: { ready: number; queued: number; generating: number; errors: number };
  graph: { nodes: number; edges: number; lastRefreshAt: string | null };
  sources: { uploaded: number; pendingExtraction: number };
  activeMissions: { id: string; name: string }[];
  pendingDocuments: { id: string; mission_id: string }[];
};

export const getAthenaPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AthenaPlatformHealth> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    // Defensive count helper — RLS, missing tables, or transient errors collapse to 0
    // so a single failing query never blanks the entire panel.
    const c = (q: any) => q.then((r: any) => (typeof r?.count === "number" ? r.count : 0)).catch(() => 0);
    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try { return await p; } catch { return fallback; }
    };

    const [
      cronRes,
      ready,
      queued,
      generating,
      errors,
      nodesCount,
      edgesCount,
      latestNodeRes,
      sourcesUploaded,
      activeMissionsRes,
      docsRes,
      extractionsRes,
    ] = await Promise.all([
      safe(supabase.rpc("athena_pipeline_jobs"), { data: [] as any[] }),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("iris_brief_status", "ready")),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("iris_brief_status", "queued")),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("iris_brief_status", "generating")),
      c(supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("iris_brief_status", "error")),
      c(supabase.from("intelligence_graph_nodes").select("id", { count: "exact", head: true }).eq("is_active", true)),
      c(supabase.from("intelligence_graph_edges").select("id", { count: "exact", head: true })),
      safe(supabase.from("intelligence_graph_nodes").select("updated_at").order("updated_at", { ascending: false }).limit(1), { data: [] as any[] }),
      c(supabase.from("mission_documents").select("id", { count: "exact", head: true })),
      safe(supabase.from("missions").select("id,name").eq("status", "active"), { data: [] as any[] }),
      safe(supabase.from("mission_documents").select("id,mission_id"), { data: [] as any[] }),
      safe(supabase.from("document_extractions").select("document_id,status"), { data: [] as any[] }),
    ]);

    const extractedReady = new Set(
      (extractionsRes.data ?? [])
        .filter((e: any) => e.status === "ready")
        .map((e: any) => e.document_id as string),
    );
    const allDocs = docsRes.data ?? [];
    const pendingDocs = allDocs.filter((d: any) => !extractedReady.has(d.id));

    // Fallback: if the SECURITY DEFINER RPC returned nothing, surface the
    // known scheduled job names with their schedules so the panel is never blank.
    const KNOWN_JOBS = [
      { jobname: "atlas-daily-focus-generator", schedule: "daily" },
      { jobname: "atlas-daily-moments", schedule: "daily" },
      { jobname: "atlas-daily-health-recalc", schedule: "0 10 * * *" },
    ];
    const rawJobs = (cronRes.data ?? []) as any[];
    const cronJobs = rawJobs.length > 0
      ? rawJobs.map((j: any) => ({
          jobname: j.jobname,
          schedule: j.schedule,
          active: j.active ?? true,
          lastRunAt: j.last_run_at ?? null,
          lastStatus: j.last_status ?? null,
        }))
      : KNOWN_JOBS.map((j) => ({ ...j, active: true, lastRunAt: null, lastStatus: null }));

    return {
      cronJobs,
      briefs: { ready, queued, generating, errors },
      graph: {
        nodes: nodesCount,
        edges: edgesCount,
        lastRefreshAt: latestNodeRes.data?.[0]?.updated_at ?? null,
      },
      sources: { uploaded: sourcesUploaded, pendingExtraction: pendingDocs.length },
      activeMissions: (activeMissionsRes.data ?? []) as any,
      pendingDocuments: pendingDocs as any,
    };
  });

// ---------- Bulk fix: reset errored briefs ----------
export const resetErroredBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ fixed: number }> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("mission_questions")
      .update({ iris_brief_status: "pending" } as any)
      .eq("iris_brief_status", "error")
      .select("id");
    if (error) throw new Error(error.message);
    return { fixed: (data ?? []).length };
  });
