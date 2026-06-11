import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seedTerritoryIntelligence } from "@/lib/iris-territory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputSourceBadge, ConfirmationBar, StepMetaIndicator } from "@/components/InputSourceBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";


const STATES: Array<{ name: string; code: string }> = [
  ["Alabama","AL"],["Alaska","AK"],["Arizona","AZ"],["Arkansas","AR"],["California","CA"],
  ["Colorado","CO"],["Connecticut","CT"],["Delaware","DE"],["District of Columbia","DC"],
  ["Florida","FL"],["Georgia","GA"],["Hawaii","HI"],["Idaho","ID"],["Illinois","IL"],
  ["Indiana","IN"],["Iowa","IA"],["Kansas","KS"],["Kentucky","KY"],["Louisiana","LA"],
  ["Maine","ME"],["Maryland","MD"],["Massachusetts","MA"],["Michigan","MI"],["Minnesota","MN"],
  ["Mississippi","MS"],["Missouri","MO"],["Montana","MT"],["Nebraska","NE"],["Nevada","NV"],
  ["New Hampshire","NH"],["New Jersey","NJ"],["New Mexico","NM"],["New York","NY"],
  ["North Carolina","NC"],["North Dakota","ND"],["Ohio","OH"],["Oklahoma","OK"],["Oregon","OR"],
  ["Pennsylvania","PA"],["Rhode Island","RI"],["South Carolina","SC"],["South Dakota","SD"],
  ["Tennessee","TN"],["Texas","TX"],["Utah","UT"],["Vermont","VT"],["Virginia","VA"],
  ["Washington","WA"],["West Virginia","WV"],["Wisconsin","WI"],["Wyoming","WY"],
  ["Puerto Rico","PR"],["Guam","GU"],["U.S. Virgin Islands","VI"],
  ["American Samoa","AS"],["Northern Mariana Islands","MP"],
].map(([name, code]) => ({ name, code }));

const STATES_WITH_DATA = new Set(["NJ","NY","OH","PA","TX","CA","FL","IL","MI","WA"]);
const PRIOR_COUNT: Record<string, number> = { NJ: 14, NY: 22, OH: 9, PA: 11, TX: 28, CA: 31, FL: 17, IL: 12, MI: 8, WA: 7 };

const PROGRAM_TYPES = [
  { v: "managed_care", l: "Managed Care" },
  { v: "ltss", l: "LTSS" },
  { v: "idd", l: "IDD" },
  { v: "childrens_behavioral_health", l: "Children's Behavioral Health" },
  { v: "adult_behavioral_health", l: "Adult Behavioral Health" },
  { v: "child_welfare", l: "Child Welfare" },
  { v: "dual_eligible", l: "Dual Eligible / D-SNP" },
  { v: "other", l: "Other" },
];

const FEED_CHIPS: Record<string, { federal: string[]; research: string[] }> = {
  managed_care: {
    federal: ["CMS Guidance", "Federal Register (Medicaid)", "CMMI Models", "State Plan Amendments"],
    research: ["Care management models", "Quality measurement", "Network adequacy", "Value-based payment"],
  },
  ltss: {
    federal: ["CMS Guidance", "Federal Register (Medicaid)", "CMMI Models"],
    research: ["HCBS quality", "Workforce capacity", "Self-direction models"],
  },
  idd: {
    federal: ["CMS Guidance", "CMS IDD Guidance", "Federal Register (Medicaid)"],
    research: ["HCBS waivers", "Employment supports", "Self-direction"],
  },
  childrens_behavioral_health: {
    federal: ["CMS Guidance", "SAMHSA Bulletins", "ACF Guidance", "Federal Register (BH rulemaking)"],
    research: ["Wraparound evidence", "Youth crisis models", "Family engagement research", "MRSS/mobile crisis"],
  },
  adult_behavioral_health: {
    federal: ["CMS Guidance", "SAMHSA Bulletins", "Federal Register (BH rulemaking)"],
    research: ["CCBHC evidence", "Crisis continuum models", "MAT integration"],
  },
  child_welfare: {
    federal: ["ACF Guidance", "Federal Register (CW rulemaking)"],
    research: ["Family First implementation", "Kinship care evidence", "Title IV-E"],
  },
  dual_eligible: {
    federal: ["CMS Guidance", "CMMI Models", "Federal Register (Medicaid)"],
    research: ["Integrated care models", "D-SNP evidence", "Care coordination"],
  },
  other: { federal: ["CMS Guidance", "Federal Register"], research: ["General Medicaid policy"] },
};

export function Step7Territory({ missionId, onAdvance }: { missionId: string; onAdvance: () => void }) {
  const qc = useQueryClient();
  const seedTerritory = useServerFn(seedTerritoryIntelligence);
  const seededRef = useRef(false);
  const { data: mission, isLoading } = useQuery({
    queryKey: ["mission-territory", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("state, state_code, agency_name, agency_code, program_type")
        .eq("id", missionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [stateCode, setStateCode] = useState<string>("");
  const [agencyName, setAgencyName] = useState<string>("");
  const [agencyCode, setAgencyCode] = useState<string>("");
  const [programType, setProgramType] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Fire seedTerritoryIntelligence once when all three territory fields are set.
  function maybeSeed(s: string, agency: string, prog: string) {
    if (seededRef.current) return;
    if (!s || !agency.trim() || !prog) return;
    seededRef.current = true;
    seedTerritory({ data: { missionId } }).catch((err) =>
      console.error("[Step7Territory] seedTerritoryIntelligence failed", err),
    );
  }


  useEffect(() => {
    if (mission) {
      setStateCode(mission.state_code ?? "");
      setAgencyName(mission.agency_name ?? "");
      setAgencyCode(mission.agency_code ?? "");
      setProgramType(mission.program_type ?? "");
    }
  }, [mission]);

  const selectedState = useMemo(() => STATES.find((s) => s.code === stateCode), [stateCode]);

  async function saveState(code: string) {
    setStateCode(code);
    const s = STATES.find((x) => x.code === code);
    await supabase.from("missions").update({ state_code: code, state: s?.name ?? null }).eq("id", missionId);
    qc.invalidateQueries({ queryKey: ["mission-territory", missionId] });
    maybeSeed(s?.name ?? "", agencyName, programType);
  }

  // Debounce agency name/code
  useEffect(() => {
    if (!mission) return;
    const t = setTimeout(() => {
      if (agencyName !== (mission.agency_name ?? "") || agencyCode !== (mission.agency_code ?? "")) {
        supabase
          .from("missions")
          .update({ agency_name: agencyName || null, agency_code: agencyCode || null })
          .eq("id", missionId)
          .then(() => maybeSeed(mission.state ?? "", agencyName, programType));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [agencyName, agencyCode, missionId, mission, programType]);

  async function saveProgramType(v: string) {
    setProgramType(v);
    await supabase
      .from("missions")
      .update({ program_type: v, intelligence_loadout_step: 1 })
      .eq("id", missionId);
    maybeSeed(mission?.state ?? "", agencyName, v);
  }


  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const filtered = search
    ? STATES.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))
    : STATES;

  const canContinue = !!stateCode && !!agencyName.trim() && !!programType;
  const chips = programType ? FEED_CHIPS[programType] : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--athena-navy)]">Define the territory.</h1>
        <p className="text-muted-foreground">
          Tell IRIS where this mission lives. Everything she knows about this state, this agency, and this program type becomes yours.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[11px] text-muted-foreground">3 fields you provide → unlocks IRIS seeding</span>
        </div>
      </header>

      <ConfirmationBar
        ok={!!(stateCode && agencyName.trim() && programType)}
        okText="Territory set — IRIS is seeding policy and stakeholder nodes now."
        pendingText="Set all three fields below to unlock automatic policy and stakeholder seeding by IRIS."
      />

      {/* State */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>State or Territory</Label>
          <InputSourceBadge source="you" />
        </div>

        <Input
          placeholder="Search states…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-56 overflow-auto rounded border border-border divide-y">
          {filtered.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => saveState(s.code)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between",
                stateCode === s.code && "bg-[var(--athena-gold)]/10",
              )}
            >
              <span>{s.name} ({s.code})</span>
              {stateCode === s.code && <Check className="h-4 w-4 text-[var(--athena-gold)]" />}
            </button>
          ))}
        </div>

        {selectedState && (
          <div className="rounded border border-[var(--athena-gold)]/60 bg-[var(--athena-gold)]/5 p-3 mt-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--athena-gold)] font-semibold">
              IRIS Intelligence Preview
            </p>
            <p className="text-sm mt-1">
              {STATES_WITH_DATA.has(selectedState.code)
                ? `I have ${PRIOR_COUNT[selectedState.code]} prior procurements on file for ${selectedState.name}. Activating state intelligence profile.`
                : `This appears to be a new state for Athena. I will build a fresh intelligence profile as we load your documents.`}
            </p>
          </div>
        )}
      </div>

      {/* Agency */}
      {stateCode && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Procuring Agency</Label>
              <InputSourceBadge source="you" />
            </div>
            <Input
              placeholder="e.g. Department of Children and Families"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Agency Abbreviation (optional)</Label>
            <Input
              placeholder="e.g. DCF"
              value={agencyCode}
              onChange={(e) => setAgencyCode(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Program type */}
      {stateCode && agencyName.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Program Type</Label>
            <InputSourceBadge source="you" />
          </div>
          <div className="flex flex-wrap gap-2">
            {PROGRAM_TYPES.map((p) => {
              const selected = programType === p.v;
              return (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => saveProgramType(p.v)}
                  className={cn(
                    "px-3 py-1.5 rounded border text-sm transition-colors",
                    selected
                      ? "bg-[var(--athena-gold)] text-[var(--athena-navy)] border-[var(--athena-gold)]"
                      : "border-[var(--athena-navy)]/40 text-foreground hover:bg-muted",
                  )}
                >
                  {p.l}
                </button>
              );
            })}
          </div>

          {chips && (
            <div className="rounded border border-[var(--athena-gold)]/60 bg-[var(--athena-navy)]/5 p-4 space-y-3 mt-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--athena-gold)] animate-pulse" />
                <p className="text-sm font-semibold text-[var(--athena-navy)]">
                  IRIS is activating your intelligence profile
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Federal feeds I will watch:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.federal.map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-[var(--athena-navy)]/10 text-[var(--athena-navy)]">{c}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Research I will track:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.research.map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-[var(--athena-navy)]/10 text-[var(--athena-navy)]">{c}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">
                I will pre-configure your monitoring feeds in Step 10 based on this profile. You can adjust anything there.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Save and continue later
        </button>
        <Button
          onClick={onAdvance}
          disabled={!canContinue}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
        >
          Continue to Intelligence Upload →
        </Button>
      </div>
    </div>
  );
}
