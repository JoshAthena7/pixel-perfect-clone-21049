import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  saveOnboardingStep,
  getOnboardingContext,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/welcome")({
  component: OnboardingWizard,
});

const EXPERTISE_TAXONOMY = [
  "Clinical Operations",
  "Medicaid Policy",
  "Managed Care",
  "Behavioral Health",
  "Long-Term Services & Supports",
  "Care Coordination",
  "IT / Data / Interoperability",
  "Finance & Actuarial",
  "Compliance & Regulatory",
  "Member Services",
  "Provider Network",
  "Quality / HEDIS",
  "SDOH / Health Equity",
  "Pharmacy",
  "Federal Programs",
  "Procurement Strategy",
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

type Step = 0 | 1 | 2 | 3;

function OnboardingWizard() {
  const navigate = useNavigate();
  const getCtx = useServerFn(getOnboardingContext);
  const saveStep = useServerFn(saveOnboardingStep);

  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth" as any, search: { redirect: "/welcome" } as any });
      else setAuthed(true);
    });
  }, [navigate]);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["onboarding-ctx"],
    queryFn: () => getCtx(),
    enabled: authed === true,
  });

  const [step, setStep] = useState<Step>(0);
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [bio, setBio] = useState("");
  const [slack, setSlack] = useState("");
  const [pov, setPov] = useState<string>("evaluator_first");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ctx?.profile) return;
    setDisplayName(ctx.profile.display_name ?? "");
    setBio(ctx.profile.expert_bio ?? "");
    setTags(ctx.profile.expertise_areas ?? []);
    setSlack(ctx.profile.slack_user_id ?? "");
    if (ctx.profile.timezone) setTimezone(ctx.profile.timezone);
    if (ctx.profile.preferred_pov) setPov(ctx.profile.preferred_pov);
  }, [ctx?.profile]);

  const missionName = ctx?.invite?.missionName ?? null;
  const missionId = ctx?.invite?.missionId ?? null;
  const inviteRole = ctx?.invite?.role ?? null;

  const totalSteps = 4;
  const pct = useMemo(() => Math.round(((step + 1) / totalSteps) * 100), [step]);

  function toggleTag(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }
  function addCustomTag() {
    const v = customTag.trim();
    if (!v) return;
    if (!tags.includes(v)) setTags([...tags, v]);
    setCustomTag("");
  }

  async function persistAndAdvance(nextStep: Step | "done") {
    setBusy(true);
    try {
      if (step === 1) {
        if (!displayName.trim()) {
          toast.error("Please add your name to continue.");
          setBusy(false);
          return;
        }
        await saveStep({ data: { step: "profile", displayName: displayName.trim(), jobTitle, timezone } });
      } else if (step === 2) {
        await saveStep({ data: { step: "expertise", expertiseAreas: tags, bio } });
      } else if (step === 3) {
        await saveStep({ data: { step: "comms", slackHandle: slack, preferredPov: pov } });
        await saveStep({ data: { step: "finish" } });
      }
      if (nextStep === "done") {
        toast.success("You're in.");
        if (missionId) navigate({ to: "/missions/$missionId", params: { missionId } as any });
        else navigate({ to: "/home" });
      } else {
        setStep(nextStep);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (authed === null || isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Progress */}
        <div className="mb-10">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
            <span>IRIS Onboarding</span>
            <span>Step {step + 1} of {totalSteps}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-light text-white">
              {missionName ? <>You've been brought onto <span className="text-amber-300">{missionName}</span>.</> : <>Welcome.</>}
            </h1>
            <p className="text-base leading-relaxed text-white/70">
              I'm IRIS. I read every signal, every requirement, every move the state has made. My job is to keep you ahead of the evaluator. Before we drop into the mission, I need three minutes from you so I can brief you on the right things.
            </p>
            {inviteRole && (
              <p className="text-sm text-white/50">
                Your role on this mission: <span className="text-white/80 capitalize">{inviteRole.replaceAll("_", " ")}</span>
              </p>
            )}
            <div className="flex items-center justify-between pt-6">
              <button className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70" onClick={() => persistAndAdvance("done")}>
                Skip for now
              </button>
              <Button onClick={() => setStep(1)} className="bg-amber-400 text-black hover:bg-amber-300">
                Let's go <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-light text-white">Who are you?</h2>
            <p className="text-sm text-white/60">So I can address you correctly and route messages to the right place.</p>
            <div className="space-y-4">
              <div>
                <Label className="text-white/70">Full name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/70">Job title</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Proposal Writer" className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/70">Time zone</Label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <StepNav onBack={() => setStep(0)} onNext={() => persistAndAdvance(2)} onSkip={() => persistAndAdvance(2)} busy={busy} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-light text-white">What do you know cold?</h2>
            <p className="text-sm text-white/60">Pick everything you can write or speak to without prep. I use this to route questions and SME asks to you.</p>
            <div className="flex flex-wrap gap-2">
              {EXPERTISE_TAXONOMY.map((t) => {
                const on = tags.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggleTag(t)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-amber-300/60 bg-amber-300/10 text-amber-200" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white"}`}>
                    {on && <Check className="mr-1 inline h-3 w-3" />}{t}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomTag())} placeholder="Add other expertise…" className="bg-white/5 border-white/10 text-white" />
              <Button type="button" variant="outline" onClick={addCustomTag} className="border-white/20 text-white">Add</Button>
            </div>
            {tags.filter((t) => !EXPERTISE_TAXONOMY.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {tags.filter((t) => !EXPERTISE_TAXONOMY.includes(t)).map((t) => (
                  <Badge key={t} className="bg-white/10 text-white/80">{t} <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => toggleTag(t)}>×</button></Badge>
                ))}
              </div>
            )}
            <div>
              <Label className="text-white/70">One-line bio (optional)</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="20 years writing Medicaid managed care proposals across 12 states." className="bg-white/5 border-white/10 text-white" />
            </div>
            <StepNav onBack={() => setStep(1)} onNext={() => persistAndAdvance(3)} onSkip={() => persistAndAdvance(3)} busy={busy} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-light text-white">How should I reach you?</h2>
            <p className="text-sm text-white/60">Last step. Then I drop you into the mission.</p>
            <div className="space-y-4">
              <div>
                <Label className="text-white/70">Slack handle (optional)</Label>
                <Input value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="@jane" className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/70">When IRIS briefs you, lead with…</Label>
                <select value={pov} onChange={(e) => setPov(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  <option value="evaluator_first">What the evaluator wants</option>
                  <option value="risk_first">What's at risk</option>
                  <option value="strategy_first">What our move is</option>
                  <option value="signals_first">Raw signals first</option>
                </select>
              </div>
            </div>
            <StepNav onBack={() => setStep(2)} onNext={() => persistAndAdvance("done")} nextLabel="Enter mission" busy={busy} />
          </div>
        )}
      </div>
    </Shell>
  );
}

function StepNav({ onBack, onNext, onSkip, nextLabel = "Continue", busy }: { onBack: () => void; onNext: () => void; onSkip?: () => void; nextLabel?: string; busy: boolean }) {
  return (
    <div className="flex items-center justify-between pt-6">
      <div className="flex items-center gap-4">
        <button className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70" onClick={onBack}>← Back</button>
        {onSkip && <button className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70" onClick={onSkip}>Skip</button>}
      </div>
      <Button onClick={onNext} disabled={busy} className="bg-amber-400 text-black hover:bg-amber-300">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{nextLabel} <ArrowRight className="ml-2 h-4 w-4" /></>}
      </Button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0a0a0c] text-white">{children}</div>;
}
