import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { X, Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractCanonFromUpload, createManyCanonEntries } from "@/lib/canon.functions";

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

type Suggested = {
  topic: string;
  category: string;
  citation?: string;
  content: string;
  source_url?: string;
  tags?: string[];
  priority?: number;
};

export function ExtractCanonModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractCanonFromUpload);
  const saveFn = useServerFn(createManyCanonEntries);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("CMS Guidance");
  const [stage, setStage] = useState<"input" | "extracting" | "review" | "saving">("input");
  const [entries, setEntries] = useState<Suggested[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  async function handleExtract() {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB).");
      return;
    }
    setStage("extracting");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? "anon";
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from("canon-uploads").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const r = await extractFn({
        data: {
          filePath: path,
          fileName: file.name,
          mimeType: file.type || null,
          sourceUrl: sourceUrl.trim() || undefined,
          defaultCategory: defaultCategory as any,
        },
      });
      setEntries(r.entries);
      setPicked(Object.fromEntries(r.entries.map((_, i) => [i, true])));
      setStage("review");
      toast.success(`IRIS extracted ${r.entries.length} suggested Canon entries.`);
    } catch (e: any) {
      toast.error(e.message);
      setStage("input");
    }
  }

  async function handleSave() {
    const toSave = entries.filter((_, i) => picked[i]);
    if (toSave.length === 0) {
      toast.error("Select at least one entry.");
      return;
    }
    setStage("saving");
    try {
      await saveFn({ data: { entries: toSave as any } });
      toast.success(`Saved ${toSave.length} Canon entries.`);
      qc.invalidateQueries({ queryKey: ["canon-lib"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
      setStage("review");
    }
  }

  function updateEntry(i: number, patch: Partial<Suggested>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-background"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-light">Extract Canon from Document</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {stage === "input" || stage === "extracting" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload a PDF, DOCX, TXT, or MD. IRIS will read it and propose short Canon entries you can review,
                edit, and save. The full document is not stored as Canon — only the curated entries you approve.
              </p>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Document
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full rounded-md border border-border bg-surface/50 p-2 text-xs"
                />
                {file && (
                  <span className="text-[11px] text-muted-foreground">
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Source URL (optional)
                </span>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://www.cms.gov/…"
                  className="w-full rounded-md border border-border bg-surface/50 p-2 text-xs"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Default Category
                </span>
                <select
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface/50 p-2 text-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={handleExtract}
                disabled={!file || stage === "extracting"}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium disabled:opacity-50"
                style={{ background: "#C49A22", color: "#0b0b0b" }}
              >
                {stage === "extracting" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Extracting…
                  </>
                ) : (
                  <>
                    <Upload size={14} /> Extract Suggested Entries
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Review IRIS's proposed Canon entries. Edit anything inline. Uncheck to skip. Click Save to commit
                only the checked entries.
              </div>
              {entries.map((e, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${picked[i] ? "border-border bg-surface/40" : "border-dashed border-border opacity-50"}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!picked[i]}
                      onChange={(ev) => setPicked({ ...picked, [i]: ev.target.checked })}
                    />
                    <input
                      value={e.topic}
                      onChange={(ev) => updateEntry(i, { topic: ev.target.value })}
                      className="flex-1 rounded border border-border bg-background/40 px-2 py-1 text-sm font-medium"
                    />
                    <button
                      onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={e.category}
                      onChange={(ev) => updateEntry(i, { category: ev.target.value })}
                      className="rounded border border-border bg-background/40 px-2 py-1 text-xs"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      value={e.citation ?? ""}
                      onChange={(ev) => updateEntry(i, { citation: ev.target.value })}
                      placeholder="Citation"
                      className="rounded border border-border bg-background/40 px-2 py-1 text-xs"
                    />
                    <select
                      value={e.priority ?? 3}
                      onChange={(ev) => updateEntry(i, { priority: Number(ev.target.value) })}
                      className="rounded border border-border bg-background/40 px-2 py-1 text-xs"
                    >
                      {[1, 2, 3, 4, 5].map((p) => (
                        <option key={p} value={p}>
                          Priority {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={e.content}
                    onChange={(ev) => updateEntry(i, { content: ev.target.value })}
                    rows={4}
                    className="mt-2 w-full rounded border border-border bg-background/40 px-2 py-1 font-mono text-[11px]"
                  />
                  <input
                    value={(e.tags ?? []).join(", ")}
                    onChange={(ev) =>
                      updateEntry(i, {
                        tags: ev.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="tags, comma-separated"
                    className="mt-2 w-full rounded border border-border bg-background/40 px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {stage === "review" || stage === "saving" ? (
          <div className="flex items-center justify-between border-t border-border p-4">
            <div className="text-xs text-muted-foreground">
              {Object.values(picked).filter(Boolean).length} of {entries.length} selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStage("input")}
                className="rounded-md border border-border px-3 py-2 text-xs hover:bg-surface-hover"
              >
                ← Re-upload
              </button>
              <button
                onClick={handleSave}
                disabled={stage === "saving"}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
                style={{ background: "#C49A22", color: "#0b0b0b" }}
              >
                {stage === "saving" && <Loader2 size={12} className="animate-spin" />}
                Save Selected to Canon
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
