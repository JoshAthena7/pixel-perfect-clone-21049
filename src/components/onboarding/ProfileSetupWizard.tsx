import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Sparkles, Plus } from "lucide-react";

/**
 * First-login wizard. Mounts after the IRIS briefing (has_onboarded=true)
 * and blocks the app until the consultant has self-tagged enough for
 * Phone-a-Friend to find them. Workaround until Talentdesk auto-tags on
 * import — once profile_completed=true, this never shows again.
 *
 * Replay with ?profile-setup=1.
 */

const COMMON_STATES = ["NJ", "IN", "OH", "TX", "IL", "PA", "FL", "TN", "KY", "MO", "GA", "NC"];
const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","PR",
];

type Opt = { id: string; kind: "expertise_area" | "question_type"; label: string };
type Program = { id: string; program_name: string; state_code: string | null };
type Availability = "available" | "pens_down" | "unavailable" | "pto";

type Form = {
  expertise_areas: string[];
  states_experience: string[];
  programs_experience: string[];
  question_types: string[];
  availability_status: Availability;
  expert_bio: string;
};

function isReplay() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get("profile-setup") === "1";
}

const DEFER_KEY = "iris.profile-setup.deferred";

export function ProfileSetupWizardMount() {
  // Re-render when the wizard defers itself for the session.
  const [deferred, setDeferred] = useState(
    typeof window !== "undefined" && sessionStorage.getItem(DEFER_KEY) === "1",
  );

  const { data: gate } = useQuery({
    queryKey: ["profile-setup-gate"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, has_onboarded, profile_completed")
        .eq("id", auth.user.id)
        .maybeSingle();
      return p;
    },
    refetchOnWindowFocus: false,
  });

  if (!gate) return null;
  const replay = isReplay();
  // Only show after the IRIS briefing is done; don't double-stack on top of it.
  if (!gate.has_onboarded && !replay) return null;
  if (gate.profile_completed && !replay) return null;
  // User chose "Save and continue later" — honor it for the rest of this session.
  if (deferred && !replay) return null;

  return (
    <ProfileSetupWizard
      profileId={gate.id}
      displayName={gate.display_name ?? "operator"}
      onDefer={() => {
        sessionStorage.setItem(DEFER_KEY, "1");
        setDeferred(true);
      }}
    />
  );
}

const STEPS = [
  { key: "intro", title: "Welcome", subtitle: "Two minutes to get IRIS pointed at you." },
  { key: "expertise", title: "What do you know?", subtitle: "Pick the areas you can speak to with depth." },
  { key: "states", title: "Where have you worked?", subtitle: "States where you've delivered procurement work." },
  { key: "programs", title: "Which programs?", subtitle: "Specific programs you've supported." },
  { key: "qtypes", title: "What do you write best?", subtitle: "Question types where you're the strongest pen." },
  { key: "availability", title: "Are you available?", subtitle: "We'll respect this when teammates ping you." },
  { key: "bio", title: "One-line bio", subtitle: "Shown when IRIS recommends you on Phone-a-Friend." },
] as const;

function ProfileSetupWizard({
  profileId,
  displayName,
  onDefer,
}: {
  profileId: string;
  displayName: string;
  onDefer: () => void;
}) {
  const qc = useQueryClient();

  // Per-user resume key. Survives across logout/login on the same browser so
  // returning users land on the exact step they deferred at.
  const resumeKey = `iris.profile-setup.step:${profileId}`;
  const [stepIdx, setStepIdx] = useState(() => {
    if (typeof window === "undefined") return 0;
    const raw = localStorage.getItem(resumeKey);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 && n < STEPS.length ? n : 0;
  });
  const [saving, setSaving] = useState(false);

  // Persist step on every change so a hard refresh also resumes correctly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(resumeKey, String(stepIdx));
  }, [stepIdx, resumeKey]);

  const [form, setForm] = useState<Form>({
    expertise_areas: [],
    states_experience: [],
    programs_experience: [],
    question_types: [],
    availability_status: "available",
    expert_bio: "",
  });
  const [customExpertise, setCustomExpertise] = useState("");
  const [customProgram, setCustomProgram] = useState("");
  const [showAllStates, setShowAllStates] = useState(false);

  // Pre-fill if user already has anything saved (re-entry).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("expertise_areas,states_experience,programs_experience,question_types,availability_status,expert_bio")
        .eq("id", profileId)
        .maybeSingle();
      if (data) {
        setForm({
          expertise_areas: data.expertise_areas ?? [],
          states_experience: data.states_experience ?? [],
          programs_experience: data.programs_experience ?? [],
          question_types: data.question_types ?? [],
          availability_status: (data.availability_status as Availability) ?? "available",
          expert_bio: data.expert_bio ?? "",
        });
      }
    })();
  }, [profileId]);

  const { data: options = [] } = useQuery({
    queryKey: ["expertise-options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("expertise_options")
        .select("id,kind,label")
        .order("sort_order", { ascending: true });
      return (data ?? []) as Opt[];
    },
  });
  const expertiseOpts = useMemo(() => options.filter((o) => o.kind === "expertise_area"), [options]);
  const qtypeOpts = useMemo(() => options.filter((o) => o.kind === "question_type"), [options]);

  const { data: programs = [] } = useQuery({
    queryKey: ["atlas-programs-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("atlas_programs")
        .select("id,program_name,state_code")
        .order("program_name", { ascending: true });
      return (data ?? []) as Program[];
    },
  });

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  // Per-step minimums (skip-friendly except the two we really need).
  const canAdvance = (() => {
    switch (step.key) {
      case "expertise": return form.expertise_areas.length > 0;
      case "states": return form.states_experience.length > 0;
      default: return true;
    }
  })();

  function toggle(field: keyof Form, value: string) {
    const list = (form[field] as string[]) ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    setForm({ ...form, [field]: next });
  }

  async function persist({ markComplete }: { markComplete: boolean }) {
    const required = form.expertise_areas.length > 0 && form.states_experience.length > 0;
    const { error } = await supabase
      .from("profiles")
      .update({
        expertise_areas: form.expertise_areas,
        states_experience: form.states_experience,
        programs_experience: form.programs_experience,
        question_types: form.question_types,
        availability_status: form.availability_status,
        expert_bio: form.expert_bio || null,
        // Only flip the completion flag when the user finishes; deferred
        // saves preserve their progress without dismissing the wizard for good.
        profile_completed: markComplete ? required : false,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["profile-setup-gate"] });
    qc.invalidateQueries({ queryKey: ["me-expertise-status"] });
    qc.invalidateQueries({ queryKey: ["editable-profile", profileId] });
    return true;
  }

  async function finish() {
    setSaving(true);
    const ok = await persist({ markComplete: true });
    setSaving(false);
    if (!ok) return;
    toast.success("You're set up. IRIS will point teammates to you when they need your expertise.");
    if (typeof window !== "undefined") localStorage.removeItem(resumeKey);
    if (typeof window !== "undefined" && isReplay()) {
      const url = new URL(window.location.href);
      url.searchParams.delete("profile-setup");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async function saveAndDefer() {
    setSaving(true);
    const ok = await persist({ markComplete: false });
    setSaving(false);
    if (!ok) return;
    toast.success("Progress saved. We'll pick this back up next time you log in.");
    onDefer();
  }

  const firstName = displayName.split(/\s+/)[0];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex h-full max-h-[640px] w-full max-w-[720px] flex-col overflow-hidden rounded-none border border-border bg-surface md:rounded-2xl md:h-auto md:max-h-[90vh]">
        {/* Progress */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Setup · {stepIdx + 1} of {STEPS.length}</span>
            <span>{Math.round(((stepIdx + 1) / STEPS.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
          {step.subtitle && <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p>}

          <div className="mt-6">
            {step.key === "intro" && (
              <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-4">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-semibold">Hi {firstName} — IRIS here.</div>
                    <div className="text-xs text-muted-foreground">Let's get you tagged so the right questions find you.</div>
                  </div>
                </div>
                <p>
                  When a teammate hits a question outside their lane, IRIS does a <span className="text-foreground font-medium">Phone-a-Friend</span> — surfacing the consultant most likely to crack it. For that to work, we need to know what you know.
                </p>
                <p className="text-muted-foreground">
                  This takes ~2 minutes. You can edit any of it later from your profile.
                </p>
              </div>
            )}

            {step.key === "expertise" && (
              <>
                <ChipPicker
                  values={form.expertise_areas}
                  options={expertiseOpts.map((o) => o.label)}
                  onToggle={(v) => toggle("expertise_areas", v)}
                />
                <CustomAdder
                  value={customExpertise}
                  setValue={setCustomExpertise}
                  placeholder="Add custom expertise (e.g. CHW integration)…"
                  onAdd={(v) => {
                    if (!form.expertise_areas.includes(v))
                      setForm({ ...form, expertise_areas: [...form.expertise_areas, v] });
                  }}
                />
                {form.expertise_areas.length === 0 && (
                  <p className="mt-3 text-[11px] text-amber-400">Pick at least one to continue.</p>
                )}
              </>
            )}

            {step.key === "states" && (
              <>
                <ChipPicker
                  values={form.states_experience}
                  options={showAllStates ? ALL_STATES : COMMON_STATES}
                  onToggle={(v) => toggle("states_experience", v)}
                />
                {!showAllStates && (
                  <button
                    onClick={() => setShowAllStates(true)}
                    className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
                  >
                    + Show all 50 states
                  </button>
                )}
                {form.states_experience.length === 0 && (
                  <p className="mt-3 text-[11px] text-amber-400">Pick at least one state.</p>
                )}
              </>
            )}

            {step.key === "programs" && (
              <>
                <ChipPicker
                  values={form.programs_experience}
                  options={programs.map((p) => `${p.program_name}${p.state_code ? ` · ${p.state_code}` : ""}`)}
                  onToggle={(v) => toggle("programs_experience", v)}
                />
                <CustomAdder
                  value={customProgram}
                  setValue={setCustomProgram}
                  placeholder="Add a program not listed…"
                  onAdd={(v) => {
                    if (!form.programs_experience.includes(v))
                      setForm({ ...form, programs_experience: [...form.programs_experience, v] });
                  }}
                />
                <p className="mt-3 text-[11px] text-muted-foreground">Optional — skip if none apply yet.</p>
              </>
            )}

            {step.key === "qtypes" && (
              <>
                <ChipPicker
                  values={form.question_types}
                  options={qtypeOpts.map((o) => o.label)}
                  onToggle={(v) => toggle("question_types", v)}
                />
                <p className="mt-3 text-[11px] text-muted-foreground">These get the most weight in IRIS matching. Skip if unsure.</p>
              </>
            )}

            {step.key === "availability" && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    { v: "available", label: "Available", hint: "Ready for calls", dot: "bg-emerald-500" },
                    { v: "pens_down", label: "Pens Down", hint: "On deadline", dot: "bg-amber-400" },
                    { v: "pto", label: "PTO", hint: "Out of office", dot: "bg-sky-400" },
                    { v: "unavailable", label: "Unavailable", hint: "Don't ping", dot: "bg-muted-foreground" },
                  ] as const
                ).map((opt) => {
                  const active = form.availability_status === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => setForm({ ...form, availability_status: opt.v })}
                      className="rounded-md border bg-surface/60 px-3 py-3 text-left transition hover:bg-surface"
                      style={{
                        borderColor: active ? "rgba(59,127,255,0.5)" : "var(--border)",
                        background: active ? "rgba(59,127,255,0.08)" : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 text-[12px] font-semibold">
                        <span className={`h-2 w-2 rounded-full ${opt.dot}`} /> {opt.label}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {step.key === "bio" && (
              <>
                <textarea
                  value={form.expert_bio}
                  onChange={(e) => setForm({ ...form, expert_bio: e.target.value.slice(0, 140) })}
                  placeholder="e.g. Happy to help on health equity and CHW integration questions."
                  rows={4}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-1 text-right text-[10px] text-muted-foreground">{form.expert_bio.length}/140</div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <button
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={isFirst || saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            {/* Always available after the intro step — preserves progress without
                marking the profile complete, so the wizard re-fires next login. */}
            {stepIdx > 0 && (
              <button
                onClick={saveAndDefer}
                disabled={saving}
                className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
              >
                Save & continue later
              </button>
            )}
            {isLast ? (
              <button
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Check className="h-4 w-4" /> {saving ? "Saving…" : "Finish setup"}
              </button>
            ) : (
              <button
                onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
                disabled={!canAdvance || saving}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipPicker({
  values,
  options,
  onToggle,
}: {
  values: string[];
  options: string[];
  onToggle: (v: string) => void;
}) {
  const merged = Array.from(new Set([...options, ...values]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {merged.map((opt) => {
        const active = values.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className="rounded-full border px-3 py-1.5 text-[12px] transition"
            style={
              active
                ? { background: "rgba(59,127,255,0.15)", borderColor: "rgba(59,127,255,0.45)", color: "var(--accent,#3b7fff)" }
                : { borderColor: "var(--border)", color: "var(--muted-foreground)" }
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function CustomAdder({
  value,
  setValue,
  placeholder,
  onAdd,
}: {
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = value.trim();
            if (v) {
              onAdd(v);
              setValue("");
            }
          }
        }}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
      />
      <button
        onClick={() => {
          const v = value.trim();
          if (!v) return;
          onAdd(v);
          setValue("");
        }}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
      >
        <Plus className="inline h-3 w-3" /> Add
      </button>
    </div>
  );
}
