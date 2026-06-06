import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Plus, Trash2, Check, Plane, Pause, Circle } from "lucide-react";

const COMMON_STATES = ["NJ", "IN", "OH", "TX", "IL", "PA", "FL", "TN", "KY", "MO", "GA", "NC"];
const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","PR",
];

type Opt = { id: string; kind: "expertise_area" | "question_type"; label: string };
type Program = { id: string; program_name: string; state_code: string | null };

type Win = {
  mission_name?: string;
  question_type?: string;
  score?: number;
  year?: number;
  notes?: string;
};

export type EditableProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  expertise_areas: string[];
  states_experience: string[];
  programs_experience: string[];
  question_types: string[];
  notable_wins: Win[];
  availability_status: "available" | "pens_down" | "unavailable" | "pto";
  availability_until: string | null;
  availability_note: string | null;
  expert_bio: string | null;
  profile_completed: boolean;
};

export function ExpertiseProfileEditor({
  profileId,
  onClose,
}: {
  profileId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["editable-profile", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,display_name,email,avatar_color,avatar_url,expertise_areas,states_experience,programs_experience,question_types,notable_wins,availability_status,availability_until,availability_note,expert_bio,profile_completed",
        )
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data as EditableProfile | null;
    },
  });

  const { data: options = [] } = useQuery({
    queryKey: ["expertise-library-opts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("expertise_library")
        .select("id,label,category,sort_order")
        .order("sort_order", { ascending: true });
      return (data ?? []).map((r) => ({ id: r.id, kind: "expertise_area" as const, label: r.label })) as Opt[];
    },
  });


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

  // local form state
  const [form, setForm] = useState<EditableProfile | null>(null);
  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const expertiseOpts = useMemo(() => options.filter((o) => o.kind === "expertise_area"), [options]);
  const qtypeOpts = useMemo(
    () =>
      [
        "Approach & Methodology",
        "Operations",
        "Care Management",
        "Quality",
        "Provider Network",
        "Implementation",
        "IT Systems",
        "Compliance",
        "Staffing",
        "Financial",
        "Reporting & Analytics",
        "Member Experience",
      ].map((label, i) => ({ id: `qt-${i}`, kind: "question_type" as const, label })),
    [],
  );


  const [stateSearch, setStateSearch] = useState("");
  const [showAllStates, setShowAllStates] = useState(false);
  const [customExpertise, setCustomExpertise] = useState("");
  const [customProgram, setCustomProgram] = useState("");

  if (isLoading || !form) {
    return (
      <Sheet onClose={onClose}>
        <div className="p-8 text-sm text-muted-foreground">Loading profile…</div>
      </Sheet>
    );
  }

  function toggle(field: keyof EditableProfile, value: string) {
    if (!form) return;
    const list = (form[field] as string[]) ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    setForm({ ...form, [field]: next });
  }

  function setField<K extends keyof EditableProfile>(field: K, value: EditableProfile[K]) {
    if (!form) return;
    setForm({ ...form, [field]: value });
  }

  async function save() {
    if (!form) return;
    const required =
      form.expertise_areas.length > 0 &&
      form.states_experience.length > 0 &&
      !!form.availability_status;

    const { error } = await supabase
      .from("profiles")
      .update({
        expertise_areas: form.expertise_areas,
        states_experience: form.states_experience,
        programs_experience: form.programs_experience,
        question_types: form.question_types,
        notable_wins: form.notable_wins,
        availability_status: form.availability_status,
        availability_until: form.availability_until,
        availability_note: form.availability_note,
        expert_bio: form.expert_bio,
        profile_completed: required,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", form.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["editable-profile", form.id] });
    qc.invalidateQueries({ queryKey: ["olympus-expertise-profiles"] });
    toast.success("Profile updated. IRIS will use this when recommending you.");
    onClose();
  }

  const initials = (form.display_name ?? form.email ?? "?").slice(0, 2).toUpperCase();
  const stateOptions = showAllStates ? ALL_STATES : COMMON_STATES;

  return (
    <Sheet onClose={onClose}>
      {/* HEADER */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: form.avatar_color ?? "#3b7fff" }}
          >
            {initials}
          </span>
          <div>
            <div className="text-base font-semibold text-foreground">{form.display_name ?? "Unnamed"}</div>
            <div className="text-[11px] text-muted-foreground">{form.email}</div>
            <div className="mt-1">
              {form.profile_completed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <Check className="h-3 w-3" /> Profile complete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  Profile incomplete
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-8 px-6 py-6">
        {/* SECTION 1 — EXPERTISE */}
        <Section title="What do you know?" subtitle="The areas you can speak to with depth.">
          <ChipPicker
            values={form.expertise_areas}
            options={expertiseOpts.map((o) => o.label)}
            onToggle={(v) => toggle("expertise_areas", v)}
          />
          <div className="mt-3 flex gap-2">
            <input
              value={customExpertise}
              onChange={(e) => setCustomExpertise(e.target.value)}
              placeholder="Add custom expertise…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            />
            <button
              onClick={() => {
                const v = customExpertise.trim();
                if (!v) return;
                if (!form.expertise_areas.includes(v))
                  setField("expertise_areas", [...form.expertise_areas, v]);
                setCustomExpertise("");
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              <Plus className="inline h-3 w-3" /> Add
            </button>
          </div>
        </Section>

        {/* SECTION 2 — STATES */}
        <Section title="Which states have you worked in?">
          <ChipPicker
            values={form.states_experience}
            options={stateOptions.filter((s) =>
              !stateSearch ? true : s.toLowerCase().includes(stateSearch.toLowerCase()),
            )}
            onToggle={(v) => toggle("states_experience", v)}
          />
          <div className="mt-3 flex items-center gap-2">
            {!showAllStates ? (
              <button
                onClick={() => setShowAllStates(true)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
              >
                + More states
              </button>
            ) : (
              <input
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Filter states…"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              />
            )}
          </div>
        </Section>

        {/* SECTION 3 — PROGRAMS */}
        <Section title="Which programs have you worked on?">
          <ChipPicker
            values={form.programs_experience}
            options={programs.map((p) => `${p.program_name}${p.state_code ? ` · ${p.state_code}` : ""}`)}
            onToggle={(v) => toggle("programs_experience", v)}
          />
          <div className="mt-3 flex gap-2">
            <input
              value={customProgram}
              onChange={(e) => setCustomProgram(e.target.value)}
              placeholder="Add a program not listed…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            />
            <button
              onClick={() => {
                const v = customProgram.trim();
                if (!v) return;
                if (!form.programs_experience.includes(v))
                  setField("programs_experience", [...form.programs_experience, v]);
                setCustomProgram("");
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              <Plus className="inline h-3 w-3" /> Add
            </button>
          </div>
        </Section>

        {/* SECTION 4 — QUESTION TYPES */}
        <Section
          title="What kinds of questions do you write best?"
          subtitle="These get the most weight in IRIS matching."
        >
          <ChipPicker
            values={form.question_types}
            options={qtypeOpts.map((o) => o.label)}
            onToggle={(v) => toggle("question_types", v)}
          />
        </Section>

        {/* SECTION 5 — NOTABLE WINS */}
        <Section title="Your strongest work." subtitle="Wins that IRIS will reference when recommending you.">
          <div className="space-y-3">
            {form.notable_wins.map((w, i) => (
              <WinCard
                key={i}
                win={w}
                qtypeOpts={qtypeOpts.map((o) => o.label)}
                onChange={(nw) => {
                  const next = [...form.notable_wins];
                  next[i] = nw;
                  setField("notable_wins", next);
                }}
                onDelete={() => {
                  setField(
                    "notable_wins",
                    form.notable_wins.filter((_, j) => j !== i),
                  );
                }}
              />
            ))}
          </div>
          <button
            onClick={() =>
              setField("notable_wins", [...form.notable_wins, { mission_name: "", question_type: "", score: undefined, year: new Date().getFullYear(), notes: "" }])
            }
            className="mt-3 rounded-md border border-dashed border-border bg-surface/40 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="inline h-3 w-3" /> Add a win
          </button>
        </Section>

        {/* SECTION 6 — AVAILABILITY */}
        <Section title="Are you available to help?">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <AvailabilityCard
              active={form.availability_status === "available"}
              icon={<span className="h-2 w-2 rounded-full bg-emerald-500" />}
              label="Available"
              hint="Ready to take calls"
              onSelect={() => {
                setForm({ ...form, availability_status: "available", availability_until: null, availability_note: null });
              }}
            />
            <AvailabilityCard
              active={form.availability_status === "pens_down"}
              icon={<Pause className="h-3 w-3 text-amber-400" />}
              label="Pens Down"
              hint="Until"
              onSelect={() => setField("availability_status", "pens_down")}
              extra={
                form.availability_status === "pens_down" && (
                  <input
                    type="date"
                    value={form.availability_until ?? ""}
                    onChange={(e) => setField("availability_until", e.target.value || null)}
                    className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                  />
                )
              }
            />
            <AvailabilityCard
              active={form.availability_status === "pto"}
              icon={<Plane className="h-3 w-3 text-muted-foreground" />}
              label="PTO"
              hint="Until"
              onSelect={() => setField("availability_status", "pto")}
              extra={
                form.availability_status === "pto" && (
                  <input
                    type="date"
                    value={form.availability_until ?? ""}
                    onChange={(e) => setField("availability_until", e.target.value || null)}
                    className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                  />
                )
              }
            />
            <AvailabilityCard
              active={form.availability_status === "unavailable"}
              icon={<Circle className="h-3 w-3 text-muted-foreground" />}
              label="Unavailable"
              hint="Note"
              onSelect={() => setField("availability_status", "unavailable")}
              extra={
                form.availability_status === "unavailable" && (
                  <input
                    value={form.availability_note ?? ""}
                    onChange={(e) => setField("availability_note", e.target.value || null)}
                    placeholder="Optional note"
                    className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                  />
                )
              }
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Auto-set to <span className="text-foreground">Pens Down</span> when you're on a mission whose submission date is approaching.
          </p>
        </Section>

        {/* SECTION 7 — BIO */}
        <Section
          title="How would you describe yourself to a colleague?"
          subtitle="Shown when you're recommended via Phone a Friend."
        >
          <textarea
            value={form.expert_bio ?? ""}
            onChange={(e) => setField("expert_bio", e.target.value.slice(0, 140))}
            placeholder="e.g. Happy to help on health equity and CHW integration questions."
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs"
          />
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {(form.expert_bio ?? "").length}/140
          </div>
        </Section>

        {/* SAVE */}
        <button
          onClick={save}
          className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Save Profile
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="h-full w-full max-w-[640px] overflow-y-auto border-l border-border bg-surface">
        {children}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
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
  // Show any selected values that aren't in options too, so customs survive.
  const merged = Array.from(new Set([...options, ...values]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {merged.map((opt) => {
        const active = values.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className="rounded-full border px-2.5 py-1 text-[11px] transition"
            style={
              active
                ? { background: "rgba(59,127,255,0.15)", borderColor: "rgba(59,127,255,0.4)", color: "var(--accent,#3b7fff)" }
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

function WinCard({
  win,
  qtypeOpts,
  onChange,
  onDelete,
}: {
  win: Win;
  qtypeOpts: string[];
  onChange: (w: Win) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/60 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          value={win.mission_name ?? ""}
          onChange={(e) => onChange({ ...win, mission_name: e.target.value })}
          placeholder="Mission (e.g. Ohio Medicaid 2023)"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <select
          value={win.question_type ?? ""}
          onChange={(e) => onChange({ ...win, question_type: e.target.value })}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Question type…</option>
          {qtypeOpts.map((qt) => (
            <option key={qt} value={qt}>{qt}</option>
          ))}
        </select>
        <input
          type="number"
          step={0.1}
          min={1}
          max={5}
          value={win.score ?? ""}
          onChange={(e) => onChange({ ...win, score: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Score (1.0–5.0)"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          type="number"
          value={win.year ?? ""}
          onChange={(e) => onChange({ ...win, year: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Year"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
      <textarea
        value={win.notes ?? ""}
        onChange={(e) => onChange({ ...win, notes: e.target.value.slice(0, 140) })}
        placeholder="What made this answer strong? (140 chars)"
        rows={2}
        className="mt-2 w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{(win.notes ?? "").length}/140</span>
        <button onClick={onDelete} className="text-[11px] text-muted-foreground hover:text-red-400">
          <Trash2 className="inline h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}

function AvailabilityCard({
  active, icon, label, hint, onSelect, extra,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onSelect: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      type="button"
      className="rounded-md border bg-surface/60 px-3 py-3 text-left transition hover:bg-surface"
      style={{
        borderColor: active ? "rgba(59,127,255,0.5)" : "var(--border)",
        background: active ? "rgba(59,127,255,0.08)" : undefined,
      }}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
      {extra}
    </button>
  );
}
