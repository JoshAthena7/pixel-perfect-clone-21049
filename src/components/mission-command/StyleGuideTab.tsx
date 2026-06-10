import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsAdmin, logAudit } from "@/lib/mission-helpers";

type TermRow = { use_this: string; not_this: string; context: string };
type AvoidRow = { phrase: string; reason: string };

type StyleGuide = {
  id: string | null;
  voice_and_tone: string;
  formatting_requirements: string;
  terminology_preferences: TermRow[];
  words_to_avoid: AvoidRow[];
  length_and_density: string;
  political_sensitivities: string;
  competitive_sensitivities: string;
  historical_sensitivities: string;
  cultural_sensitivities: string;
};

const EMPTY: StyleGuide = {
  id: null,
  voice_and_tone: "",
  formatting_requirements: "",
  terminology_preferences: [{ use_this: "", not_this: "", context: "" }],
  words_to_avoid: [],
  length_and_density: "",
  political_sensitivities: "",
  competitive_sensitivities: "",
  historical_sensitivities: "",
  cultural_sensitivities: "",
};

export function StyleGuideTab({ missionId }: { missionId: string }) {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const [sg, setSg] = useState<StyleGuide>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["style-guide", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_style_guide")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!data || loaded) return;
    setSg({
      id: data.id,
      voice_and_tone: data.voice_and_tone ?? "",
      formatting_requirements: data.formatting_requirements ?? "",
      terminology_preferences: Array.isArray(data.terminology_preferences)
        ? (data.terminology_preferences as TermRow[])
        : [{ use_this: "", not_this: "", context: "" }],
      words_to_avoid: Array.isArray(data.words_to_avoid) ? (data.words_to_avoid as AvoidRow[]) : [],
      length_and_density: data.length_and_density ?? "",
      political_sensitivities: data.political_sensitivities ?? "",
      competitive_sensitivities: data.competitive_sensitivities ?? "",
      historical_sensitivities: data.historical_sensitivities ?? "",
      cultural_sensitivities: data.cultural_sensitivities ?? "",
    });
    setLastSaved(data.updated_at ? new Date(data.updated_at) : null);
    setLoaded(true);
  }, [data, loaded]);

  useEffect(() => {
    if (!loaded || !isAdmin) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      const payload = {
        mission_id: missionId,
        voice_and_tone: sg.voice_and_tone,
        formatting_requirements: sg.formatting_requirements,
        terminology_preferences: sg.terminology_preferences,
        words_to_avoid: sg.words_to_avoid,
        length_and_density: sg.length_and_density,
        political_sensitivities: sg.political_sensitivities,
        competitive_sensitivities: sg.competitive_sensitivities,
        historical_sensitivities: sg.historical_sensitivities,
        cultural_sensitivities: sg.cultural_sensitivities,
      };
      if (sg.id) {
        await supabase.from("mission_style_guide").update(payload).eq("id", sg.id);
      } else {
        const { data: ins } = await supabase
          .from("mission_style_guide").insert(payload).select("id").maybeSingle();
        if (ins?.id) setSg((s) => ({ ...s, id: ins.id }));
        await logAudit({ missionId, action: "Style Guide created" });
      }
      setLastSaved(new Date());
    }, 1000);
    return () => window.clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sg, loaded, isAdmin]);

  const set = <K extends keyof StyleGuide>(k: K, v: StyleGuide[K]) =>
    setSg((s) => ({ ...s, [k]: v }));

  const lastSavedLabel = useMemo(
    () => (lastSaved ? `Last saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}` : ""),
    [lastSaved],
  );

  if (roleLoading || isLoading) return <Skeleton className="h-96 w-full" />;
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        This tab is restricted to mission administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Style Guide & Sensitivities</h2>
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          These standards are known to IRIS and applied in every Thread interaction and Score Me evaluation on this mission. Keep them current.
        </div>
        {lastSavedLabel && (
          <p className="text-xs text-muted-foreground mt-2">{lastSavedLabel}</p>
        )}
      </div>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b-2 border-primary pb-1">
          Style Guide
        </h3>

        <Field
          label="Voice and Tone"
          helper="How should Athena sound in this proposal?"
        >
          <Textarea rows={4} value={sg.voice_and_tone}
                    onChange={(e) => set("voice_and_tone", e.target.value)} />
        </Field>

        <Field
          label="Formatting Requirements"
          helper="Header styles, numbering conventions, font requirements."
        >
          <Textarea rows={3} value={sg.formatting_requirements}
                    onChange={(e) => set("formatting_requirements", e.target.value)} />
        </Field>

        <div className="space-y-2">
          <Label>Terminology Preferences</Label>
          {sg.terminology_preferences.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <Input placeholder="Use This" value={row.use_this}
                     onChange={(e) => {
                       const next = [...sg.terminology_preferences];
                       next[idx] = { ...row, use_this: e.target.value };
                       set("terminology_preferences", next);
                     }} />
              <Input placeholder="Not This" value={row.not_this}
                     onChange={(e) => {
                       const next = [...sg.terminology_preferences];
                       next[idx] = { ...row, not_this: e.target.value };
                       set("terminology_preferences", next);
                     }} />
              <Input placeholder="Context" value={row.context}
                     onChange={(e) => {
                       const next = [...sg.terminology_preferences];
                       next[idx] = { ...row, context: e.target.value };
                       set("terminology_preferences", next);
                     }} />
              <Button variant="ghost" size="icon"
                      onClick={() => set("terminology_preferences",
                        sg.terminology_preferences.filter((_, i) => i !== idx))}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm"
                  onClick={() => set("terminology_preferences",
                    [...sg.terminology_preferences, { use_this: "", not_this: "", context: "" }])}>
            <Plus className="size-4 mr-1" />Add Row
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Words and Phrases to Avoid</Label>
          {sg.words_to_avoid.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input placeholder="Word or Phrase" value={row.phrase}
                     onChange={(e) => {
                       const next = [...sg.words_to_avoid];
                       next[idx] = { ...row, phrase: e.target.value };
                       set("words_to_avoid", next);
                     }} />
              <Input placeholder="Reason" value={row.reason}
                     onChange={(e) => {
                       const next = [...sg.words_to_avoid];
                       next[idx] = { ...row, reason: e.target.value };
                       set("words_to_avoid", next);
                     }} />
              <Button variant="ghost" size="icon"
                      onClick={() => set("words_to_avoid",
                        sg.words_to_avoid.filter((_, i) => i !== idx))}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm"
                  onClick={() => set("words_to_avoid",
                    [...sg.words_to_avoid, { phrase: "", reason: "" }])}>
            <Plus className="size-4 mr-1" />Add Row
          </Button>
        </div>

        <Field label="Length and Density" helper="How detailed and dense should responses be?">
          <Textarea rows={2} value={sg.length_and_density}
                    onChange={(e) => set("length_and_density", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b-2 border-primary pb-1">
          Sensitivities
        </h3>

        <Field label="Political Sensitivities"
               helper="Topics the client has signaled are sensitive given the political environment.">
          <Textarea rows={3} value={sg.political_sensitivities}
                    onChange={(e) => set("political_sensitivities", e.target.value)} />
        </Field>
        <Field label="Competitive Sensitivities"
               helper="Things that would draw attention to competitors or reflect poorly on Athena.">
          <Textarea rows={3} value={sg.competitive_sensitivities}
                    onChange={(e) => set("competitive_sensitivities", e.target.value)} />
        </Field>
        <Field label="Historical Sensitivities"
               helper="Issues from past relationships or procurements with this client.">
          <Textarea rows={3} value={sg.historical_sensitivities}
                    onChange={(e) => set("historical_sensitivities", e.target.value)} />
        </Field>
        <Field label="Cultural Sensitivities"
               helper="Population-specific language, community values, representation considerations.">
          <Textarea rows={3} value={sg.cultural_sensitivities}
                    onChange={(e) => set("cultural_sensitivities", e.target.value)} />
        </Field>
      </section>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {helper && <p className="text-xs text-muted-foreground mb-1">{helper}</p>}
      {children}
    </div>
  );
}
