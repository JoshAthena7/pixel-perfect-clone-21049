/**
 * Step 8 — Review & Launch. Read-only summary across all confirmed fields,
 * then launch the mission (sets status='active').
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Edit2, Loader2, Rocket, AlertCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { triggerLaunchBrief } from "@/lib/iris-launch-brief.functions";
import { enrichMissionWithPerplexity } from "@/lib/iris/perplexity-enrich.functions";
import { WIZARD_STEPS, WizardStepHeading, WizardFooter } from "./WizardShellV3";

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
  const [launching, setLaunching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const unconfirmedByStep: { step: number; title: string; fields: string[] }[] = Object.entries(
    STEP_FIELD_GROUPS,
  )
    .map(([stepStr, group]) => {
      const stepNum = Number(stepStr);
      const fields = group.keys.filter((k) => {
        const v = byKey.get(k);
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
        const v = byKey.get(k)?.value;
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

      const updates: Parameters<ReturnType<typeof supabase.from<"missions">>["update"]>[0] = {
        status: "active",
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
      if (get("program_type")) updates.program_type = get("program_type");
      if (get("north_star")) updates.north_star = get("north_star");
      if (get("why_we_win")) updates.why_win = get("why_we_win");
      if (get("why_we_could_lose")) updates.why_lose = get("why_we_could_lose");
      if (get("biggest_concerns")) updates.biggest_concerns = get("biggest_concerns");
      if (get("state_priorities")) updates.state_priorities = get("state_priorities");
      if (get("win_themes")) updates.win_themes_text = get("win_themes");
      const reinforceList = splitList(get("things_to_reinforce"));
      if (reinforceList.length) updates.reinforce = reinforceList;
      const avoidList = splitList(get("things_to_avoid"));
      if (avoidList.length) updates.avoid = avoidList;
      if (competitorsList.length) updates.known_competitors = competitorsList;

      const { error: upErr } = await supabase.from("missions").update(updates).eq("id", missionId);
      if (upErr) throw upErr;
      // Fire-and-forget IRIS historical launch brief generation.
      try {
        void triggerLaunchBrief({ data: { missionId } });
      } catch (e) {
        console.error("[launch-brief] trigger error", e);
      }
      // Fire-and-forget IRIS Perplexity enrichment (state landscape, incumbent, population research).
      try {
        void enrichMissionWithPerplexity({ data: { missionId } });
      } catch (e) {
        console.error("[perplexity-enrich] trigger error", e);
      }
      qc.invalidateQueries({ queryKey: ["mission-meta", missionId] });
      navigate({ to: "/missions/$missionId/briefing", params: { missionId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  async function enrichNow() {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await enrichMissionWithPerplexity({ data: { missionId } });
      if (res?.ok) {
        setEnrichMsg(
          "IRIS is enriching the brief in the background — state landscape, incumbent intel, and population research will appear in a moment.",
        );
      } else {
        setEnrichMsg("IRIS couldn't reach the source network. The brief will launch without enrichment.");
      }
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : String(e));
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
                  const v = byKey.get(k);
                  return (
                    <div key={k}>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">{k.replace(/_/g, " ")}</dt>
                      <dd className="text-[13px] text-white mt-0.5 line-clamp-2">
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

      {error && <div className="mt-4 text-[13px] text-red-400">{error}</div>}

      <div className="mt-8 pt-6 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="text-[13px] text-white/55 hover:text-white">
          ← Back
        </button>
        <button
          onClick={launch}
          disabled={launching}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md text-[14px] font-medium disabled:opacity-50"
          style={{ background: "#C49A2B", color: "#0D1B3E" }}
        >
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {launching ? "Launching…" : "Launch Mission"}
        </button>
      </div>
    </div>
  );
}
