/**
 * Phase 5 — Journey Builder (wizard step 7 of 8).
 *
 * Admin uploads an ICS / Word / PDF / TXT procurement schedule (IRIS reads
 * it) and/or asks IRIS to scan the already-uploaded RFP docs. Extracted
 * milestones land in an editable table. The submission deadline from
 * Step 2 is always seeded as a locked, undeletable Pens Down row.
 *
 * Saves are deferred: DELETE + INSERT on Continue only — no row-by-row
 * writes, so the table doesn't re-render mid-edit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractJourneyMilestones } from "@/lib/journey-extract.functions";
import { extractRFPText, detectRFPKind } from "@/lib/extract-rfp-text.browser";
import { WizardStepHeading } from "./WizardShellV3";

type MilestoneType =
  | "kickoff" | "pink_team" | "red_team" | "gold_team"
  | "submission" | "award" | "custom";

type Source = "original_rfp" | "client_directive" | "leader_set";

type Row = {
  key: string;
  title: string;
  date: string; // YYYY-MM-DD
  milestone_type: MilestoneType;
  is_pens_down: boolean;
  is_hard_deadline: boolean;
  source: Source;
  locked?: boolean; // submission row from Step 2
  notes?: string | null;
};

const TYPE_OPTIONS: { value: MilestoneType; label: string; color: string }[] = [
  { value: "submission", label: "Submission", color: "#ef4444" },
  { value: "kickoff", label: "Kickoff", color: "#C49A2B" },
  { value: "pink_team", label: "Pink Team", color: "#a855f7" },
  { value: "red_team", label: "Red Team", color: "#b91c1c" },
  { value: "gold_team", label: "Gold Team", color: "#f59e0b" },
  { value: "award", label: "Award", color: "#22c55e" },
  { value: "custom", label: "Custom", color: "#94a3b8" },
];

const typeColor = (t: MilestoneType) => TYPE_OPTIONS.find((o) => o.value === t)?.color ?? "#94a3b8";
const typeLabel = (t: MilestoneType) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? "Custom";

const newKey = () => `r_${Math.random().toString(36).slice(2, 10)}`;

// ICS plain-text parser. No library — just split on BEGIN:VEVENT.
function parseIcs(text: string): { title: string; date: string }[] {
  const out: { title: string; date: string }[] = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const b of blocks) {
    const end = b.indexOf("END:VEVENT");
    const body = end >= 0 ? b.slice(0, end) : b;
    const lines = body.split(/\r?\n/);
    let title = "";
    let date = "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("SUMMARY")) {
        const idx = line.indexOf(":");
        if (idx > -1) title = line.slice(idx + 1).trim();
      } else if (line.startsWith("DTSTART")) {
        const idx = line.indexOf(":");
        if (idx > -1) {
          const v = line.slice(idx + 1).trim();
          // 20260715T170000Z or 20260715
          const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
          if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
        }
      }
    }
    if (date) out.push({ title: title || "Calendar event", date });
  }
  return out;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function classifyTitle(title: string): { type: MilestoneType; pensDown: boolean; hard: boolean } {
  const t = title.toLowerCase();
  if (/(proposal\s*due|submission\s*deadline|proposals?\s*due)/.test(t))
    return { type: "submission", pensDown: true, hard: true };
  if (/(pre[-\s]?proposal\s*conference|kickoff|notice\s*of\s*intent)/.test(t))
    return { type: "kickoff", pensDown: false, hard: false };
  if (/(q&?a|questions?\s*due|last\s*day\s*for\s*questions)/.test(t))
    return { type: "custom", pensDown: false, hard: false };
  if (/(award|contract\s*award|notice\s*of\s*award)/.test(t))
    return { type: "award", pensDown: false, hard: false };
  if (/(red\s*team|internal\s*review)/.test(t)) return { type: "red_team", pensDown: false, hard: false };
  if (/(gold\s*team|final\s*review)/.test(t)) return { type: "gold_team", pensDown: false, hard: false };
  if (/(pink\s*team|first\s*draft\s*review)/.test(t)) return { type: "pink_team", pensDown: false, hard: false };
  return { type: "custom", pensDown: false, hard: false };
}

export function Step8Journey({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractJourneyMilestones);

  const { data: mission } = useQuery({
    queryKey: ["wizard-journey-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, submission_deadline")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["wizard-journey-docs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_documents")
        .select("id, title, file_url, content_summary, document_type")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ["wizard-journey-existing", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_milestones")
        .select("*")
        .eq("mission_id", missionId)
        .order("milestone_date");
      return data ?? [];
    },
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanningRfp, setScanningRfp] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Hydrate once when both mission + existing milestones are loaded.
  useEffect(() => {
    if (hydrated || existingLoading) return;
    if (!mission) return;
    const seeded: Row[] = [];
    const subDate = mission.submission_deadline
      ? String(mission.submission_deadline).slice(0, 10)
      : "";
    if (existing && existing.length > 0) {
      for (const m of existing) {
        const isSubmission = m.milestone_type === "submission";
        seeded.push({
          key: m.id ?? newKey(),
          title: m.title ?? "Submission Deadline",
          date: m.milestone_date ? String(m.milestone_date).slice(0, 10) : subDate,
          milestone_type: m.milestone_type as MilestoneType,
          is_pens_down: !!m.is_pens_down,
          is_hard_deadline: !!m.is_hard_deadline,
          source: ((m.source as Source) ?? "leader_set"),
          locked: isSubmission && !!subDate,
        });
      }
      // ensure exactly one locked submission row exists if deadline set
      if (subDate && !seeded.some((r) => r.locked && r.milestone_type === "submission")) {
        seeded.unshift({
          key: newKey(),
          title: "Submission Deadline",
          date: subDate,
          milestone_type: "submission",
          is_pens_down: true,
          is_hard_deadline: true,
          source: "original_rfp",
          locked: true,
        });
      }
    } else if (subDate) {
      seeded.push({
        key: newKey(),
        title: "Submission Deadline",
        date: subDate,
        milestone_type: "submission",
        is_pens_down: true,
        is_hard_deadline: true,
        source: "original_rfp",
        locked: true,
      });
    }
    setRows(seeded.sort((a, b) => a.date.localeCompare(b.date)));
    setHydrated(true);
  }, [hydrated, existingLoading, mission, existing]);

  const hasExistingPersisted = (existing?.length ?? 0) > 0;
  const hasMilestones = rows.length > 0;
  const submissionDeadline = mission?.submission_deadline
    ? String(mission.submission_deadline).slice(0, 10)
    : "";

  // -------- merge helper --------
  function mergeExtracted(
    extracted: { title: string; date: string; milestone_type?: MilestoneType;
                 is_pens_down?: boolean; is_hard_deadline?: boolean; notes?: string | null }[],
    src: Source,
  ) {
    setRows((cur) => {
      const next = [...cur];
      for (const e of extracted) {
        if (!e.date) continue;
        const auto = classifyTitle(e.title);
        const type: MilestoneType = e.milestone_type ?? auto.type;
        // dedupe by date + type
        const dup = next.find((r) => r.date === e.date && r.milestone_type === type);
        if (dup) continue;
        // skip if this would duplicate the locked submission
        if (type === "submission" && next.some((r) => r.locked && r.milestone_type === "submission")) continue;
        next.push({
          key: newKey(),
          title: e.title || typeLabel(type),
          date: e.date,
          milestone_type: type,
          is_pens_down: e.is_pens_down ?? auto.pensDown,
          is_hard_deadline: e.is_hard_deadline ?? auto.hard,
          source: src,
          notes: e.notes ?? null,
        });
      }
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  // -------- file upload --------
  async function handleFile(file: File) {
    setFileMeta({ name: file.name, size: file.size });
    setUploading(true);
    try {
      const name = file.name.toLowerCase();
      const kind = detectRFPKind(file);
      let text = "";

      if (name.endsWith(".ics")) {
        text = await readFileAsText(file).catch(() => "");
      } else if (kind === "pdf" || kind === "docx" || kind === "doc") {
        // Binary formats — extract with pdfjs / mammoth, not FileReader.
        try {
          text = await extractRFPText(file);
        } catch (e) {
          console.error("[journey] doc extract failed", e);
          toast.error("IRIS couldn't read that document. Try a .txt or .ics, or add milestones manually.");
          return;
        }
      } else {
        text = await readFileAsText(file).catch(() => "");
      }

      let extracted: { title: string; date: string }[] = [];

      if (name.endsWith(".ics") || /BEGIN:VEVENT/i.test(text)) {
        extracted = parseIcs(text);
        if (extracted.length === 0) {
          toast.info("No calendar events found in that ICS file.");
        } else {
          toast.success(`IRIS parsed ${extracted.length} calendar event${extracted.length === 1 ? "" : "s"}.`);
        }
        mergeExtracted(extracted, "client_directive");
      } else {
        if (!text.trim()) {
          toast.error("Couldn't read text from that file. Add milestones manually below.");
        } else {
          const res = await extractFn({ data: { text, source: "upload" } });
          if (res.milestones.length === 0) {
            toast.info("IRIS didn't find any dates in that document. Add milestones manually below.");
          } else {
            toast.success(`IRIS found ${res.milestones.length} milestone${res.milestones.length === 1 ? "" : "s"}.`);
          }
          mergeExtracted(res.milestones, "client_directive");
        }
      }
    } catch (err) {
      console.error("[journey] upload failed", err);
      toast.error("IRIS couldn't read that file. Add milestones manually below.");
    } finally {
      setUploading(false);
    }
  }

  async function extractFromRfp() {
    if (!docs?.length) {
      toast.error("No RFP documents uploaded in Step 1.");
      return;
    }
    setScanningRfp(true);
    try {
      const combined = docs
        .map((d) => `# ${d.title ?? "Untitled"}\n${d.content_summary ?? ""}`)
        .join("\n\n")
        .slice(0, 8000);
      if (!combined.trim()) {
        toast.error("Uploaded documents have no extracted text yet.");
        return;
      }
      const res = await extractFn({ data: { text: combined, source: "rfp" } });
      if (res.milestones.length === 0) {
        toast.info("IRIS didn't find dates in your RFP. Add milestones manually below.");
      } else {
        toast.success(`IRIS found ${res.milestones.length} milestone${res.milestones.length === 1 ? "" : "s"} in the RFP.`);
      }
      mergeExtracted(res.milestones, "original_rfp");
    } catch (err) {
      console.error("[journey] rfp scan failed", err);
      toast.error("IRIS scan failed. Add milestones manually below.");
    } finally {
      setScanningRfp(false);
    }
  }

  // -------- row helpers --------
  function updateRow(key: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setRows((cur) => cur.filter((r) => r.key !== key));
  }
  function togglePensDown(key: string, value: boolean) {
    setRows((cur) =>
      cur.map((r) => ({
        ...r,
        is_pens_down: r.key === key ? value : value ? false : r.is_pens_down,
      })),
    );
  }
  function addBlank() {
    setRows((cur) => [
      ...cur,
      {
        key: newKey(),
        title: "",
        date: "",
        milestone_type: "custom",
        is_pens_down: false,
        is_hard_deadline: false,
        source: "leader_set",
      },
    ]);
    // focus the new title field on next tick
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>("[data-journey-blank-title]");
      el?.focus();
    }, 0);
  }

  // -------- validation --------
  const hasPensDown = rows.some((r) => r.is_pens_down);
  const hasSubmission = rows.some((r) => r.milestone_type === "submission");
  const allFilled = rows.every((r) => r.title.trim() && r.date);
  const canAdvance = hasMilestones && hasPensDown && hasSubmission && allFilled && !saving;

  // -------- timeline preview --------
  const timeline = useMemo(() => {
    if (!hasMilestones || !submissionDeadline) return null;
    const start = Date.now();
    const end = new Date(submissionDeadline).getTime();
    if (!isFinite(end) || end <= start) return null;
    return { start, end };
  }, [hasMilestones, submissionDeadline]);
  const daysToSubmission = submissionDeadline
    ? Math.ceil((new Date(submissionDeadline).getTime() - Date.now()) / 86400000)
    : null;

  // -------- save --------
  async function handleContinue() {
    if (!canAdvance) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      // DELETE prior wizard-sourced rows
      const { error: delErr } = await supabase
        .from("mission_milestones")
        .delete()
        .eq("mission_id", missionId)
        .in("source", ["original_rfp", "client_directive", "leader_set"]);
      if (delErr) throw delErr;

      const payload = rows.map((r) => ({
        mission_id: missionId,
        milestone_type: r.milestone_type,
        title: r.title.trim(),
        milestone_date: r.date,
        is_pens_down: r.is_pens_down,
        is_hard_deadline: r.is_hard_deadline,
        is_active: true,
        source: r.source,
        status: "upcoming" as const,
        created_by: uid,
        notes: r.notes ?? null,
      }));
      const { error: insErr } = await supabase.from("mission_milestones").insert(payload);
      if (insErr) throw insErr;

      qc.invalidateQueries({ queryKey: ["wizard-journey-existing", missionId] });
      toast.success(`Saved ${payload.length} milestone${payload.length === 1 ? "" : "s"}.`);
      onAdvance();
    } catch (err) {
      console.error("[journey] save failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to save journey.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <WizardStepHeading
        title="Step 7 of 8 — Build Your Journey"
        subtitle="Upload the client's procurement calendar or let IRIS extract key dates from your RFP documents. Then review, adjust, and add anything IRIS missed."
      />

      {hasExistingPersisted && hydrated && (
        <div
          className="mb-4 rounded-md px-3 py-2 text-[12.5px]"
          style={{ background: "rgba(196,154,43,0.08)", border: "1px solid rgba(196,154,43,0.3)", color: "#E2C078" }}
        >
          Journey already configured. Edit below or re-run IRIS to refresh.
        </div>
      )}

      {/* SECTION A — INPUT LANES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT */}
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(196,154,43,0.05)", border: "1px solid rgba(196,154,43,0.4)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "#C49A2B" }} />
            <h3 className="text-[13.5px] font-medium" style={{ color: "#E2C078" }}>
              ⚡ Upload for IRIS to Read
            </h3>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".ics,.doc,.docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {fileMeta ? (
            <div className="flex items-center gap-2 rounded-md border border-white/10 p-2 text-[12.5px]">
              <FileText className="h-4 w-4 text-white/60" />
              <div className="flex-1 min-w-0 truncate">
                <div className="text-white truncate">{fileMeta.name}</div>
                <div className="text-white/45 text-[12px]">{(fileMeta.size / 1024).toFixed(1)} KB</div>
              </div>
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              ) : (
                <button onClick={() => setFileMeta(null)} className="text-white/55 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className="w-full rounded-md border border-dashed border-white/15 hover:border-amber-500/50 px-3 py-6 text-center transition-colors"
            >
              <Upload className="h-5 w-5 mx-auto mb-1.5 text-white/55" />
              <div className="text-[12.5px] text-white">Drag a file here or click to upload</div>
              <div className="text-[12px] text-white/45 mt-1">
                ICS calendar export · Word doc · PDF procurement schedule · Plain text date list
              </div>
            </button>
          )}
          {uploading && (
            <div className="mt-2 text-[12px] text-amber-300 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> IRIS is reading your document…
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.25)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-white/55" />
            <h3 className="text-[13.5px] font-medium text-white/85">📄 IRIS Will Also Read Your RFP</h3>
          </div>
          <div className="text-[12px] text-white/45 mb-2">Already uploaded in Step 1</div>
          <div className="space-y-1 max-h-28 overflow-y-auto text-[12px] text-white/70 mb-3">
            {docs?.length ? (
              docs.map((d) => (
                <div key={d.id} className="truncate">• {d.title ?? "Untitled document"}</div>
              ))
            ) : (
              <div className="text-white/40 italic">No documents found.</div>
            )}
          </div>
          <button
            onClick={extractFromRfp}
            disabled={scanningRfp || !docs?.length}
            className="w-full rounded-md px-3 py-2 text-[12.5px] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: "rgba(196,154,43,0.15)", color: "#E2C078", border: "1px solid rgba(196,154,43,0.4)" }}
          >
            {scanningRfp ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> IRIS is scanning for dates…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Extract Dates from RFP</>
            )}
          </button>
        </div>
      </div>

      <div className="my-6 text-center text-[11.5px] text-white/40">— or add milestones manually below —</div>

      {/* SECTION C — REVIEW TABLE */}
      {hasMilestones ? (
        <div className="rounded-lg border border-white/10">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-[14px] font-medium text-white">
              IRIS Found {rows.length} Milestone{rows.length === 1 ? "" : "s"} — Review and Edit
            </div>
            <div className="text-[12px] text-white/50 mt-0.5">
              Confirm what's right. Edit what's wrong. Add anything IRIS missed.
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="text-left text-[12px] text-white/45 border-b border-white/10">
                  <th className="px-3 py-2 w-[130px]">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2 w-[150px]">Date</th>
                  <th className="px-3 py-2 w-[90px] text-center">Hard</th>
                  <th className="px-3 py-2 w-[90px] text-center">Pens Down</th>
                  <th className="px-3 py-2 w-[110px]">Source</th>
                  <th className="px-3 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const blank = !r.title;
                  return (
                    <tr
                      key={r.key}
                      className="border-b border-white/5 last:border-b-0"
                      style={r.is_hard_deadline ? { boxShadow: "inset 3px 0 0 0 rgba(239,68,68,0.6)" } : undefined}
                    >
                      <td className="px-3 py-2">
                        <select
                          value={r.milestone_type}
                          disabled={r.locked}
                          onChange={(e) => updateRow(r.key, { milestone_type: e.target.value as MilestoneType })}
                          className="w-full rounded bg-white/5 border border-white/10 px-1.5 py-1 text-[12px] disabled:opacity-60"
                          style={{ color: typeColor(r.milestone_type) }}
                        >
                          {TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} style={{ color: "#0A1628" }}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          maxLength={80}
                          value={r.title}
                          data-journey-blank-title={blank ? "1" : undefined}
                          onChange={(e) => updateRow(r.key, { title: e.target.value })}
                          placeholder="Milestone title"
                          className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-[12.5px] text-white placeholder:text-white/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.date}
                          disabled={r.locked}
                          onChange={(e) => updateRow(r.key, { date: e.target.value })}
                          className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-[12.5px] text-white disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.is_hard_deadline}
                          onChange={(e) => updateRow(r.key, { is_hard_deadline: e.target.checked })}
                          className="accent-red-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.is_pens_down}
                          onChange={(e) => togglePensDown(r.key, e.target.checked)}
                          className="accent-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10.5px]"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.6)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          {r.source === "original_rfp" ? "RFP" : r.source === "client_directive" ? "Client" : "Manual"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => removeRow(r.key)}
                          disabled={r.locked}
                          title={r.locked ? "Submission deadline is required" : "Remove"}
                          className="text-white/50 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/10">
            <button
              onClick={addBlank}
              className="text-[12.5px] text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
              style={{ transition: "opacity 200ms" }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Milestone
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-[12.5px] text-white/50">
          Upload a schedule, scan the RFP, or
          <button onClick={addBlank} className="ml-1 text-amber-300 hover:text-amber-200 underline">
            add a milestone manually
          </button>
          .
        </div>
      )}

      {/* SECTION D — TIMELINE PREVIEW */}
      {timeline && (
        <div className="mt-6 rounded-lg border border-white/10 p-4">
          <div className="relative h-10 mb-3">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/10 rounded-full" />
            {rows
              .filter((r) => r.date)
              .map((r) => {
                const t = new Date(r.date).getTime();
                if (!isFinite(t)) return null;
                const pct = Math.max(0, Math.min(100, ((t - timeline.start) / (timeline.end - timeline.start)) * 100));
                return (
                  <div
                    key={r.key}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full ring-2 ring-[#0A1628]"
                    style={{ left: `${pct}%`, background: typeColor(r.milestone_type) }}
                    title={`${r.title} · ${r.date}`}
                  />
                );
              })}
          </div>
          <div className="text-[11.5px] text-white/55 text-center">
            {daysToSubmission != null ? `${daysToSubmission} days to submission` : "—"} · {rows.length} milestone
            {rows.length === 1 ? "" : "s"} configured
          </div>
        </div>
      )}

      {/* Warnings */}
      <div className="mt-4 space-y-2">
        {hasMilestones && !hasPensDown && (
          <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b" }}>
            ⚠ No Pens Down gate set. BLAST OFF requires at least one Pens Down milestone.
          </div>
        )}
        {hasMilestones && !hasSubmission && (
          <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}>
            ⚠ Submission deadline required.
          </div>
        )}
        {hasMilestones && !allFilled && (
          <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b" }}>
            ⚠ Every row needs a title and a date.
          </div>
        )}
        {canAdvance && (
          <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.35)", color: "#22c55e" }}>
            ✅ Journey is ready
          </div>
        )}
      </div>

      {/* Footer (inline to keep save behavior local) */}
      <div className="mt-10 pt-6 flex items-center justify-between gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="text-[14px] text-white/55 hover:text-white flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-[12px] text-white/40">Step 7 of 8</span>
        <button
          onClick={handleContinue}
          disabled={!canAdvance}
          className="px-5 py-2 rounded-md text-[13.5px] font-medium disabled:opacity-40 flex items-center gap-1.5"
          style={{ background: "#C49A2B", color: "#0D1B3E" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Continue to Review <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
