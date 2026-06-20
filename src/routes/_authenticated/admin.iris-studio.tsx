// IRIS Studio — admin console to configure per-mission IRIS behaviour:
// voice, language & inclusion, evaluator persona, brief settings, personality.
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getIrisConfig, updateIrisConfig } from "@/lib/iris-config.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceStudioTab } from "@/components/iris-studio/VoiceStudioTab";
import { LanguageInclusionTab } from "@/components/iris-studio/LanguageInclusionTab";
import { BriefSettingsTab } from "@/components/iris-studio/BriefSettingsTab";
import { EvaluatorPersonaTab } from "@/components/iris-studio/EvaluatorPersonaTab";
import { PersonalityTab } from "@/components/iris-studio/PersonalityTab";
import { toast } from "sonner";

const GOLD = "#C49A2B";

type Mission = { id: string; name: string | null };

const TAB_KEYS = ["brief", "language", "evaluator", "voice", "personality"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export const Route = createFileRoute("/_authenticated/admin/iris-studio")({
  validateSearch: (s: Record<string, unknown>) => ({
    mission: typeof s.mission === "string" ? s.mission : undefined,
    tab: typeof s.tab === "string" && (TAB_KEYS as readonly string[]).includes(s.tab)
      ? (s.tab as TabKey)
      : undefined,
  }),
  component: IrisStudioPage,
});

function IrisStudioPage() {
  const search = useSearch({ from: "/_authenticated/admin/iris-studio" });
  const [missionId, setMissionId] = useState<string | null>(search.mission ?? null);
  const [tab, setTab] = useState<TabKey>(search.tab ?? "brief");

  // Load missions the user can access
  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: ["iris-studio", "missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mission[];
    },
  });

  // Auto-select first mission if none chosen
  useEffect(() => {
    if (!missionId && missions.length > 0) setMissionId(missions[0].id);
  }, [missionId, missions]);

  const getConfig = useServerFn(getIrisConfig);
  const updateConfig = useServerFn(updateIrisConfig);
  const qc = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["iris-studio", "config", missionId],
    queryFn: () => getConfig({ data: { missionId: missionId as string } }),
    enabled: Boolean(missionId),
  });

  const saveMutation = useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!missionId) throw new Error("Pick a mission first.");
      return updateConfig({ data: { missionId, patch } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iris-studio", "config", missionId] });
      toast.success("Saved.");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    },
  });

  const config = configQuery.data as Record<string, unknown> | undefined;
  const { headerLabel, headerFull } = useMemo(() => {
    const m = missions.find((x) => x.id === missionId);
    const name = m?.name ?? null;
    if (!name) return { headerLabel: "Select a mission", headerFull: undefined as string | undefined };
    const code = name.split(/\s*-\s*/)[0]?.trim();
    const shortCode = code && code.length <= 12 ? code : name.slice(0, 12);
    return { headerLabel: shortCode, headerFull: name };
  }, [missions, missionId]);

  return (
    <div className="min-h-screen" style={{ background: "#070B14", color: "white" }}>
      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="uppercase tracking-[0.16em] text-[10px]" style={{ color: GOLD }}>
              IRIS STUDIO
            </div>
            <h1 className="text-2xl font-semibold mt-1" title={headerFull}>IRIS Studio · {headerLabel}</h1>
            <p className="text-[11px] mt-1 text-white/50">
              Per-mission IRIS voice, language, and behavior configuration.
            </p>
          </div>
          <div className="w-[260px]">
            <Select value={missionId ?? ""} onValueChange={(v) => setMissionId(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Choose a mission" />
              </SelectTrigger>
              <SelectContent>
                {missions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name ?? m.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="personality">Personality</TabsTrigger>
            <TabsTrigger value="brief">Brief Settings</TabsTrigger>
            <TabsTrigger value="evaluator">Evaluator Persona</TabsTrigger>
            <TabsTrigger value="voice">Voice Studio</TabsTrigger>
            <TabsTrigger value="language">Language &amp; Inclusion</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {!missionId ? (
              <div className="text-white/50 text-[13px]">Pick a mission to configure IRIS.</div>
            ) : configQuery.isLoading || !config ? (
              <div className="text-white/40 text-[13px]">Loading config…</div>
            ) : (
              <>
                <TabsContent value="brief">
                  <BriefSettingsTab config={config} onSave={(p) => saveMutation.mutate(p)} saving={saveMutation.isPending} />
                </TabsContent>
                <TabsContent value="language">
                  <LanguageInclusionTab
                    missionId={missionId}
                    config={config}
                    onSave={(p) => saveMutation.mutate(p)}
                    saving={saveMutation.isPending}
                    autoRunAudit={search.tab === "language"}
                  />
                </TabsContent>
                <TabsContent value="evaluator">
                  <EvaluatorPersonaTab config={config} onSave={(p) => saveMutation.mutate(p)} saving={saveMutation.isPending} />
                </TabsContent>
                <TabsContent value="voice">
                  <VoiceStudioTab config={config} onSave={(p) => saveMutation.mutate(p)} saving={saveMutation.isPending} />
                </TabsContent>
                <TabsContent value="personality">
                  <PersonalityTab config={config} onSave={(p) => saveMutation.mutate(p)} saving={saveMutation.isPending} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
