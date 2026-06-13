/**
 * Step 8 — Review & Launch. Read-only summary across all confirmed fields,
 * then launch the mission (sets status='active').
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Edit2, Loader2, Rocket, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
    byKey.set(e.extracted_field, {
      value: e.user_override_value ?? e.extracted_value,
      confirmed: e.confirmed_by_user,
    });
  });

  const unconfirmedCount = Array.from(byKey.values()).filter((v) => v.value && !v.confirmed).length;

  async function launch() {
    setLaunching(true);
    setError(null);
    try {
      // Pull confirmed deadline if present
      const dueIso = byKey.get("proposal_due_date")?.value ?? null;
      const updates: Record<string, unknown> = { status: "active" };
      if (dueIso && /^\d{4}-\d{2}-\d{2}/.test(dueIso)) {
        updates.submission_deadline = `${dueIso}T17:00:00Z`;
      }
      const { error: upErr } = await supabase.from("missions").update(updates).eq("id", missionId);
      if (upErr) throw upErr;
      qc.invalidateQueries({ queryKey: ["mission-meta", missionId] });
      navigate({ to: "/missions/$missionId/briefing", params: { missionId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div>
      <WizardStepHeading
        title="Everything is set. Review and launch."
        subtitle="Confirm every field looks right. Yellow chips flag values IRIS suggested but you have not yet confirmed."
      />

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
        <div className="mt-6 flex items-start gap-2 rounded-lg p-3 border border-amber-400/30 bg-amber-400/5">
          <AlertCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-100">
            {unconfirmedCount} field{unconfirmedCount === 1 ? "" : "s"} from IRIS {unconfirmedCount === 1 ? "is" : "are"} not yet confirmed. You can still launch — IRIS values are used until you override them.
          </p>
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
