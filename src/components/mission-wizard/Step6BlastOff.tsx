import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildIntelligenceGraph } from "@/lib/oracle.functions";
import { seedTerritoryIntelligence } from "@/lib/iris-territory.functions";
import { InputSourceBadge, IrisInfoCard, StepMetaIndicator, type InputSource } from "@/components/InputSourceBadge";

const ITEM_SOURCE: Partial<Record<CheckKey, InputSource>> = {
  basics: "you",
  rfp: "you",
  sections: "iris",
  strategy: "iris-with-fallback",
  journey: "iris",
  questions: "you",
  lead: "you",
  deadline: "you",
  territory: "you",
  monitoring: "iris",
  client_intel: "you",
  prior_rfp: "you",
  competitors: "iris-with-fallback",
  internal_materials: "you",
};


type CheckKey =
  | "basics"
  | "rfp"
  | "sections"
  | "strategy"
  | "journey"
  | "questions"
  | "lead"
  | "deadline"
  | "territory"
  | "monitoring"
  | "client_intel"
  | "prior_rfp"
  | "competitors"
  | "internal_materials";

type CheckItem = {
  key: CheckKey;
  label: string;
  pass: boolean;
  fixStep: number;
  fixView?: "team" | "questions";
  required: boolean;
  recommendedMsg?: string;
};


async function runChecks(missionId: string): Promise<{ items: CheckItem[]; counts: { sources: number; feeds: number; competitors: number } }> {
  const [mission, docs, sections, strat, phases, questions, assignments, team, feeds, intelDocs, evo, comps] =
    await Promise.all([
      supabase
        .from("missions")
        .select("name, client_name, submission_deadline, state, program_type")
        .eq("id", missionId)
        .single(),
      supabase
        .from("mission_documents")
        .select("id")
        .eq("mission_id", missionId)
        .eq("document_type", "primary_rfp")
        .limit(1),
      supabase
        .from("mission_sections")
        .select("id, reviewed_by_admin")
        .eq("mission_id", missionId),
      supabase
        .from("mission_win_strategy")
        .select("admin_confirmed_at")
        .eq("mission_id", missionId)
        .maybeSingle(),
      supabase
        .from("mission_journey_phases")
        .select("id, kind")
        .eq("mission_id", missionId),
      supabase
        .from("mission_questions")
        .select("id")
        .eq("mission_id", missionId),
      supabase
        .from("mission_assignments")
        .select("question_id, assigned_writer_id")
        .eq("mission_id", missionId),
      supabase
        .from("mission_team_members")
        .select("mission_role")
        .eq("mission_id", missionId),
      supabase
        .from("intelligence_feed_configs")
        .select("id, is_active")
        .eq("mission_id", missionId)
        .eq("is_active", true),
      supabase
        .from("mission_documents")
        .select("id, metadata")
        .eq("mission_id", missionId),
      supabase
        .from("procurement_evolution_records")
        .select("analysis_completed_at")
        .eq("mission_id", missionId)
        .maybeSingle(),
      supabase
        .from("competitor_profiles")
        .select("id")
        .eq("mission_id", missionId),
    ]);

  const m = mission.data;
  const sectionRows = sections.data ?? [];
  const qs = questions.data ?? [];
  const assignedSet = new Set(
    (assignments.data ?? [])
      .filter((a) => !!a.assigned_writer_id)
      .map((a) => a.question_id),
  );
  const intelDocRows = (intelDocs.data ?? []) as Array<{ id: string; metadata: any }>;
  const clientCount = intelDocRows.filter((d) => d.metadata?.intelligence_tier === "client").length;
  const internalCount = intelDocRows.filter((d) => d.metadata?.intelligence_tier === "internal").length;
  const feedCount = (feeds.data ?? []).length;
  const competitorCount = (comps.data ?? []).length;
  const totalSources = intelDocRows.length;

  const items: CheckItem[] = [
    { key: "basics", label: "Mission basics complete", pass: !!(m?.name && m?.client_name && m?.submission_deadline), fixStep: 1, required: true },
    { key: "rfp", label: "RFP uploaded and processed", pass: (docs.data?.length ?? 0) > 0, fixStep: 2, required: true },
    { key: "sections", label: "All sections reviewed", pass: sectionRows.length > 0 && sectionRows.every((s) => s.reviewed_by_admin), fixStep: 4, required: true },
    { key: "strategy", label: "Win Strategy confirmed", pass: !!strat.data?.admin_confirmed_at, fixStep: 5, required: true },
    { key: "journey", label: "Journey configured", pass: (phases.data ?? []).some((p) => p.kind === "pens_down"), fixStep: 6, required: true },
    { key: "questions", label: "All questions assigned", pass: qs.length === 0 || qs.every((q) => assignedSet.has(q.id)), fixStep: 7, fixView: "questions", required: true },
    { key: "lead", label: "Engagement Lead assigned", pass: (team.data ?? []).some((t) => t.mission_role === "engagement_lead"), fixStep: 7, fixView: "team", required: true },
    { key: "deadline", label: "Submission deadline confirmed", pass: !!m?.submission_deadline, fixStep: 1, required: true },
    { key: "territory", label: "Territory configured", pass: !!(m?.state && m?.program_type), fixStep: 8, required: true },
    { key: "monitoring", label: "Monitoring feeds activated", pass: feedCount >= 2, fixStep: 10, required: true },
    { key: "client_intel", label: "Client intelligence loaded", pass: clientCount > 0, fixStep: 9, required: false, recommendedMsg: "Recommended — IRIS will be less effective without this. You can add it after launch." },
    { key: "prior_rfp", label: "Prior RFP analyzed", pass: !!evo.data?.analysis_completed_at, fixStep: 9, required: false, recommendedMsg: "Recommended — IRIS will be less effective without this. You can add it after launch." },
    { key: "competitors", label: "Competitors identified", pass: competitorCount > 0, fixStep: 11, required: false, recommendedMsg: "Recommended — IRIS will be less effective without this. You can add it after launch." },
    { key: "internal_materials", label: "Internal materials loaded", pass: internalCount > 0, fixStep: 9, required: false, recommendedMsg: "Recommended — IRIS will be less effective without this. You can add it after launch." },
  ];

  return { items, counts: { sources: totalSources, feeds: feedCount, competitors: competitorCount } };
}


type WriteStep = { name: string; status: "pending" | "ok" | "fail"; error?: string };

export function Step6BlastOff({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const buildGraph = useServerFn(buildIntelligenceGraph);
  const seedTerritory = useServerFn(seedTerritoryIntelligence);

  const { data: checks, isLoading, refetch } = useQuery({
    queryKey: ["launch-checks", missionId],
    queryFn: () => runChecks(missionId),
  });

  const [visibleCount, setVisibleCount] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "countdown" | "writing" | "burst" | "done" | "error"
  >("idle");
  const [countdown, setCountdown] = useState(3);
  const [writes, setWrites] = useState<WriteStep[]>([]);

  const items = checks?.items;
  const counts = checks?.counts;

  // Stagger reveal of checklist items
  useEffect(() => {
    if (!items) return;
    setVisibleCount(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= items.length) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [items]);

  const blockingFail = !!items && items.some((c) => c.required && !c.pass);
  const allGreen = !!items && !blockingFail;


  const goFix = (item: CheckItem) => {
    navigate({
      to: "/olympus/missions/$missionId/wizard",
      params: { missionId },
      search: { step: item.fixStep, ...(item.fixView ? { view: item.fixView } : {}) },
    });
  };

  const runBlastOff = async () => {
    setPhase("countdown");
    setCountdown(3);
    // schedule countdown ticks
    const tick = (n: number) =>
      new Promise<void>((resolve) => {
        setCountdown(n);
        setTimeout(resolve, 1000);
      });
    await tick(3);
    await tick(2);
    await tick(1);

    setPhase("writing");
    const result = await performWrites(missionId, setWrites);
    if (result.success) {
      setPhase("burst");
      // fire-and-forget graph build + territory seed
      seedTerritory({ data: { missionId } }).catch((e) => console.error("[BLAST OFF] seedTerritoryIntelligence failed:", e));
      buildGraph({ data: { missionId } }).catch((e) => console.error("[BLAST OFF] buildIntelligenceGraph failed:", e));
      await new Promise((r) => setTimeout(r, 900));

      setPhase("done");
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId },
        search: { launched: 1 },
      });
    } else {
      setPhase("error");
    }
  };

  const retry = async () => {
    setPhase("writing");
    const result = await performWrites(missionId, setWrites, true);
    if (result.success) {
      setPhase("burst");
      seedTerritory({ data: { missionId } }).catch((e) => console.error("[BLAST OFF] seedTerritoryIntelligence failed:", e));
      buildGraph({ data: { missionId } }).catch((e) => console.error("[BLAST OFF] buildIntelligenceGraph failed:", e));
      await new Promise((r) => setTimeout(r, 900));

      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId },
        search: { launched: 1 },
      });
    } else {
      setPhase("error");
    }
  };

  if (isLoading || !items) {
    return (
      <div className="-mx-6 -my-8 min-h-[80vh] bg-[var(--athena-navy)] text-white p-12">
        <h1 className="text-4xl font-semibold">Mission Launch Checklist.</h1>
        <p className="text-white/70 mb-8">IRIS is running pre-flight checks...</p>
        <div className="space-y-3 max-w-2xl">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full bg-white/10" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-8 min-h-[80vh] bg-[var(--athena-navy)] text-white p-6 md:p-12 relative overflow-hidden">
      <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-semibold">Mission Launch Checklist.</h1>
        <p className="text-white/70 mt-2">IRIS is verifying everything before launch.</p>
        <div className="mt-3">
          <StepMetaIndicator irisCount={4} youCount={4} />
        </div>
      </header>


      <ul className={cn("space-y-2 max-w-2xl transition-opacity", allGreen && "opacity-80")}>
        {items.map((c, i) => {
          if (i >= visibleCount) return null;
          const warn = !c.pass && !c.required;
          return (
            <li
              key={c.key}
              className="flex items-center gap-3 bg-white/5 rounded px-4 py-3 border border-white/10 animate-[slide-in-right_0.3s_ease-out]"
            >
              {c.pass ? (
                <Check className="h-5 w-5 text-green-400 shrink-0" />
              ) : warn ? (
                <span className="h-5 w-5 shrink-0 rounded-full bg-yellow-400/20 text-yellow-300 flex items-center justify-center text-xs font-bold">!</span>
              ) : (
                <X className="h-5 w-5 text-red-400 shrink-0" />
              )}
              <div className="flex-1">
                <span>{c.label}</span>
                {warn && c.recommendedMsg && (
                  <p className="text-[11px] text-yellow-200/70 mt-0.5">{c.recommendedMsg}</p>
                )}
              </div>
              {ITEM_SOURCE[c.key] && (
                <InputSourceBadge source={ITEM_SOURCE[c.key]!} />
              )}
              {!c.pass && (
                <button
                  className="text-xs text-[var(--athena-gold)] hover:underline shrink-0"
                  onClick={() => goFix(c)}
                >
                  Fix this →
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {allGreen && visibleCount >= items.length && (
        <div className="mt-10 max-w-2xl">
          <blockquote
            className="italic text-white/90 pl-4 py-1 border-l-2"
            style={{ borderColor: "var(--athena-gold)" }}
          >
            Everything checks out. I have {counts?.sources ?? 0} intelligence sources loaded, {counts?.feeds ?? 0} monitoring feeds active, and profiles on {counts?.competitors ?? 0} competitors. Once you BLAST OFF I will start building your Mission Intelligence Graph. This mission is ready.
          </blockquote>



          <div className="mt-8 flex justify-center">
            <button
              onClick={runBlastOff}
              disabled={phase !== "idle"}
              className="relative font-bold text-xl rounded-lg flex items-center justify-center gap-3 bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] transition-colors disabled:opacity-60"
              style={{
                minWidth: 240,
                height: 64,
                boxShadow: "0 0 0 0 var(--athena-gold-glow)",
                animation: "blast-pulse 2s ease-in-out infinite",
              }}
            >
              BLAST OFF <Rocket className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <button onClick={() => refetch()} className="text-xs text-white/60 hover:text-white">
          Re-run checks
        </button>
      </div>

      {phase === "countdown" && (
        <Overlay>
          <div
            key={countdown}
            className="text-[12rem] font-bold text-[var(--athena-gold)] animate-[scale-in_0.4s_ease-out]"
          >
            {countdown}
          </div>
        </Overlay>
      )}

      {phase === "writing" && (
        <Overlay>
          <div className="text-2xl text-white/90">Launching…</div>
        </Overlay>
      )}

      {phase === "burst" && (
        <Overlay>
          <ParticleBurst />
        </Overlay>
      )}

      {phase === "error" && (
        <Overlay>
          <div className="bg-card text-foreground rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold">Something went wrong during launch.</h2>
            <p className="text-sm text-muted-foreground">
              Here is what completed and what failed.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {writes.map((w) => (
                <li key={w.name} className="flex items-center gap-2">
                  {w.status === "ok" ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : w.status === "fail" ? (
                    <X className="h-4 w-4 text-red-600" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                  )}
                  <span>{w.name}</span>
                  {w.error && <span className="text-xs text-red-600">— {w.error}</span>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPhase("idle")}>
                Close
              </Button>
              <Button onClick={retry}>Retry Failed Operations</Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-[var(--athena-navy)] flex items-center justify-center">
      {children}
    </div>
  );
}

function ParticleBurst() {
  const particles = Array.from({ length: 28 });
  return (
    <div className="relative h-2 w-2">
      {particles.map((_, i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 200 + Math.random() * 200;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        return (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-full bg-[var(--athena-gold)]"
            style={
              {
                left: 0,
                top: 0,
                animation: `particle-fly 0.8s ease-out forwards`,
                ["--dx" as never]: `${dx}px`,
                ["--dy" as never]: `${dy}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

// ---------- Writes ----------
async function performWrites(
  missionId: string,
  setWrites: (fn: WriteStep[] | ((p: WriteStep[]) => WriteStep[])) => void,
  retryOnly = false,
): Promise<{ success: boolean }> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id ?? null;
  const userEmail = u.user?.email ?? null;

  // load context we need for messages
  const [mission, team, assignments, qs] = await Promise.all([
    supabase.from("missions").select("name").eq("id", missionId).single(),
    supabase.from("mission_team_members").select("member_id").eq("mission_id", missionId),
    supabase
      .from("mission_assignments")
      .select("assigned_writer_id, question_id")
      .eq("mission_id", missionId),
    supabase.from("mission_questions").select("id, question_number").eq("mission_id", missionId),
  ]);
  const missionName = mission.data?.name ?? "Mission";
  const qNumByQ: Record<string, string> = Object.fromEntries(
    (qs.data ?? []).map((q) => [q.id, q.question_number ?? ""]),
  );

  const initial: WriteStep[] = [
    { name: "Activate mission", status: "pending" },
    { name: "Notify team members", status: "pending" },
    { name: "Notify assigned writers", status: "pending" },
    { name: "Record audit log entry", status: "pending" },
  ];
  setWrites((prev) =>
    retryOnly && prev.length === initial.length
      ? prev.map((p) => (p.status === "fail" ? { ...p, status: "pending", error: undefined } : p))
      : initial,
  );

  const updateStep = (idx: number, patch: Partial<WriteStep>) =>
    setWrites((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  let success = true;
  let currentWrites: WriteStep[] = [];
  setWrites((prev) => {
    currentWrites = prev;
    return prev;
  });

  // 1. activate mission
  if (!retryOnly || currentWrites[0]?.status !== "ok") {
    const { error } = await supabase
      .from("missions")
      .update({
        status: "active",
        blast_off_at: new Date().toISOString(),
        blast_off_by: userId,
        intelligence_loadout_step: 5,
      })
      .eq("id", missionId);

    if (error) {
      updateStep(0, { status: "fail", error: error.message });
      success = false;
    } else {
      updateStep(0, { status: "ok" });
    }
  }

  // 2. team notifications
  if (!retryOnly || currentWrites[1]?.status !== "ok") {
    const rows = (team.data ?? []).map((t) => ({
      recipient_role: "specific_user",
      recipient_id: t.member_id,
      type: "mission_launched",
      message: `Mission ${missionName} is live. Your assignments are waiting. Check your Flight Deck.`,
      metadata: { mission_id: missionId },
    }));
    if (rows.length === 0) {
      updateStep(1, { status: "ok" });
    } else {
      const { error } = await supabase.from("atlas_notifications").insert(rows);
      if (error) {
        updateStep(1, { status: "fail", error: error.message });
        success = false;
      } else {
        updateStep(1, { status: "ok" });
      }
    }
  }

  // 3. writer acceptance notifications
  if (!retryOnly || currentWrites[2]?.status !== "ok") {
    const rows = (assignments.data ?? [])
      .filter((a) => !!a.assigned_writer_id)
      .map((a) => ({
        recipient_role: "specific_user",
        recipient_id: a.assigned_writer_id as string,
        type: "assignment_acceptance_required",
        message: `You have been assigned ${qNumByQ[a.question_id] ?? "a question"} on mission ${missionName}. Accept or flag your availability.`,
        metadata: { mission_id: missionId, question_id: a.question_id },
      }));
    if (rows.length === 0) {
      updateStep(2, { status: "ok" });
    } else {
      const { error } = await supabase.from("atlas_notifications").insert(rows);
      if (error) {
        updateStep(2, { status: "fail", error: error.message });
        success = false;
      } else {
        updateStep(2, { status: "ok" });
      }
    }
  }

  // 4. audit log
  if (!retryOnly || currentWrites[3]?.status !== "ok") {
    const { error } = await supabase.from("mission_audit_log").insert({
      mission_id: missionId,
      action: "Mission launched via BLAST OFF",
      performed_by: userId,
      performed_by_name: userEmail,
      metadata: { blast_off_at: new Date().toISOString() },
    });
    if (error) {
      updateStep(3, { status: "fail", error: error.message });
      success = false;
    } else {
      updateStep(3, { status: "ok" });
    }
  }

  return { success };
}
