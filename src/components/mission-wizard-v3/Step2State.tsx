/**
 * Wizard Step 2 — State.
 * Pick the state for this mission and link/seed its State Intelligence Pack.
 * Writes `state_location` extraction (wizardStep=2) and updates missions.state.
 * Auto-creates the pack when admin and missing; surfaces completeness + a link
 * to the full /admin/state-intel/$stateCode management surface.
 */
import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { US_STATES, TOTAL_CATEGORIES } from "@/lib/state-intel/categories";
import { listStateIntelPacks, createStateIntelPack } from "@/lib/state-intel/state-intel.functions";
import { useIsAdmin } from "@/hooks/useAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

export function Step2State({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const listPacks = useServerFn(listStateIntelPacks);
  const createPack = useServerFn(createStateIntelPack);
  const [saving, setSaving] = useState(false);

  const { data: extraction } = useQuery({
    queryKey: ["mission-iris-extractions", missionId, 2, "state_location"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_value, user_override_value, confirmed_by_user, overridden_by_user")
        .eq("mission_id", missionId)
        .eq("extracted_field", "state_location")
        .order("confirmed_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: missionRow } = useQuery({
    queryKey: ["wizard-mission-state", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("state").eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: packs = [] } = useQuery({
    queryKey: ["state-intel-packs"],
    queryFn: () => listPacks(),
  });

  // Normalize stored value (full name or code) to a 2-letter code.
  const initialCode = useMemo(() => {
    const raw = (missionRow?.state ?? extraction?.user_override_value ?? extraction?.extracted_value ?? "").toString().trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    const byCode = US_STATES.find((s) => s.code === upper);
    if (byCode) return byCode.code;
    const byName = US_STATES.find((s) => s.name.toLowerCase() === raw.toLowerCase());
    return byName?.code ?? "";
  }, [missionRow?.state, extraction?.extracted_value, extraction?.user_override_value]);

  const [code, setCode] = useState<string>(initialCode);
  useEffect(() => { if (initialCode && !code) setCode(initialCode); }, [initialCode, code]);

  const picked = US_STATES.find((s) => s.code === code) ?? null;
  const existingPack = packs.find((p) => p.state_code === code) ?? null;

  async function saveAndAdvance() {
    if (!picked) {
      toast.error("Pick a state to continue");
      return;
    }
    setSaving(true);
    try {
      // Update missions.state with the 2-letter code.
      await supabase.from("missions").update({ state: picked.code }).eq("id", missionId);

      // Upsert the state_location extraction (full state name for readability).
      if (extraction?.id) {
        await supabase
          .from("mission_iris_extractions")
          .update({
            user_override_value: picked.name,
            extracted_value: extraction.extracted_value ?? picked.name,
            overridden_by_user: true,
            confirmed_by_user: true,
            confirmed_at: new Date().toISOString(),
            wizard_step: 2,
          })
          .eq("id", extraction.id);
      } else {
        await supabase.from("mission_iris_extractions").insert({
          mission_id: missionId,
          extracted_field: "state_location",
          extracted_value: picked.name,
          user_override_value: picked.name,
          overridden_by_user: true,
          confirmed_by_user: true,
          confirmed_at: new Date().toISOString(),
          wizard_step: 2,
        });
      }

      // Seed the State Intelligence Pack if missing and we have permission.
      if (!existingPack && isAdmin) {
        try {
          await createPack({ data: { stateCode: picked.code, stateName: picked.name } });
          qc.invalidateQueries({ queryKey: ["state-intel-packs"] });
        } catch (e) {
          // Non-fatal: pack creation is admin-only. Surface but still advance.
          console.warn("[Step2State] pack create skipped:", e);
        }
      }

      qc.invalidateQueries({ queryKey: ["wizard-mission-state", missionId] });
      qc.invalidateQueries({ queryKey: ["mission-iris-extractions", missionId] });
      onAdvance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save state");
    } finally {
      setSaving(false);
    }
  }

  const filled = existingPack?.categories_filled ?? 0;
  const pct = Math.round((filled / TOTAL_CATEGORIES) * 100);

  return (
    <div>
      <WizardStepHeading
        title="Which state is this mission in?"
        subtitle="The State Intelligence Pack — waivers, managed care landscape, rate setting, legislative posture — is inherited from this selection."
      />

      <div className="space-y-6">
        <div>
          <label className="text-[12px] uppercase tracking-[0.12em] text-white/55 mb-2 block">State</label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger className="bg-white/[0.03] border-white/10 text-white h-11 max-w-md">
              <SelectValue placeholder="Choose a state…" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {picked && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-[#c9a84c]">{picked.code}</div>
                <div className="text-[17px] font-medium text-white mt-0.5">{picked.name}</div>
                <div className="text-[12.5px] text-white/55 mt-1">
                  {existingPack ? (
                    <>
                      State pack exists · <span className="text-white/75">{filled}/{TOTAL_CATEGORIES} categories</span> ({pct}%)
                    </>
                  ) : isAdmin ? (
                    <>No pack yet — we'll create one when you continue.</>
                  ) : (
                    <>No pack yet — an admin needs to create the State Intelligence Pack.</>
                  )}
                </div>
              </div>
              {existingPack && (
                <Link
                  to="/admin/state-intel/$stateCode"
                  params={{ stateCode: picked.code }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded border border-white/15 text-white/75 hover:bg-white/5 shrink-0"
                >
                  Manage pack <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {existingPack && (
              <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 75 ? "#22c55e" : pct >= 40 ? "#c9a84c" : "#ef4444",
                  }}
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[12px] text-white/40">
          You can deepen the pack any time from <span className="text-white/60">Admin → State Intel</span>. The mission inherits whatever is current.
        </p>
      </div>

      <WizardFooter
        step={2}
        onBack={onBack}
        onContinue={saveAndAdvance}
        continueDisabled={!picked || saving}
        continueLabel={saving ? "Saving…" : "Save & Continue"}
        continueHint={saving ? undefined : picked ? (existingPack ? "Linked to pack" : isAdmin ? "Will create pack" : undefined) : "Pick a state"}
      />
    </div>
  );
}
