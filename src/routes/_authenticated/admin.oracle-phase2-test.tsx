import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { extractAllSourcesForMission } from "@/lib/oracle-extract-source.functions";
import { densifyMissionGraphEdges } from "@/lib/oracle-densify-graph.functions";
import { generateOracleAnswer } from "@/lib/oracle-answer.functions";

export const Route = createFileRoute("/_authenticated/admin/oracle-phase2-test")({
  component: TestPage,
});

const MISSION_ID = "128da20f-9479-4108-b6b9-0017595509b1";

function TestPage() {
  const extract = useServerFn(extractAllSourcesForMission);
  const densify = useServerFn(densifyMissionGraphEdges);
  const answer = useServerFn(generateOracleAnswer);
  const [out, setOut] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      const r = await fn();
      setOut((o) => ({ ...o, [name]: r }));
    } catch (e) {
      setOut((o) => ({ ...o, [name]: { error: String(e instanceof Error ? e.message : e) } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "monospace", maxWidth: 1100 }}>
      <h1>ORACLE Phase 2 Test — mission {MISSION_ID}</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          data-testid="btn-extract"
          disabled={!!busy}
          onClick={() => run("extract", () => extract({ data: { mission_id: MISSION_ID } }))}
        >
          {busy === "extract" ? "Extracting…" : "1. Extract all non-RFP sources"}
        </button>
        <button
          data-testid="btn-densify"
          disabled={!!busy}
          onClick={() => run("densify", () => densify({ data: { mission_id: MISSION_ID } }))}
        >
          {busy === "densify" ? "Densifying…" : "2. Densify graph edges"}
        </button>
        <button
          data-testid="btn-answer"
          disabled={!!busy}
          onClick={() =>
            run("answer", () =>
              answer({
                data: {
                  mission_id: MISSION_ID,
                  prompt: "Summarize the top three risks and the strongest proof points for this mission.",
                  prompt_type: "manual",
                },
              }),
            )
          }
        >
          {busy === "answer" ? "Answering…" : "3. Generate ORACLE answer"}
        </button>
      </div>
      <pre data-testid="results" style={{ background: "#111", color: "#0f0", padding: 12, fontSize: 12, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}
