import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink, Check, X, Sparkles, ShieldCheck, Plus, FileUp } from "lucide-react";
import { listAtlasSources } from "@/lib/atlas-sources.functions";
import { setSourceStatus } from "@/lib/atlas-onboarding.functions";
import { seedStarterCanon, verifyCanon } from "@/lib/canon-seed.functions";
import { AddCanonModal } from "@/components/canon/AddCanonModal";
import { ExtractCanonModal } from "@/components/canon/ExtractCanonModal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/canon-library")({
  component: CanonLibraryPage,
});

const CATEGORIES = [
  "Federal Statutes",
  "Federal Regulations",
  "CMS Guidance",
  "Medicaid Authorities",
  "Medicare Authorities",
  "MACPAC / MedPAC",
  "KFF Reference",
  "Athena Playbooks",
  "Athena Methodologies",
  "Writing Standards",
];

function CanonLibraryPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const list = useServerFn(listAtlasSources);
  const setFn = useServerFn(setSourceStatus);
  const seedFn = useServerFn(seedStarterCanon);
  const verifyFn = useServerFn(verifyCanon);

  const { data } = useQuery({
    queryKey: ["canon-lib"],
    queryFn: () => list({ data: { layer: "canon" } }),
  });
  const all = data?.sources ?? [];
  const filtered = category ? all.filter((s: any) => s.library_category === category) : all;
  const pending = all.filter((s: any) => s.status === "under_review");

  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    all.forEach((s: any) => {
      const c = s.library_category ?? "Uncategorized";
      m[c] = (m[c] ?? 0) + 1;
    });
    return m;
  }, [all]);

  async function review(id: string, status: "active" | "archived") {
    try {
      await setFn({ data: { ids: [id], status } });
      toast.success(status === "active" ? "Canon source approved." : "Source rejected.");
      qc.invalidateQueries({ queryKey: ["canon-lib"] });
      qc.invalidateQueries({ queryKey: ["olympus-review-queue-count"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const r = await seedFn({});
      toast.success(
        r.inserted > 0
          ? `Seeded ${r.inserted} starter Canon entries (${r.skipped} already existed).`
          : `All ${r.skipped} starter entries already present.`,
      );
      qc.invalidateQueries({ queryKey: ["canon-lib"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await verifyFn({});
      setVerifyResult(r);
      if (r.activeCount === 0) {
        toast.error("No active Canon entries found. Click Seed Starter Canon first.");
      } else if (!r.irisIncludesCanon) {
        toast.error("Canon entries exist but IRIS prompt is missing them.");
      } else {
        toast.success(`Verified — ${r.irisCanonLineCount} Canon entries injected into IRIS prompt.`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#C49A22" }}>⊕ Canon</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-light tracking-wide">
            <BookOpen size={22} /> Canon Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            The foundation every mission is built on. Federal regulations, CMS authorities, and Athena institutional knowledge.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
            title="Confirm Canon entries exist AND are being injected into IRIS prompts."
          >
            <ShieldCheck size={12} /> {verifying ? "Checking…" : "Verify Canon"}
          </button>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
            title="Insert a starter pack of Athena Canon entries. Idempotent."
          >
            <Sparkles size={12} /> {seeding ? "Seeding…" : "Seed Starter"}
          </button>
          <button
            onClick={() => setShowExtract(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-surface-hover"
            title="Upload a PDF/DOCX. IRIS extracts and proposes Canon entries you can review and save."
          >
            <FileUp size={12} /> Extract from Doc
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "#C49A22", color: "#0b0b0b" }}
          >
            <Plus size={12} /> Add Entry
          </button>
        </div>
      </header>

      {showAdd && <AddCanonModal onClose={() => setShowAdd(false)} />}
      {showExtract && <ExtractCanonModal onClose={() => setShowExtract(false)} />}

      {verifyResult && (
        <div
          className="mb-5 rounded-md border px-4 py-3 text-xs"
          style={{
            borderColor: verifyResult.irisIncludesCanon ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
            background: verifyResult.irisIncludesCanon ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            color: verifyResult.irisIncludesCanon ? "#86efac" : "#fca5a5",
          }}
        >
          <div className="font-medium">
            {verifyResult.irisIncludesCanon ? "✓ Canon is live in IRIS prompts" : "✗ Canon not reaching IRIS"}
          </div>
          <div className="mt-1 text-muted-foreground">
            {verifyResult.activeCount} active entries · {verifyResult.irisCanonLineCount} injected into next prompt · {verifyResult.promptCharsForCanon.toLocaleString()} chars
          </div>
          {verifyResult.sampleTopics?.length > 0 && (
            <div className="mt-1 text-muted-foreground">
              Sample topics: {verifyResult.sampleTopics.join(" · ")} {verifyResult.allSampleTopicsInPrompt ? "✓ all present" : "⚠ some missing from prompt"}
            </div>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div
          className="mb-5 rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", color: "#fbbf24" }}
        >
          ⚠ {pending.length} Canon source{pending.length === 1 ? "" : "s"} pending your approval.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px,1fr]">
        <aside className="space-y-0.5">
          <CategoryItem label="All Canon" count={all.length} active={category === null} onClick={() => setCategory(null)} />
          <div className="my-2 border-t border-border" />
          {CATEGORIES.map((c) => (
            <CategoryItem
              key={c}
              label={c}
              count={byCat[c] ?? 0}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </aside>

        <div>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No Canon sources in this category.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s: any) => (
                <div key={s.id} className="rounded-lg border border-border bg-surface/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{s.source_title}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                          style={{ background: "rgba(196,154,34,0.18)", color: "#C49A22" }}
                        >
                          {s.authority_score ?? "?"}/10
                        </span>
                        {s.status === "under_review" && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                            pending
                          </span>
                        )}
                      </div>
                      {s.issuing_authority && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{s.issuing_authority}</div>
                      )}
                      {s.summary && <p className="mt-1.5 text-[12px] text-muted-foreground">{s.summary}</p>}
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] hover:underline"
                          style={{ color: "var(--iris, #22d3ee)" }}
                        >
                          <ExternalLink size={10} /> {s.source_url}
                        </a>
                      )}
                    </div>
                    {s.status === "under_review" && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => review(s.id, "active")}
                          className="rounded-md px-2 py-1.5 text-xs"
                          style={{ background: "#C49A22", color: "#0b0b0b" }}
                        >
                          <Check size={12} className="inline" /> Approve
                        </button>
                        <button
                          onClick={() => review(s.id, "archived")}
                          className="rounded-md border border-red-500/30 px-2 py-1.5 text-xs text-red-300"
                        >
                          <X size={12} className="inline" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryItem({ label, count, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}
