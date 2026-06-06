// Mission Activation Wizard — 3-step modal that replaces the old "Create New Mission" form.
// Step 1: setup, Step 2: upload core documents (RFP triggers parser, all docs go through IRIS extraction),
// Step 3: animated IRIS activation, then "Enter Mission →".

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  X, Upload, ArrowRight, CheckCircle2, FileText, Zap, Sparkles, Loader2, AlertCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logOlympusAction } from "@/lib/audit";
import { parseRfpDocument } from "@/lib/rfp-parser.functions";
import {
  extractDocumentIntelligence,
  regenerateBriefingBook,
} from "@/lib/mission-activation.functions";
import { kickoffMissionIris } from "@/lib/iris-kickoff.functions";
import { MissionLaunchMoment } from "@/components/v2/MissionLaunchMoment";

// ─── Categories shown in the activation upload step ────────────────────────
type WizardCategory =
  | "RFP"
  | "Amendments"
  | "Q&A Documents"
  | "State Intelligence"
  | "Competitive Intel"
  | "Client Direction"
  | "Research"
  | "Meeting Notes"
  | "Other";

const CATEGORIES: { key: WizardCategory; label: string; hint: string; required?: boolean }[] = [
  { key: "RFP", label: "RFP (primary)", hint: "triggers question parsing + IRIS seed", required: true },
  { key: "Amendments", label: "Amendments", hint: "updates question records" },
  { key: "Q&A Documents", label: "Q&A Documents", hint: "adds to question context" },
  { key: "State Intelligence", label: "State Intelligence", hint: "feeds IRIS state priorities" },
  { key: "Competitive Intel", label: "Competitive Intel", hint: "feeds IRIS competitor signals" },
  { key: "Client Direction", label: "Client Direction", hint: "feeds IRIS procurement priorities" },
  { key: "Research", label: "Research", hint: "feeds IRIS relevant research" },
  { key: "Meeting Notes", label: "Meeting Notes", hint: "feeds IRIS context" },
  { key: "Other", label: "Other", hint: "miscellaneous reference" },
];

type WizardStep = 1 | 2 | 3;

type UploadedFile = {
  id: string; // local id
  documentId: string | null;
  filename: string;
  category: WizardCategory;
  isRfp: boolean;
  status: "uploading" | "indexing" | "ready" | "failed";
  error?: string;
  questionsCreated?: number;
};

type WizardProps = {
  onClose: () => void;
  // When provided, skip Step 1 and reuse this mission row (e.g. clicked "Activate" on a Draft).
  resumeMissionId?: string;
  initialName?: string;
  initialClient?: string;
};

export function MissionActivationWizard({ onClose, resumeMissionId, initialName, initialClient }: WizardProps) {
  const [step, setStep] = useState<WizardStep>(resumeMissionId ? 2 : 1);
  const [missionId, setMissionId] = useState<string | null>(resumeMissionId ?? null);
  const [missionName, setMissionName] = useState<string>(initialName ?? "");
  const [missionClient, setMissionClient] = useState<string>(initialClient ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-3xl rounded-xl border border-[#2a3a55] bg-[#0f172a] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[#C49A22]" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                Mission Activation
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {step === 1 ? "Set up the mission" : step === 2 ? "Feed the intelligence" : "IRIS is activating"}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Stepper */}
        <Stepper step={step} />

        <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Step1Setup
              defaultName={missionName}
              defaultClient={missionClient}
              onCreated={(row) => {
                setMissionId(row.id);
                setMissionName(row.name);
                setMissionClient(row.client);
                setStep(2);
              }}
              onCancel={onClose}
            />
          )}
          {step === 2 && missionId && (
            <Step2Uploads
              missionId={missionId}
              missionName={missionName}
              onActivate={() => setStep(3)}
            />
          )}
          {step === 3 && missionId && (
            <Step3Activation
              missionId={missionId}
              missionName={missionName}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
  const steps: { n: WizardStep; label: string }[] = [
    { n: 1, label: "Setup" },
    { n: 2, label: "Upload Core Documents" },
    { n: 3, label: "IRIS Activation" },
  ];
  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-3">
      {steps.map((s, i) => {
        const active = step === s.n;
        const done = step > s.n;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                active ? "bg-[#C49A22] text-black" : done ? "bg-emerald-500/30 text-emerald-300" : "bg-white/10 text-muted-foreground"
              }`}
            >
              {done ? "✓" : s.n}
            </div>
            <span className={`text-[11px] uppercase tracking-[0.18em] ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="mx-3 h-px flex-1 bg-white/10" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Setup ─────────────────────────────────────────────────────────

function Step1Setup({
  defaultName, defaultClient, onCreated, onCancel,
}: {
  defaultName: string;
  defaultClient: string;
  onCreated: (row: { id: string; name: string; client: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [client, setClient] = useState(defaultClient);
  const [state, setState] = useState("");
  const [submission, setSubmission] = useState("");
  const [description, setDescription] = useState("");
  const [slack, setSlack] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !client.trim()) {
      setErr("Mission name and client are required.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user }, error: ue } = await supabase.auth.getUser();
      if (ue || !user) throw new Error(ue?.message ?? "Not authenticated");
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: user.email?.split("@")[0] ?? "User", email: user.email ?? null },
        { onConflict: "id" },
      );
      const insertRow: Record<string, unknown> = {
        name: name.trim(),
        client: client.trim(),
        state: state.trim() || null,
        submission_date: submission || null,
        description: description.trim() || null,
        status: "Draft",
        health: "Yellow",
        created_by: user.id,
      };
      const { data, error } = await supabase
        .from("missions")
        .insert(insertRow as never)
        .select("id, name, client")
        .single();
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("Created but no id returned.");
      if (slack.trim()) {
        await supabase.rpc("set_mission_slack_webhook" as never, {
          _mission_id: data.id,
          _webhook: slack.trim(),
        } as never);
      }
      await logOlympusAction({
        action_type: "mission.create",
        action_summary: `Created mission "${name.trim()}"`,
        mission_id: data.id,
        target_table: "missions",
        target_id: data.id,
      });
      window.localStorage.setItem("olympus:mission", data.id);
      window.dispatchEvent(new CustomEvent("olympus:mission-changed", { detail: data.id }));
      onCreated({ id: data.id, name: data.name, client: data.client });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create mission");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Mission name *">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Indiana Medicaid RFP"
          className="input"
        />
      </Field>
      <Field label="Client *">
        <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Indiana FSSA" className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State">
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="IN" className="input" />
        </Field>
        <Field label="Submission date">
          <input type="date" value={submission} onChange={(e) => setSubmission(e.target.value)} className="input" />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="Optional context for the team."
          className="input"
        />
      </Field>
      <Field label="Slack webhook (optional)">
        <input
          value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/…"
          className="input"
        />
      </Field>
      {err && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
      <footer className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
          Cancel
        </button>
        <button
          type="submit" disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
      <style>{`
        .input { width: 100%; border-radius: 0.375rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: inherit; }
        .input:focus { outline: none; box-shadow: 0 0 0 1px hsl(var(--primary)); }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Step 2 — Uploads ───────────────────────────────────────────────────────

function Step2Uploads({
  missionId, missionName, onActivate,
}: {
  missionId: string;
  missionName: string;
  onActivate: () => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<WizardCategory>("RFP");
  const fileInput = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const extractFn = useServerFn(extractDocumentIntelligence);
  const parseRfpFn = useServerFn(parseRfpDocument);
  const kickoffIrisFn = useServerFn(kickoffMissionIris);
  // Ensure the auto-IRIS kickoff only fires once per wizard session — even if
  // multiple RFPs are uploaded — to avoid stacking long-running brief loops.
  const irisKickedOffRef = useRef(false);

  // Hydrate from existing mission_library rows so reopening the wizard
  // (or resuming a Draft) shows previously uploaded documents instead of an empty list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("id, name, category, is_rfp")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      setFiles((prev) => {
        const existingDocIds = new Set(prev.map((f) => f.documentId).filter(Boolean));
        const hydrated: UploadedFile[] = data
          .filter((d: any) => !existingDocIds.has(d.id))
          .map((d: any) => ({
            id: d.id,
            documentId: d.id,
            filename: d.name,
            category: (d.category as WizardCategory) ?? "Other",
            isRfp: !!d.is_rfp,
            status: "ready",
          }));
        return [...prev, ...hydrated];
      });
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  // Categories already represented by at least one ready/indexing upload
  const fulfilledCategories = new Set(files.filter((f) => f.status !== "failed").map((f) => f.category));


  const processFile = useCallback(async (file: File, category: WizardCategory) => {
    const localId = crypto.randomUUID();
    const isRfp = category === "RFP";
    const newRow: UploadedFile = {
      id: localId,
      documentId: null,
      filename: file.name,
      category,
      isRfp,
      status: "uploading",
    };
    setFiles((prev) => [newRow, ...prev]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Supabase storage rejects keys with certain chars (~, spaces, etc).
      // Sanitize the filename for the storage path; keep original `file.name` in the DB row.
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\w.\-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
      const path = `${missionId}/${Date.now()}-${safeName || "upload"}`;
      const { error: upErr } = await supabase.storage.from("mission-library").upload(path, file);
      if (upErr) throw upErr;
      const { data: row, error } = await supabase.from("mission_library").insert({
        mission_id: missionId,
        name: file.name,
        category,
        file_path: path,
        file_size: file.size,
        is_rfp: isRfp,
        added_by: user?.email ?? null,
        added_by_id: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      const documentId = row!.id as string;

      setFiles((prev) => prev.map((f) => (f.id === localId ? { ...f, documentId, status: "indexing" } : f)));

      // RFP → parse questions
      let questionsCreated: number | undefined;
      if (isRfp) {
        try {
          const res: any = await parseRfpFn({ data: { documentId } });
          questionsCreated = res?.inserted ?? 0;

          // Auto-IRIS: the moment we have questions, kick off the IRIS pipeline
          // (morning briefs across every question). Fire-and-forget so the
          // wizard UI stays responsive; the kickoff fn tracks its own state on
          // `missions.iris_kickoff_status`. Guarded so only the first RFP in
          // this session triggers it.
          if ((questionsCreated ?? 0) > 0 && !irisKickedOffRef.current) {
            irisKickedOffRef.current = true;
            void kickoffIrisFn({ data: { missionId } }).catch((e) => {
              console.warn("IRIS kickoff failed", e?.message);
              irisKickedOffRef.current = false; // allow a retry on activate()
            });
          }
        } catch (e: any) {
          // non-fatal — still index for IRIS
          console.warn("RFP parsing failed", e?.message);
        }
      }

      // IRIS RFP extraction — only run on the RFP itself. Other vault docs
      // (style guides, research, crosswalks) don't need full RFP config
      // extraction and would block the upload row in "indexing" for ~60s.
      if (isRfp) {
        try {
          await extractFn({ data: { documentId } });
        } catch (e: any) {
          console.warn("IRIS extraction failed", e?.message);
        }
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === localId ? { ...f, status: "ready", questionsCreated } : f)),
      );
    } catch (e: any) {
      setFiles((prev) =>
        prev.map((f) => (f.id === localId ? { ...f, status: "failed", error: e?.message ?? "Failed" } : f)),
      );
      toast.error(`${file.name}: ${e?.message ?? "Failed"}`);
    }
  }, [missionId, extractFn, parseRfpFn, kickoffIrisFn]);

  function handleFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((f) => processFile(f, pendingCategory));
  }

  async function activate() {
    // Flip mission to Active
    const { error } = await supabase.from("missions").update({ status: "Active" }).eq("id", missionId);
    if (error) { toast.error(error.message); return; }
    await logOlympusAction({
      action_type: "mission.activate",
      action_summary: `Activated mission "${missionName}"`,
      mission_id: missionId,
      target_table: "missions",
      target_id: missionId,
    });

    // Safety-net kickoff: if RFP parsing didn't fire IRIS yet (e.g. the user
    // skipped the RFP, or the parse happened in a previous session), kick it
    // off now. The server fn is idempotent — it skips if a run is already in
    // flight and won't re-brief questions that already have one.
    void kickoffIrisFn({ data: { missionId } }).catch((e) => {
      console.warn("IRIS kickoff failed", e?.message);
    });

    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    qc.invalidateQueries({ queryKey: ["hq-missions"] });
    onActivate();
  }

  const indexing = files.some((f) => f.status === "indexing" || f.status === "uploading");

  return (
    <div className="space-y-5">
      {/* Drag-and-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-[#C49A22] bg-[#C49A22]/10" : "border-white/15 bg-white/[0.02] hover:border-white/30"
        }`}
      >
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Drop documents here or click to browse</div>
        <p className="mt-1 text-xs text-muted-foreground">
          IRIS will read every file you upload and use it to score, brief, and answer for this mission.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <select
            value={pendingCategory}
            onChange={(e) => setPendingCategory(e.target.value as WizardCategory)}
            className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md bg-[#C49A22] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#D4AA32]"
          >
            Browse files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); if (fileInput.current) fileInput.current.value = ""; }}
          />
        </div>
      </div>

      {/* Categorized checklist */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What IRIS needs to get smart
        </div>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CATEGORIES.map((c) => {
            const ok = fulfilledCategories.has(c.key);
            return (
              <li key={c.key} className="flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${ok ? "border-emerald-400 bg-emerald-400/20" : "border-white/30"}`}>
                  {ok && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    {c.label} {c.required && <span className="text-[10px] text-[#C49A22]">required</span>}
                  </div>
                  <div className="text-muted-foreground">{c.hint}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Per-file rows */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Uploaded files
          </div>
          {files.map((f) => (
            <div key={f.id} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{f.filename}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">{f.category}</span>
                    {f.status === "uploading" && <span className="text-amber-300">Uploading…</span>}
                    {f.status === "indexing" && <span className="text-[#C49A22]">IRIS is reading…</span>}
                    {f.status === "ready" && (
                      <span className="text-emerald-400 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Processed by IRIS
                        {f.questionsCreated !== undefined && f.questionsCreated > 0 && (
                          <span className="ml-2 text-foreground">· {f.questionsCreated} questions created</span>
                        )}
                      </span>
                    )}
                    {f.status === "failed" && (
                      <span className="text-red-400 inline-flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {f.error ?? "Failed"}
                      </span>
                    )}
                  </div>
                </div>
                {(f.status === "uploading" || f.status === "indexing") && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#C49A22]" />
                )}
              </div>
              {(f.status === "uploading" || f.status === "indexing") && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-1/2 animate-pulse bg-[#C49A22]/60" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={activate}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip for now — I'll add documents later
        </button>
        <button
          type="button"
          onClick={activate}
          disabled={indexing}
          className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
        >
          <Zap className="h-4 w-4" /> Activate Mission <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}

// ─── Step 3 — IRIS Activation ───────────────────────────────────────────────

function Step3Activation({
  missionId, missionName, onClose,
}: {
  missionId: string;
  missionName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const regenFn = useServerFn(regenerateBriefingBook);
  const [phase, setPhase] = useState(0); // 0..4 → 4 = ready
  const [launching, setLaunching] = useState(false);
  const [summary, setSummary] = useState<{
    questions: number;
    documents: number;
    indexed: number;
    briefingReady: boolean;
  } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function run() {
      // Phase 0 → 1 small delay so the user sees the animation.
      await delay(700);
      if (!cancelled) setPhase(1);

      // Counts (questions + documents + indexed)
      const [{ count: qCount }, { count: docCount }, { count: indexedCount }] = await Promise.all([
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("document_extractions").select("document_id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      const docs = docCount ?? 0;
      await delay(700);
      if (!cancelled) setPhase(2);

      // Briefing book regen (best-effort; rate limits are okay)
      let briefingReady = false;
      try {
        const res: any = await regenFn({ data: { missionId, onlyStale: true } });
        briefingReady = (res?.generated ?? 0) > 0 || (res?.skipped ?? 0) > 0;
      } catch {
        briefingReady = false;
      }
      await delay(800);
      if (!cancelled) setPhase(3);

      await delay(600);
      if (!cancelled) {
        setSummary({
          questions: qCount ?? 0,
          documents: docs,
          indexed: indexedCount ?? 0,
          briefingReady: briefingReady || docs === 0,
        });
        setPhase(4);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [missionId, regenFn]);

  const lines = [
    "IRIS is reading your documents…",
    "IRIS is building question intelligence…",
    "IRIS is seeding your Oracle…",
    "IRIS is ready.",
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#C49A22]/30 bg-[#C49A22]/[0.06] p-5">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="h-5 w-5 text-[#C49A22] animate-pulse" />
          <div className="text-sm font-semibold">Activating {missionName}</div>
        </div>
        <ul className="space-y-2">
          {lines.map((line, i) => {
            const active = phase === i;
            const done = phase > i;
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 flex items-center justify-center">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#C49A22]" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  )}
                </div>
                <span className={done ? "text-foreground" : active ? "text-[#C49A22]" : "text-muted-foreground"}>
                  {line}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {summary && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            Activation Summary
          </div>
          <SummaryRow label="Questions created" value={summary.questions} highlight={summary.questions > 0} />
          <SummaryRow label="Documents indexed" value={`${summary.indexed} of ${summary.documents}`} highlight={summary.indexed > 0} />
          <SummaryRow
            label="Oracle"
            value={summary.briefingReady ? "ready" : "pending"}
            highlight={summary.briefingReady}
          />
          <SummaryRow label="IRIS status" value="Active" highlight />
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setLaunching(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32]"
            >
              Enter Mission <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {launching && (
        <MissionLaunchMoment
          missionName={missionName}
          onComplete={() => {
            onClose();
            navigate({ to: "/missions/$missionId/brief", params: { missionId } });
          }}
        />
      )}
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>{value}</span>
    </div>
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
