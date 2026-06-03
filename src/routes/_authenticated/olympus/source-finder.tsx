import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, ArrowRight, CircleDot, Plus } from "lucide-react";
import { listPrograms } from "@/lib/atlas-intelligence.functions";
import {
  activateCanonStarterKit,
  discoverProgramSources,
  createProgram,
} from "@/lib/atlas-onboarding.functions";
import { layerCounts } from "@/lib/atlas-sources.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/olympus/source-finder")({
  component: SourceFinderPage,
});

function SourceFinderPage() {
  const qc = useQueryClient();
  const listProgs = useServerFn(listPrograms);
  const discover = useServerFn(discoverProgramSources);
  const activate = useServerFn(activateCanonStarterKit);
  const counts = useServerFn(layerCounts);
  const create = useServerFn(createProgram);

  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: progData, isLoading } = useQuery({
    queryKey: ["sf-programs"],
    queryFn: () => listProgs({ data: {} }),
  });
  const { data: layerCountMap = {} as Record<string, number> } = useQuery({
    queryKey: ["sf-layer-counts"],
    queryFn: () => counts({ data: {} }),
  });
  const programs = progData?.programs ?? [];
  const canonCount = (layerCountMap as any).canon ?? 0;

  async function sweep(code: string, name: string) {
    setSweepingId(code);
    try {
      const r: any = await discover({ data: { programCode: code } });
      toast.success(`IRIS found ${r.inserted ?? 0} new candidates for ${name}. Check Review Queue.`);
      qc.invalidateQueries({ queryKey: ["olympus-review-queue-count"] });
      qc.invalidateQueries({ queryKey: ["sf-programs"] });
    } catch (e: any) {
      toast.error(e.message ?? "Discovery failed");
    } finally {
      setSweepingId(null);
    }
  }

  async function runStarter() {
    setActivating(true);
    try {
      const r: any = await activate({ data: {} as any });
      toast.success(`Canon: ${r.inserted} added, ${r.skipped} already present.`);
      qc.invalidateQueries({ queryKey: ["sf-layer-counts"] });
    } catch (e: any) {
      toast.error(e.message ?? "Canon activation failed");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <div
          className="flex items-center gap-2"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--iris, #22d3ee)" }}
        >
          <CircleDot size={10} /> Source Finder
        </div>
        <h1 className="mt-2 text-2xl font-light tracking-wide">Tell IRIS what to search for.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          IRIS finds authoritative sources. You approve. IRIS ingests.
        </p>
      </header>

      {/* Canon status */}
      <section
        className="mb-8 flex items-center justify-between rounded-lg border p-5"
        style={{ borderColor: "rgba(196,154,34,0.4)", background: "rgba(196,154,34,0.06)" }}
      >
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#C49A22" }}>
            ⊕ Athena Canon
          </div>
          <div className="mt-1 text-lg">{canonCount} federal sources ingested</div>
          <div className="text-xs text-muted-foreground">Foundation knowledge available to every mission.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runStarter}
            disabled={activating}
            className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "#C49A22", color: "#0b0b0b" }}
          >
            {activating ? <Loader2 className="inline h-4 w-4 animate-spin" /> : canonCount > 0 ? "Re-run Starter Kit" : "Activate Canon"}
          </button>
          <Link to="/olympus/canon-library" className="text-xs text-muted-foreground hover:text-foreground">
            Review Canon →
          </Link>
        </div>
      </section>

      {/* Active programs */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Active Programs</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover"
          >
            <Plus size={12} /> New Program
          </button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading programs…</div>
        ) : programs.length === 0 ? (
          <EmptyState
            variant="iris"
            title="● No sources ingested yet."
            description="Create a program above to let IRIS find its authoritative sources. Discovery takes about 20 minutes."
          />
        ) : (
          <div className="grid gap-3">
            {programs.map((p: any) => (
              <div key={p.program_code} className="flex items-center justify-between rounded-lg border border-border bg-surface/40 p-4">
                <div>
                  <div className="text-sm font-medium">{p.program_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.state_code ?? "—"} · {p.program_type ?? "Medicaid program"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {p.source_count ?? 0} sources ingested
                  </div>
                </div>
                <button
                  onClick={() => sweep(p.program_code, p.program_name)}
                  disabled={sweepingId === p.program_code}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                  style={{ borderColor: "rgba(34,211,238,0.4)", color: "var(--iris, #22d3ee)" }}
                >
                  {sweepingId === p.program_code ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {p.source_count > 0 ? "Sweep" : "Find Sources"} <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreate && <CreateProgramDialog onClose={() => setShowCreate(false)} create={create} qc={qc} />}
    </div>
  );
}

function CreateProgramDialog({ onClose, create, qc }: { onClose: () => void; create: any; qc: any }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await create({
        data: {
          program_code: code.toUpperCase(),
          program_name: name,
          state_code: state.toUpperCase(),
          program_type: type || undefined,
        },
      });
      toast.success("Program created.");
      qc.invalidateQueries({ queryKey: ["sf-programs"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6">
        <h3 className="text-lg font-medium">New Program</h3>
        <div className="mt-4 space-y-3">
          <Input label="Code (A-Z0-9_)" value={code} onChange={setCode} placeholder="NJ_CSOC" />
          <Input label="Name" value={name} onChange={setName} placeholder="NJ Children's System of Care" />
          <Input label="State (2-letter)" value={state} onChange={setState} placeholder="NJ" maxLength={2} />
          <Input label="Program Type" value={type} onChange={setType} placeholder="Behavioral Health" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !code || !name || state.length !== 2}
            className="rounded-md bg-[#C49A22] px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, maxLength }: any) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
