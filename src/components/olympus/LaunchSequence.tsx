import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, Rocket } from "lucide-react";
import {
  lockMissionContext, countVault, countOracle, buildEvaluationMap,
  countStudio, countMonitoring, notifyTeam,
} from "@/lib/mission-launch.functions";
import { generateInitialBriefing, indexMissionInputs } from "@/lib/mission-iris.functions";

type StepState = "pending" | "running" | "done" | "error";
type Step = { id: string; label: (count?: string) => string; run: () => Promise<string | null>; state: StepState; count?: string };

interface Props {
  missionId: string;
  onClose: () => void;
  onView: () => void;
}

/**
 * Animated 8-step launch sequence. Each step calls a server fn; once it
 * resolves we surface its live count and start the next step. Total runtime
 * ~3-5s on a warm backend.
 */
export function LaunchSequence({ missionId, onClose, onView }: Props) {
  const lock = useServerFn(lockMissionContext);
  const vault = useServerFn(countVault);
  const oracle = useServerFn(countOracle);
  const evalMap = useServerFn(buildEvaluationMap);
  const studio = useServerFn(countStudio);
  const monitoring = useServerFn(countMonitoring);
  const team = useServerFn(notifyTeam);
  const briefing = useServerFn(generateInitialBriefing);
  const indexer = useServerFn(indexMissionInputs);

  const stepsRef = useRef<Step[]>([
    { id: "lock", label: () => "Mission Context Locked", state: "pending",
      run: async () => { await lock({ data: { missionId } }); return null; } },
    { id: "vault", label: (c) => `Vault Populated (${c ?? 0} documents indexed)`, state: "pending",
      run: async () => { const r = await vault({ data: { missionId } }); return String(r.count); } },
    { id: "oracle", label: (c) => `Oracle Seeded (${c ?? 0} intel cards generated)`, state: "pending",
      run: async () => { const r = await oracle({ data: { missionId } }); return String(r.count); } },
    { id: "evalmap", label: (c) => `Evaluation Priority Map Built (${c ?? 0} questions tagged)`, state: "pending",
      run: async () => { const [r] = await Promise.all([evalMap({ data: { missionId } }), indexer({ data: { missionId } })]); return String(r.count); } },
    { id: "studio", label: (c) => `Studio Generated (${c})`, state: "pending",
      run: async () => { const r = await studio({ data: { missionId } }); return `${r.questions} questions · ${r.writers} writers assigned`; } },
    { id: "briefing", label: () => "IRIS Briefing Delivered to Brief Room", state: "pending",
      run: async () => { await briefing({ data: { missionId } }); return null; } },
    { id: "monitor", label: (c) => `Monitoring Active (Watching ${c ?? 0} sources)`, state: "pending",
      run: async () => { const r = await monitoring({ data: { missionId } }); return String(r.count); } },
    { id: "team", label: (c) => `Team Notified (${c ?? 0})`, state: "pending",
      run: async () => { const r = await team({ data: { missionId } }); return String(r.count); } },
  ]);
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < stepsRef.current.length; i++) {
        if (cancelled) return;
        const s = stepsRef.current[i];
        s.state = "running"; force((x) => x + 1);
        try {
          const count = await s.run();
          if (cancelled) return;
          s.count = count ?? undefined;
          s.state = "done"; force((x) => x + 1);
          await new Promise((r) => setTimeout(r, 280));
        } catch (e: any) {
          s.state = "error"; force((x) => x + 1);
          setErrored(e?.message ?? "Step failed");
          return;
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-xl rounded-xl border border-border bg-background shadow-2xl">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${ready ? "bg-emerald-500/15" : "bg-[#C49A22]/15"}`}>
              {ready ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Rocket className="h-5 w-5 text-[#C49A22] animate-pulse" />}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] font-mono text-muted-foreground">
                {ready ? "Mission Ready" : "Intelligence Engine Activating"}
              </div>
              <div className="text-lg font-light">{ready ? "All systems online." : "Generating mission surfaces…"}</div>
            </div>
          </div>

          <ol className="mt-7 space-y-2.5">
            {stepsRef.current.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 shrink-0">
                  {s.state === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {s.state === "running" && <Loader2 className="h-4 w-4 animate-spin text-[#C49A22]" />}
                  {s.state === "pending" && <span className="block h-2 w-2 rounded-full bg-border" />}
                  {s.state === "error" && <span className="block h-2 w-2 rounded-full bg-destructive" />}
                </span>
                <span className={s.state === "pending" ? "text-muted-foreground" : "text-foreground"}>
                  {s.label(s.count)}
                </span>
              </li>
            ))}
          </ol>

          {errored && (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {errored}
            </div>
          )}

          <div className="mt-7 flex items-center justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">
              Stay in Olympus
            </button>
            <button
              onClick={onView}
              disabled={!ready}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              View Mission Home <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
