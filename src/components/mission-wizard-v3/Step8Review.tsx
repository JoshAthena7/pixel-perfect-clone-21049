/**
 * Step 8 — Review & Launch. Read-only summary across all confirmed fields,
 * then launch the mission (sets status='active').
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Edit2, Loader2, Rocket, AlertCircle, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { triggerLaunchBrief } from "@/lib/iris-launch-brief.functions";
import { enrichMissionWithPerplexity } from "@/lib/iris/perplexity-enrich.functions";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import {
  extractRequirementNodesFromRFP,
  seedTerritoryIntelligence,
} from "@/lib/iris-territory.functions";
// generateIrisBrief is now invoked inside runIrisRfpExtraction.
import { loadStaged, clearStaged } from "@/lib/oracle/wizard-stage";
import { WizardStepHeading } from "./WizardShellV3";
import { LaunchSequence } from "./LaunchSequence";

/** Coerce any thrown value (Error, Supabase PostgrestError, plain object) into a readable string. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (typeof o.details === "string" && o.details) return o.details;
    if (typeof o.hint === "string" && o.hint) return o.hint;
    try { return JSON.stringify(e); } catch { /* ignore */ }
  }
  return String(e);
}

const STEP_FIELD_GROUPS: Record<number, { title: string; keys: string[] }> = {
  2: {
    title: "Mission Basics",
    keys: [
      "client_agency",
      "opportunity_title",
      "solicitation_number",
      "state_location",
      "program_type",
      "mission_type",
      "prime_or_sub",
      "contract_value",
      "period_of_performance",
      "rfp_release_date",
      "proposal_due_date",
      "page_limit",
      "submission_method",
    ],
  },
  3: { title: "Strategic Foundations", keys: ["north_star", "why_we_win", "why_we_could_lose", "biggest_concerns"] },
  4: {
    title: "Competitive & Win Strategy",
    keys: ["known_competitors", "state_priorities", "win_themes", "things_to_reinforce", "things_to_avoid"],
  },
  5: { title: "Stakeholder Intelligence", keys: ["stakeholder_member_family", "stakeholder_provider", "stakeholder_evaluator"] },
};

export function Step8Review({
  missionId,
  onBack,
  onJump,
}: {
  missionId: string;
  onBack: () => void;
  onJump: (s: number) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const triggerLaunchBriefFn = useServerFn(triggerLaunchBrief);
  const enrichMissionWithPerplexityFn = useServerFn(enrichMissionWithPerplexity);
  const extractRequirementNodesFn = useServerFn(extractRequirementNodesFromRFP);
  const seedTerritoryFn = useServerFn(seedTerritoryIntelligence);
  // generateIrisBrief is now invoked inside runIrisRfpExtraction.
  const [launching, setLaunching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLaunch, setShowLaunch] = useState(false);

  const { data: extractions } = useQuery({
    queryKey: ["wizard-review-extractions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_field, extracted_value, user_override_value, confirmed_by_user, wizard_step")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  type CheckResult = { ok: boolean; pass: string; fail: string; step: number; error?: boolean };
  const { data: checklist, isLoading: checklistLoading } = useQuery({
    queryKey: ["wizard-prelaunch-checklist", missionId],
    queryFn: async (): Promise<CheckResult[]> => {
      const safe = async (fn: () => Promise<CheckResult>, step: number, label: string): Promise<CheckResult> => {
        try { return await fn(); }
        catch (e) {
          console.error(`[prelaunch-check] ${label} failed`, e);
          return { ok: false, pass: label, fail: "Unable to verify — check manually", step, error: true };
        }
      };

      const [
        mission,
        rfpDocs,
        questions,
        oracleCfg,
        milestones,
        teamLeads,
        progress,
        missionTypeExt,
      ] = await Promise.all([
        supabase.from("missions").select("name,submission_deadline,procurement_type").eq("id", missionId).maybeSingle(),
        supabase.from("mission_documents").select("id").eq("mission_id", missionId).eq("document_type", "primary_rfp").limit(1),
        supabase.from("mission_questions").select("id,is_withdrawn").eq("mission_id", missionId),
        supabase.from("oracle_engagement_config").select("win_themes").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_milestones").select("id,is_pens_down").eq("mission_id", missionId),
        supabase
          .from("mission_team_members")
          .select("member_id, atlas_team_members(first_name,last_name)")
          .eq("mission_id", missionId)
          .eq("mission_role", "engagement_lead"),
        supabase.from("question_progress").select("question_id").eq("mission_id", missionId).eq("role", "lead_writer"),
        supabase
          .from("mission_iris_extractions")
          .select("extracted_value,user_override_value,confirmed_by_user")
          .eq("mission_id", missionId)
          .eq("extracted_field", "mission_type")
          .limit(1),
      ]);

      const m = mission.data;
      const activeQs = (questions.data ?? []).filter((q) => !q.is_withdrawn);
      const assignedQIds = new Set((progress.data ?? []).map((p) => p.question_id));
      const assignedCount = activeQs.filter((q) => assignedQIds.has(q.id)).length;
      const wt = oracleCfg.data?.win_themes;
      const hasWinThemes = Array.isArray(wt) ? wt.length > 0 : !!wt;
      const pensDown = (milestones.data ?? []).some((mm) => mm.is_pens_down);
      const lead = teamLeads.data?.[0];
      const leadName = lead?.atlas_team_members
        ? `${(lead.atlas_team_members as { first_name?: string; last_name?: string }).first_name ?? ""} ${(lead.atlas_team_members as { first_name?: string; last_name?: string }).last_name ?? ""}`.trim() || "Engagement Lead"
        : null;
      const deadline = m?.submission_deadline ? new Date(m.submission_deadline) : null;
      const now = new Date();
      const daysAway = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / 86400000) : 0;
      const mtExt = missionTypeExt.data?.[0];
      const hasMissionType =
        !!m?.procurement_type ||
        (!!mtExt?.confirmed_by_user &&
          !!(mtExt?.user_override_value ?? mtExt?.extracted_value));

      return [
        await safe(async () => ({
          ok: !!(m?.name && m?.submission_deadline && hasMissionType),
          pass: "Mission name, deadline, and type confirmed",
          fail: "Missing required mission fields (name, deadline, or Mission Type in Step 2)",
          step: 2,
        }), 2, "Mission Basics"),
        await safe(async () => ({
          ok: (rfpDocs.data?.length ?? 0) > 0 && activeQs.length > 0,
          pass: `RFP uploaded · ${activeQs.length} question${activeQs.length === 1 ? "" : "s"} extracted`,
          fail: "No RFP uploaded or no questions extracted",
          step: 1,
        }), 1, "RFP Processed"),
        await safe(async () => ({
          ok: hasWinThemes,
          pass: "Win themes set",
          fail: "Win strategy not configured",
          step: 3,
        }), 3, "Win Strategy"),
        await safe(async () => ({
          ok: (milestones.data?.length ?? 0) >= 2 && pensDown,
          pass: `${milestones.data?.length ?? 0} milestones · Pens Down gate confirmed`,
          fail: "Journey not configured or missing Pens Down gate",
          step: 5,
        }), 5, "Journey"),
        await safe(async () => ({
          ok: !!lead,
          pass: lead ? `${leadName} assigned as Engagement Lead` : "Engagement Lead assigned",
          fail: "No Engagement Lead assigned",
          step: 6,
        }), 6, "Engagement Lead"),
        await safe(async () => ({
          ok: activeQs.length > 0 && assignedCount === activeQs.length,
          pass: `All ${activeQs.length} questions have an assigned writer`,
          fail: `${activeQs.length - assignedCount} of ${activeQs.length} questions still unassigned`,
          step: 6,
        }), 6, "Questions Assigned"),
        await safe(async () => ({
          ok: !!deadline && deadline.getTime() > now.getTime(),
          pass: deadline ? `Submission deadline: ${deadline.toLocaleDateString()} · ${daysAway} day${daysAway === 1 ? "" : "s"} away` : "Submission deadline confirmed",
          fail: "Deadline not set or is in the past",
          step: 2,
        }), 2, "Submission Deadline"),
      ];
    },
  });

  const allChecksPass = !!checklist && checklist.every((c) => c.ok);
  const failedCount = checklist?.filter((c) => !c.ok).length ?? 0;


  const byKey = new Map<string, { value: string | null; confirmed: boolean }>();
  (extractions ?? []).forEach((e) => {
    const nextValue = e.user_override_value ?? e.extracted_value;
    const existing = byKey.get(e.extracted_field);
    if (existing?.confirmed && !e.confirmed_by_user) return;
    byKey.set(e.extracted_field, {
      value: nextValue,
      confirmed: e.confirmed_by_user,
    });
  });

  // Aggregate numbered keys (e.g. win_theme_1..5) into a single value.
  function aggregateField(prefix: string, max: number): { value: string | null; confirmed: boolean } {
    const parts: string[] = [];
    let anyUnconfirmed = false;
    let anyValue = false;
    for (let i = 1; i <= max; i++) {
      const row = byKey.get(`${prefix}_${i}`);
      const v = row?.value?.trim();
      if (v) {
        parts.push(v);
        anyValue = true;
        if (!row?.confirmed) anyUnconfirmed = true;
      }
    }
    return {
      value: anyValue ? parts.join("\n") : null,
      confirmed: anyValue && !anyUnconfirmed,
    };
  }

  // Synthesise aggregated/alias keys the Review UI expects but the wizard
  // never writes directly. Numbered keys (win_theme_1..5) collapse into
  // win_themes; top_risks double as "why we could lose" / "biggest concerns";
  // win_themes double as "why we win".
  function resolveDisplay(k: string): { value: string | null; confirmed: boolean } {
    const direct = byKey.get(k);
    if (direct?.value) return direct;
    switch (k) {
      case "win_themes":
      case "why_we_win":
        return aggregateField("win_theme", 5);
      case "biggest_concerns":
      case "why_we_could_lose":
        return aggregateField("top_risk", 5);
      case "known_competitors":
        return aggregateField("competitor", 5);
      case "stakeholder_member_family":
      case "stakeholder_provider":
      case "stakeholder_evaluator":
        return direct ?? { value: null, confirmed: false };
      default:
        return direct ?? { value: null, confirmed: false };
    }
  }

  const unconfirmedByStep: { step: number; title: string; fields: string[] }[] = Object.entries(
    STEP_FIELD_GROUPS,
  )
    .map(([stepStr, group]) => {
      const stepNum = Number(stepStr);
      const fields = group.keys.filter((k) => {
        const v = resolveDisplay(k);
        return v?.value && !v.confirmed;
      });
      return { step: stepNum, title: group.title, fields };
    })
    .filter((g) => g.fields.length > 0);
  const unconfirmedCount = unconfirmedByStep.reduce((n, g) => n + g.fields.length, 0);

  async function confirmAll() {
    const fields = unconfirmedByStep.flatMap((g) => g.fields);
    if (fields.length === 0) return;
    const { error: upErr } = await supabase
      .from("mission_iris_extractions")
      .update({ confirmed_by_user: true, confirmed_at: new Date().toISOString() })
      .eq("mission_id", missionId)
      .in("extracted_field", fields);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["wizard-review-extractions", missionId] });
  }

  async function launch() {
    setLaunching(true);
    setError(null);
    try {
      // Pull confirmed deadline if present
      const dueIso = byKey.get("proposal_due_date")?.value ?? null;

      // Cascade wizard extractions → missions columns so the Mission Brief,
      // Perplexity enrichment, and downstream IRIS reads have real data to
      // work with. Without this the missions row stays empty and every
      // generated brief comes back with "—" placeholders.
      const get = (k: string) => {
        const v = resolveDisplay(k).value;
        return v && v.trim().length > 0 ? v.trim() : null;
      };
      const splitList = (v: string | null) =>
        v
          ? v
              .split(/[,\n;|]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const stateVal = get("state_location");
      const stateCodeMatch = stateVal?.match(/\b([A-Z]{2})\b/);
      const opportunityTitle = get("opportunity_title");
      const clientAgency = get("client_agency");
      const competitorsList = splitList(get("known_competitors"));
      const winThemesText = get("win_themes");
      const topRisksText = get("biggest_concerns");

      const updates: TablesUpdate<"missions"> = {
        status: "active",
        blast_off_at: new Date().toISOString(),
      };
      if (dueIso && /^\d{4}-\d{2}-\d{2}/.test(dueIso)) {
        updates.submission_deadline = `${dueIso}T17:00:00Z`;
      }
      if (opportunityTitle) updates.name = opportunityTitle;
      if (clientAgency) {
        updates.client_name = clientAgency;
        updates.agency_name = clientAgency;
      }
      if (stateVal) updates.state = stateVal;
      if (stateCodeMatch) updates.state_code = stateCodeMatch[1];
      const rawProgramType = get("program_type");
      if (rawProgramType) {
        const norm = rawProgramType.toLowerCase().replace(/[^a-z]+/g, "_");
        const ALLOWED = new Set([
          "managed_care",
          "ltss",
          "idd",
          "childrens_behavioral_health",
          "adult_behavioral_health",
          "child_welfare",
          "dual_eligible",
          "other",
        ]);
        const ALIASES: Record<string, string> = {
          medicaid_managed_care: "managed_care",
          mco: "managed_care",
          long_term_services_and_supports: "ltss",
          long_term_care: "ltss",
          ltc: "ltss",
          intellectual_and_developmental_disabilities: "idd",
          i_dd: "idd",
          children_s_behavioral_health: "childrens_behavioral_health",
          childrens_bh: "childrens_behavioral_health",
          children_behavioral_health: "childrens_behavioral_health",
          behavioral_health: "adult_behavioral_health",
          adult_bh: "adult_behavioral_health",
          mental_health: "adult_behavioral_health",
          child_welfare_foster_care: "child_welfare",
          foster_care: "child_welfare",
          dsnp: "dual_eligible",
          duals: "dual_eligible",
          dual_eligibles: "dual_eligible",
        };
        const mapped = ALIASES[norm] ?? (ALLOWED.has(norm) ? norm : "other");
        updates.program_type = mapped;
      }
      if (get("north_star")) updates.north_star = get("north_star");
      // win themes ARE "why we win" — same data, different label downstream.
      if (winThemesText) {
        updates.why_win = winThemesText;
        updates.win_themes_text = winThemesText;
      }
      // top risks ARE "why we could lose" / "biggest concerns".
      if (topRisksText) {
        updates.why_lose = topRisksText;
        updates.biggest_concerns = topRisksText;
      }
      if (get("state_priorities")) updates.state_priorities = get("state_priorities");
      const reinforceList = splitList(get("things_to_reinforce"));
      if (reinforceList.length) updates.reinforce = reinforceList;
      const avoidList = splitList(get("things_to_avoid"));
      if (avoidList.length) updates.avoid = avoidList;
      if (competitorsList.length) updates.known_competitors = competitorsList;

      const { error: upErr } = await supabase.from("missions").update(updates).eq("id", missionId);
      if (upErr) throw upErr;

      // Mirror the aggregated strategy values into oracle_engagement_config so
      // briefing / IRIS / today's focus see them. Non-fatal if it fails.
      await syncOracleConfigFromExtractions(missionId);

      // BLAST OFF — IRIS pipeline. Fire-and-forget so the animation never blocks.
      // Step 1 (processRFPDocuments via runIrisRfpExtraction) MUST complete
      // before steps 2-4. Everything runs in a background IIFE so the user is
      // navigated to the briefing room immediately while IRIS warms up.
      void (async () => {
        console.log("BLAST OFF: firing IRIS pipeline for mission", missionId);
        try {
          await runIrisRfpExtraction(missionId);
          console.log("BLAST OFF: RFP processing complete");
        } catch (err) {
          console.error("BLAST OFF: runIrisRfpExtraction failed", err);
          return; // Without questions, the rest of the pipeline can't run.
        }

        // Step 2: graph + territory in parallel — fire-and-forget
        void Promise.allSettled([
          extractRequirementNodesFn({ data: { missionId } }).catch((err) =>
            console.error("BLAST OFF: extractRequirementNodesFromRFP failed", err),
          ),
          seedTerritoryFn({ data: { missionId } }).catch((err) =>
            console.error("BLAST OFF: seedTerritoryIntelligence failed", err),
          ),
        ]).then(() => console.log("BLAST OFF: graph + territory settled"));

        // Brief generation is now triggered inside runIrisRfpExtraction
        // immediately after Pass 2 inserts questions — no separate loop here
        // to avoid double-generation.
      })();



      // ORACLE V1 — fire-and-forget config + belief seeding. Never blocks launch.
      try {
        const staged = loadStaged(missionId);
        const winThemes = staged.win_themes ?? [];
        const topRisks = staged.top_risks ?? [];
        const competitorList = staged.competitors ?? [];
        const monitoringMode = staged.monitoring_mode ?? "balanced";
        const signalThreshold = staged.signal_threshold ?? 40;
        const ns = staged.north_star ?? null;

        const { error: configError } = await supabase.from("oracle_engagement_config").upsert(
          {
            mission_id: missionId,
            north_star: ns,
            win_themes: winThemes as never,
            top_risks: topRisks as never,
            competitors: competitorList as never,
            signal_threshold: signalThreshold,
            monitoring_mode: monitoringMode,
            status: "active",
          },
          { onConflict: "mission_id" },
        );

        if (configError) {
          console.error("ORACLE config creation failed — non-blocking:", configError.message);
        } else {
          const beliefInserts = [
            ...winThemes
              .filter((t) => t.status === "confirmed")
              .map((t) => ({
                mission_id: missionId,
                belief_text: t.text,
                belief_type: "win_theme" as const,
                confidence: t.confidence,
                status: "active" as const,
              })),
            ...topRisks
              .filter((r) => r.status === "confirmed")
              .map((r) => ({
                mission_id: missionId,
                belief_text: r.text,
                belief_type: "risk" as const,
                confidence: r.confidence,
                status: "active" as const,
              })),
            ...(ns
              ? [
                  {
                    mission_id: missionId,
                    belief_text: ns,
                    belief_type: "assumption" as const,
                    confidence: 100,
                    status: "active" as const,
                  },
                ]
              : []),
          ];
          if (beliefInserts.length) {
            const { error: beliefError } = await supabase.from("oracle_beliefs").insert(beliefInserts);
            if (beliefError) {
              console.error("ORACLE belief seeding failed — non-blocking:", beliefError.message);
            }
          }
          const parts = [
            `${competitorList.length} competitor${competitorList.length === 1 ? "" : "s"}`,
            `${winThemes.length} win theme${winThemes.length === 1 ? "" : "s"}`,
          ];
          if (ns) parts.push("1 North Star");
          toast.success(`ORACLE is active. Monitoring 6 categories across ${parts.join(", ")}.`);
          clearStaged(missionId);
        }
        // TODO: ORACLE V2 — wire sos_alerts writer signals into oracle signal review queue
      } catch (oracleErr) {
        console.error("ORACLE seeding threw — non-blocking:", oracleErr);
      }

      // Fire-and-forget IRIS historical launch brief generation.
      try {
        void triggerLaunchBriefFn({ data: { missionId } });
      } catch (e) {
        console.error("[launch-brief] trigger error", e);
      }
      // Fire-and-forget IRIS Perplexity enrichment (state landscape, incumbent, population research).
      try {
        void enrichMissionWithPerplexityFn({ data: { missionId } });
      } catch (e) {
        console.error("[perplexity-enrich] trigger error", e);
      }

      // Seed question health to 'healthy' — health engine recomputes on first Flight Deck load.
      try {
        await supabase
          .from("mission_questions")
          .update({ health_status: "healthy", health_calculated_at: new Date().toISOString() })
          .eq("mission_id", missionId);
      } catch (e) {
        console.error("[health-seed] failed — non-blocking:", e);
      }

      // Notify each assigned writer (grouped) about their assignments.
      try {
        const { data: assigns } = await supabase
          .from("question_progress")
          .select("assignee_id")
          .eq("mission_id", missionId)
          .eq("role", "lead_writer")
          .eq("acceptance_status", "pending");
        const { data: missionRow } = await supabase
          .from("missions")
          .select("name")
          .eq("id", missionId)
          .maybeSingle();
        const missionName = missionRow?.name ?? "your mission";
        const counts = new Map<string, number>();
        (assigns ?? []).forEach((a) => counts.set(a.assignee_id, (counts.get(a.assignee_id) ?? 0) + 1));
        const notifs = Array.from(counts.entries()).map(([recipient_id, n]) => ({
          recipient_id,
          recipient_role: "writer",
          type: "assignment",
          message: `You have been assigned ${n} question${n === 1 ? "" : "s"} on ${missionName}. Open your Flight Deck to review your assignments.`,
          metadata: { mission_id: missionId, question_count: n },
        }));
        if (notifs.length) {
          const { error: notifErr } = await supabase.from("atlas_notifications").insert(notifs);
          if (notifErr) console.error("[notify-writers] insert failed — non-blocking:", notifErr.message);
        }
      } catch (e) {
        console.error("[notify-writers] failed — non-blocking:", e);
      }

      qc.invalidateQueries({ queryKey: ["mission-meta", missionId] });
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setLaunching(false);
    }
  }

  async function enrichNow() {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await enrichMissionWithPerplexityFn({ data: { missionId } });
      if (res?.ok) {
        setEnrichMsg(
          "IRIS is enriching the brief in the background — state landscape, incumbent intel, and population research will appear in a moment.",
        );
      } else {
        setEnrichMsg("IRIS couldn't reach the source network. The brief will launch without enrichment.");
      }
    } catch (e) {
      setEnrichMsg(errorMessage(e));
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div>
      <WizardStepHeading
        title="Everything is set. Review and launch."
        subtitle="Confirm every field looks right. Yellow chips flag values IRIS suggested but you have not yet confirmed."
      />

      <div className="mb-5 flex items-center justify-between rounded-lg border border-white/10 bg-gradient-to-r from-amber-400/[0.04] to-transparent p-3.5">
        <div className="flex items-start gap-2.5">
          <Sparkles className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] text-white font-medium">Enrich this brief with live, cited intelligence</p>
            <p className="text-[12px] text-white/55 mt-0.5">
              IRIS will pull state landscape, incumbent flight risks, and population evidence — all with sources.
            </p>
            {enrichMsg && <p className="text-[12px] text-amber-200 mt-1.5">{enrichMsg}</p>}
          </div>
        </div>
        <button
          onClick={enrichNow}
          disabled={enriching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium border border-amber-400/40 text-amber-100 hover:bg-amber-400/10 disabled:opacity-50 shrink-0"
        >
          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {enriching ? "Enriching…" : "Enrich with IRIS"}
        </button>
      </div>


      <div className="space-y-6">
        {Object.entries(STEP_FIELD_GROUPS).map(([stepStr, group]) => {
          const stepNum = Number(stepStr);
          return (
            <div key={stepNum} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-white">{group.title}</h3>
                <button
                  onClick={() => onJump(stepNum)}
                  className="inline-flex items-center gap-1 text-[12px] text-white/55 hover:text-white"
                >
                  <Edit2 className="h-3 w-3" /> Edit
                </button>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                {group.keys.map((k) => {
                  const v = resolveDisplay(k);
                  return (
                    <div key={k}>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">{k.replace(/_/g, " ")}</dt>
                      <dd className="text-[13px] text-white mt-0.5 whitespace-pre-wrap line-clamp-4">
                        {v?.value || <span className="text-white/35 italic">Not set</span>}
                        {v?.value && !v.confirmed && (
                          <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">
                            Unconfirmed
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>

      {unconfirmedCount > 0 && (
        <div className="mt-6 rounded-lg p-4 border border-amber-400/30 bg-amber-400/5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] text-amber-100">
                {unconfirmedCount} field{unconfirmedCount === 1 ? "" : "s"} from IRIS{" "}
                {unconfirmedCount === 1 ? "is" : "are"} not yet confirmed. You can still launch —
                IRIS values are used until you override them.
              </p>
              <ul className="mt-3 space-y-2">
                {unconfirmedByStep.map((g) => (
                  <li key={g.step} className="text-[12.5px]">
                    <button
                      onClick={() => onJump(g.step)}
                      className="text-amber-200 hover:text-white underline-offset-2 hover:underline font-medium"
                    >
                      Step {g.step} · {g.title}
                    </button>
                    <span className="text-white/70">
                      {" — "}
                      {g.fields.map((f) => f.replace(/_/g, " ")).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={confirmAll}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-amber-400/40 text-amber-100 hover:bg-amber-400/10"
              >
                <Check className="h-3.5 w-3.5" /> Confirm all IRIS values as-is
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IRIS Pre-Launch Checklist */}
      <div className="mt-8">
        <div className="mb-3">
          <h3 className="text-[12px] uppercase tracking-[0.14em] text-white/60 font-semibold">IRIS Pre-Launch Checklist</h3>
          <p className="text-[12px] text-white/45 mt-0.5">Every item must be green before BLAST OFF.</p>
        </div>

        {checklistLoading || !checklist ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div
              className={`mb-3 rounded-lg p-3 border ${
                allChecksPass
                  ? "border-amber-300/50 bg-emerald-400/[0.06]"
                  : "border-amber-400/30 bg-amber-400/[0.05]"
              }`}
              style={allChecksPass ? { boxShadow: "0 0 0 1px rgba(196,154,43,0.25)" } : undefined}
            >
              {allChecksPass ? (
                <p className="text-[13px] text-emerald-200 font-medium">
                  ✅ Mission is ready for BLAST OFF. All systems go.
                </p>
              ) : (
                <p className="text-[13px] text-amber-100">
                  ⚠ {failedCount} item{failedCount === 1 ? "" : "s"} need attention before BLAST OFF.
                </p>
              )}
            </div>

            <ul className="space-y-1.5">
              {checklist.map((c, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] ${c.ok ? "text-white" : "text-white/85"}`}>
                      {c.ok ? c.pass : c.fail}
                    </p>
                  </div>
                  {!c.ok && (
                    <button
                      onClick={() => onJump(c.step)}
                      className="text-[12px] text-amber-200 hover:text-white font-medium shrink-0"
                    >
                      Fix →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {error && <div className="mt-4 text-[13px] text-red-400">{error}</div>}

      <div className="mt-8 pt-6 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="text-[13px] text-white/55 hover:text-white">
          ← Back
        </button>
        <button
          onClick={() => {
            setError(null);
            setShowLaunch(true);
          }}
          disabled={launching || showLaunch || !allChecksPass}
          title={!allChecksPass ? "Fix the items above to enable BLAST OFF" : undefined}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md text-[14px] font-medium disabled:cursor-not-allowed"
          style={{
            background: "#C49A2B",
            color: "#0D1B3E",
            opacity: !allChecksPass ? 0.4 : launching || showLaunch ? 0.5 : 1,
            boxShadow: allChecksPass && !launching && !showLaunch ? "0 0 24px rgba(196,154,43,0.45)" : undefined,
          }}
        >
          <Rocket className="h-4 w-4" />
          {allChecksPass ? "BLAST OFF 🚀" : "Complete checklist to launch"}
        </button>
      </div>

      {showLaunch && (
        <LaunchSequence
          onLaunch={launch}
          onComplete={() =>
            navigate({ to: "/missions/$missionId/briefing", params: { missionId } })
          }
        />
      )}
    </div>
  );
}
