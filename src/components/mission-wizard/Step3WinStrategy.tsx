import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { draftWinStrategy, type Competitor } from "@/lib/iris-win-strategy.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { InputSourceBadge, StepMetaIndicator, type InputSource } from "@/components/InputSourceBadge";

const FIELD_KEYS = [
  "mission_significance",
  "central_claim",
  "win_themes",
  "known_competitors",
  "evaluator_priorities",
  "evaluator_hot_buttons",
  "known_risks",
  "proof_points",
  "discriminators",
  "north_star_message",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

type WS = {
  id: string;
  mission_id: string;
  mission_significance: string | null;
  central_claim: string | null;
  win_themes: string[];
  known_competitors: Competitor[];
  evaluator_priorities: string | null;
  evaluator_hot_buttons: string | null;
  known_risks: string | null;
  proof_points: string[];
  discriminators: string | null;
  north_star_message: string | null;
  confirmed_fields: FieldKey[];
  iris_drafted_at: string | null;
};

async function fetchStrategy(missionId: string): Promise<WS | null> {
  const { data, error } = await supabase
    .from("mission_win_strategy")
    .select(
      "id, mission_id, mission_significance, central_claim, win_themes, known_competitors, evaluator_priorities, evaluator_hot_buttons, known_risks, proof_points, discriminators, north_star_message, confirmed_fields, iris_drafted_at",
    )
    .eq("mission_id", missionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as Record<string, unknown>;
  const arrStr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
  const arrComp = (v: unknown): Competitor[] => {
    if (!Array.isArray(v)) return [];
    return v.map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return {
        name: String(o.name ?? ""),
        strengths: String(o.strengths ?? ""),
        weaknesses: String(o.weaknesses ?? ""),
        notes: String(o.notes ?? ""),
      };
    });
  };
  const confirmed = Array.isArray(raw.confirmed_fields)
    ? (raw.confirmed_fields as unknown[])
        .map(String)
        .filter((x): x is FieldKey => (FIELD_KEYS as readonly string[]).includes(x))
    : [];
  return {
    id: String(raw.id),
    mission_id: String(raw.mission_id),
    mission_significance: (raw.mission_significance as string | null) ?? null,
    central_claim: (raw.central_claim as string | null) ?? null,
    win_themes: arrStr(raw.win_themes),
    known_competitors: arrComp(raw.known_competitors),
    evaluator_priorities: (raw.evaluator_priorities as string | null) ?? null,
    evaluator_hot_buttons: (raw.evaluator_hot_buttons as string | null) ?? null,
    known_risks: (raw.known_risks as string | null) ?? null,
    proof_points: arrStr(raw.proof_points),
    discriminators: (raw.discriminators as string | null) ?? null,
    north_star_message: (raw.north_star_message as string | null) ?? null,
    confirmed_fields: confirmed,
    iris_drafted_at: (raw.iris_drafted_at as string | null) ?? null,
  };
}

function useDebouncedSaver() {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );
  return (key: string, fn: () => Promise<void>, ms = 800) => {
    const prev = timers.current.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      try {
        await fn();
      } catch (e) {
        console.error("save failed", key, e);
        toast.error("Save failed. Will retry on next change.");
      }
    }, ms);
    timers.current.set(key, t);
  };
}

export function Step3WinStrategy({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useDebouncedSaver();
  const runDraft = useServerFn(draftWinStrategy);
  const draftStarted = useRef(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const { data: ws, isLoading } = useQuery({
    queryKey: ["win-strategy", missionId],
    queryFn: () => fetchStrategy(missionId),
  });

  // Local buffer for fluid typing; reset when server data id changes.
  const [buf, setBuf] = useState<Partial<WS>>({});
  useEffect(() => {
    setBuf({});
  }, [ws?.id]);

  // Trigger IRIS draft on first load if no record
  useEffect(() => {
    if (isLoading || ws || draftStarted.current) return;
    draftStarted.current = true;
    setDrafting(true);
    runDraft({ data: { mission_id: missionId } })
      .then((res) => {
        if (!res.ok) setDraftError(res.reason);
      })
      .catch((e: unknown) => setDraftError((e as Error).message ?? "Draft failed"))
      .finally(() => {
        setDrafting(false);
        qc.invalidateQueries({ queryKey: ["win-strategy", missionId] });
      });
  }, [isLoading, ws, missionId, runDraft, qc]);

  if (isLoading || drafting || (!ws && !draftError)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Sparkles className="h-10 w-10 text-[var(--athena-gold)] animate-pulse" />
        <p className="text-base text-foreground/80">IRIS is building your Win Strategy draft…</p>
        <div className="w-full max-w-md space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    );
  }

  if (!ws) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-destructive">Could not load Win Strategy.</p>
        <Button onClick={() => qc.invalidateQueries({ queryKey: ["win-strategy", missionId] })}>
          Try again
        </Button>
      </div>
    );
  }

  const live: WS = { ...ws, ...buf };
  const confirmed = new Set<FieldKey>(live.confirmed_fields);
  const allConfirmed = FIELD_KEYS.every((k) => confirmed.has(k));
  const confirmedCount = FIELD_KEYS.filter((k) => confirmed.has(k)).length;

  // Helpers ---------
  const patchLocal = (patch: Partial<WS>) => setBuf((b) => ({ ...b, ...patch }));

  const writeFields = (patch: Record<string, unknown>, key: string) => {
    save(key, async () => {
      const { error } = await supabase
        .from("mission_win_strategy")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", ws.id);
      if (error) throw error;
    });
  };

  // Update a field's value AND reset confirmed state if currently confirmed.
  const updateField = (field: FieldKey, value: unknown) => {
    const wasConfirmed = confirmed.has(field);
    const nextConfirmed = wasConfirmed
      ? live.confirmed_fields.filter((k) => k !== field)
      : live.confirmed_fields;
    patchLocal({
      [field]: value as never,
      ...(wasConfirmed ? { confirmed_fields: nextConfirmed } : {}),
    });
    const patch: Record<string, unknown> = { [field]: value };
    if (wasConfirmed) patch.confirmed_fields = nextConfirmed;
    writeFields(patch, `f:${field}`);
  };

  const confirmField = async (field: FieldKey) => {
    if (confirmed.has(field)) return;
    const next = [...live.confirmed_fields, field];
    patchLocal({ confirmed_fields: next });
    const { error } = await supabase
      .from("mission_win_strategy")
      .update({ confirmed_fields: next })
      .eq("id", ws.id);
    if (error) {
      toast.error("Could not save confirmation.");
      patchLocal({ confirmed_fields: live.confirmed_fields });
    }
  };

  const completeAndContinue = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("mission_win_strategy")
      .update({
        admin_confirmed_at: new Date().toISOString(),
        admin_confirmed_by: userData.user?.id ?? null,
      })
      .eq("id", ws.id);
    if (error) {
      toast.error("Could not finalize Win Strategy.");
      return;
    }
    navigate({
      to: "/olympus/missions/$missionId/wizard",
      params: { missionId },
      search: { step: 6 },
    });
  };

  return (
    <div className="space-y-8 mx-auto w-full max-w-[800px]">
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Build your Win Strategy.</h1>
        <p className="text-muted-foreground">
          IRIS has drafted a strategy based on your RFP. Review every field. Edit freely. Confirm each one when
          it is right. Writers cannot start until this is done.
        </p>
        <StepMetaIndicator irisCount={7} youCount={3} />
      </div>


      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-100/90">
          This strategy is the intelligence backbone of your mission. IRIS will reference it in every section
          brief, every Thread interaction, and every Score Me evaluation. The stronger this strategy, the smarter
          every consultant on this mission becomes.
        </p>
      </div>

      <div
        className={cn(
          "rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
          allConfirmed
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
            : "border-border bg-muted/40 text-foreground/80",
        )}
      >
        {allConfirmed
          ? "All 10 fields confirmed. Ready to continue."
          : `${confirmedCount} of 10 fields confirmed`}
      </div>

      {draftError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2 text-sm text-amber-100/90">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>IRIS could not generate a draft. Fill in each field manually. ({draftError})</span>
        </div>
      )}

      {/* Field 1 */}
      <FieldShell
        title="Mission Significance"
        helper="Why does winning this contract matter — to Athena, to the client population, to the healthcare system?"
        confirmed={confirmed.has("mission_significance")}
        onConfirm={() => confirmField("mission_significance")}
      >
        <Textarea
          rows={4}
          value={live.mission_significance ?? ""}
          onChange={(e) => updateField("mission_significance", e.target.value)}
        />
      </FieldShell>

      {/* Field 2 — Central Claim, elevated */}
      <FieldShell
        title="Central Claim"
        helper="The single most important thing Athena is claiming in this proposal. One sentence. Everything else supports this."
        confirmed={confirmed.has("central_claim")}
        onConfirm={() => confirmField("central_claim")}
        elevated
      >
        <Input
          value={live.central_claim ?? ""}
          onChange={(e) => updateField("central_claim", e.target.value)}
          className="text-lg h-12"
          placeholder="One sentence that defines the bid."
        />
      </FieldShell>

      {/* Field 3 — Win Themes */}
      <FieldShell
        title="Win Themes"
        helper="3 to 5 strategic messages that must run through every section. Specific, defensible, evidence-backed."
        confirmed={confirmed.has("win_themes")}
        onConfirm={() => confirmField("win_themes")}
      >
        <StringList
          values={live.win_themes}
          onChange={(v) => updateField("win_themes", v)}
          placeholder="Win theme"
          min={1}
          max={8}
          addLabel="Add Theme"
        />
      </FieldShell>

      {/* Field 4 — Known Competitors */}
      <FieldShell
        title="Known Competitors"
        source="you"
        helper="Who else is likely bidding and what do you know about them."
        confirmed={confirmed.has("known_competitors")}
        onConfirm={() => confirmField("known_competitors")}
      >
        <CompetitorList
          values={live.known_competitors}
          onChange={(v) => updateField("known_competitors", v)}
        />
      </FieldShell>

      {/* 5 */}
      <FieldShell
        title="Evaluator Priorities"
        helper="What the evaluators actually care about underneath the RFP language."
        confirmed={confirmed.has("evaluator_priorities")}
        onConfirm={() => confirmField("evaluator_priorities")}
      >
        <Textarea
          rows={3}
          value={live.evaluator_priorities ?? ""}
          onChange={(e) => updateField("evaluator_priorities", e.target.value)}
        />
      </FieldShell>

      {/* 6 */}
      <FieldShell
        title="Evaluator Hot Buttons"
        helper="Specific topics or language that consistently influence this evaluator profile positively or negatively."
        confirmed={confirmed.has("evaluator_hot_buttons")}
        onConfirm={() => confirmField("evaluator_hot_buttons")}
      >
        <Textarea
          rows={3}
          value={live.evaluator_hot_buttons ?? ""}
          onChange={(e) => updateField("evaluator_hot_buttons", e.target.value)}
        />
      </FieldShell>

      {/* 7 */}
      <FieldShell
        title="Known Risks"
        helper="What could hurt this proposal. Gaps, competitive weaknesses, political sensitivities."
        confirmed={confirmed.has("known_risks")}
        onConfirm={() => confirmField("known_risks")}
      >
        <Textarea
          rows={3}
          value={live.known_risks ?? ""}
          onChange={(e) => updateField("known_risks", e.target.value)}
        />
      </FieldShell>

      {/* 8 — Proof Points */}
      <FieldShell
        title="Proof Points"
        helper="Specific evidence, data, case studies, or references that support the Central Claim and Win Themes."
        confirmed={confirmed.has("proof_points")}
        onConfirm={() => confirmField("proof_points")}
      >
        <StringList
          values={live.proof_points}
          onChange={(v) => updateField("proof_points", v)}
          placeholder="Proof point"
          addLabel="Add Proof Point"
        />
      </FieldShell>

      {/* 9 */}
      <FieldShell
        title="Discriminators"
        helper="What makes Athena different from every other bidder on this specific procurement."
        confirmed={confirmed.has("discriminators")}
        onConfirm={() => confirmField("discriminators")}
      >
        <Textarea
          rows={3}
          value={live.discriminators ?? ""}
          onChange={(e) => updateField("discriminators", e.target.value)}
        />
      </FieldShell>

      {/* 10 — North Star, elevated */}
      <FieldShell
        title="North Star Message"
        helper="The one thing evaluators should remember about this proposal after they read it."
        confirmed={confirmed.has("north_star_message")}
        onConfirm={() => confirmField("north_star_message")}
        elevated
      >
        <Input
          value={live.north_star_message ?? ""}
          onChange={(e) => updateField("north_star_message", e.target.value)}
          className="text-lg italic h-12"
          placeholder="The one phrase to remember."
        />
      </FieldShell>

      <div className="pt-4 border-t border-border flex flex-col items-center gap-3">
        <Button
          disabled={!allConfirmed}
          onClick={completeAndContinue}
          className={cn(
            "min-w-[320px] bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)] transition-opacity",
            !allConfirmed && "opacity-40 cursor-not-allowed",
          )}
        >
          Win Strategy Complete — Build the Journey →
        </Button>
        <button
          type="button"
          onClick={() => navigate({ to: "/olympus/missions" })}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Save and come back later
        </button>
      </div>
    </div>
  );
}

function FieldShell({
  title,
  helper,
  confirmed,
  onConfirm,
  elevated,
  source = "iris-with-fallback",
  children,
}: {
  title: string;
  helper: string;
  confirmed: boolean;
  onConfirm: () => void;
  elevated?: boolean;
  source?: InputSource;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-2 transition-colors",
        elevated
          ? "rounded-lg border border-border bg-card shadow-lg p-5 border-l-4 border-l-[var(--athena-gold)]"
          : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
        </div>
        <InputSourceBadge source={source} />
      </div>

      {children}
      <div>
        {confirmed ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400">
            <Check className="h-4 w-4" /> Confirmed ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            className="text-xs text-[var(--athena-gold)] hover:underline font-medium"
          >
            Confirm this field →
          </button>
        )}
      </div>
    </section>
  );
}

function StringList({
  values,
  onChange,
  placeholder,
  addLabel,
  min,
  max,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  min?: number;
  max?: number;
}) {
  const list = values.length === 0 ? [""] : values;
  const canRemove = (i: number) => list.length > Math.max(1, min ?? 0) || (min ?? 0) === 0 && list.length > 1;

  const update = (i: number, v: string) => {
    const next = [...list];
    next[i] = v;
    onChange(next);
  };
  const add = () => {
    if (max && list.length >= max) return;
    onChange([...list, ""]);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {list.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <button
            type="button"
            disabled={!canRemove(i)}
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={add}
        disabled={!!max && list.length >= max}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> {addLabel}
      </Button>
    </div>
  );
}

function CompetitorList({
  values,
  onChange,
}: {
  values: Competitor[];
  onChange: (next: Competitor[]) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const update = (i: number, patch: Partial<Competitor>) => {
    const next = values.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange(next);
  };
  const add = () => {
    onChange([...values, { name: "", strengths: "", weaknesses: "", notes: "" }]);
    setCollapsed((c) => ({ ...c, [values.length]: false }));
  };
  const remove = (i: number) => {
    const next = values.filter((_, idx) => idx !== i);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {values.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No competitors yet.</p>
      )}
      {values.map((c, i) => {
        const isCollapsed = collapsed[i] ?? false;
        return (
          <div key={i} className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCollapsed((s) => ({ ...s, [i]: !isCollapsed }))}
                className="flex items-center gap-1 text-sm font-medium text-foreground"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {c.name || "New competitor"}
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove competitor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <Input
                  placeholder="Strengths"
                  value={c.strengths}
                  onChange={(e) => update(i, { strengths: e.target.value })}
                />
                <Input
                  placeholder="Weaknesses"
                  value={c.weaknesses}
                  onChange={(e) => update(i, { weaknesses: e.target.value })}
                />
                <Input
                  placeholder="Notes"
                  value={c.notes}
                  onChange={(e) => update(i, { notes: e.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Competitor
      </Button>
    </div>
  );
}

// Silence unused-imports warning for useMemo if not used elsewhere
void useMemo;
