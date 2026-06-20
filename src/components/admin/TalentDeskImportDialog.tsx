import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, X, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { previewAtlasTeamSync, commitAtlasTeamSync } from "@/lib/atlas-team-sync.functions";

type Row = {
  talentdesk_id?: string | null;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  address?: string | null;
  avatar_url?: string | null;
  skills?: string[] | null;
  languages?: string[] | null;
  talentdesk_status?: "approved" | "pending_onboarding" | null;
  talentdesk_date_joined?: string | null;
  talentdesk_last_login?: string | null;
  talentdesk_invited_by?: string | null;
};

type Preview = Awaited<ReturnType<typeof previewAtlasTeamSync>>;

const HEADER_ALIASES: Record<string, keyof Row> = {
  "talentdesk id": "talentdesk_id",
  "td id": "talentdesk_id",
  "user id": "talentdesk_id",
  "id": "talentdesk_id",
  "email": "email",
  "email address": "email",
  "first name": "first_name",
  "firstname": "first_name",
  "given name": "first_name",
  "last name": "last_name",
  "lastname": "last_name",
  "surname": "last_name",
  "family name": "last_name",
  "job title": "job_title",
  "title": "job_title",
  "role": "job_title",
  "phone": "phone",
  "phone number": "phone",
  "mobile": "phone",
  "address": "address",
  "location": "address",
  "avatar": "avatar_url",
  "avatar url": "avatar_url",
  "photo": "avatar_url",
  "skills": "skills",
  "languages": "languages",
  "status": "talentdesk_status",
  "talentdesk status": "talentdesk_status",
  "date joined": "talentdesk_date_joined",
  "joined": "talentdesk_date_joined",
  "join date": "talentdesk_date_joined",
  "last login": "talentdesk_last_login",
  "last login date": "talentdesk_last_login",
  "invited by": "talentdesk_invited_by",
  "inviter": "talentdesk_invited_by",
};

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
}

function normStatus(v: string | null | undefined): Row["talentdesk_status"] {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (["approved", "active", "accepted"].includes(s)) return "approved";
  if (["pending", "pending onboarding", "pending_onboarding", "invited", "onboarding"].includes(s)) return "pending_onboarding";
  return null;
}

function toListField(v: unknown): string[] | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

function mapRows(rawRows: Record<string, unknown>[]): { rows: Row[]; skipped: number } {
  let skipped = 0;
  const rows: Row[] = [];
  for (const raw of rawRows) {
    const mapped: Partial<Row> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = HEADER_ALIASES[normHeader(k)];
      if (!key) continue;
      if (v == null || v === "") continue;
      if (key === "skills" || key === "languages") {
        (mapped as any)[key] = toListField(v);
      } else if (key === "talentdesk_status") {
        mapped.talentdesk_status = normStatus(String(v));
      } else {
        (mapped as any)[key] = String(v).trim();
      }
    }
    if (!mapped.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
      skipped += 1;
      continue;
    }
    rows.push(mapped as Row);
  }
  return { rows, skipped };
}

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || file.type === "text/csv") {
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    return result.data ?? [];
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

export function TalentDeskImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewAtlasTeamSync);
  const commitFn = useServerFn(commitAtlasTeamSync);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    setPreview(null);
    setRemoveIds(new Set());
    try {
      const raw = await parseFile(file);
      const { rows: mapped, skipped: skip } = mapRows(raw);
      if (mapped.length === 0) {
        toast.error("No valid rows found. Check that the file has an 'Email' column.");
        setRows([]);
        setSkipped(skip);
        setFileName(file.name);
        return;
      }
      setRows(mapped);
      setSkipped(skip);
      setFileName(file.name);
      const p = await previewFn({ data: { rows: mapped } });
      setPreview(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse file";
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  async function handleCommit() {
    if (!preview || rows.length === 0) return;
    if (preview.conflicts.length > 0) {
      toast.error("Resolve duplicate emails in the source file first.");
      return;
    }
    setBusy(true);
    try {
      const result = await commitFn({
        data: { rows, removeIds: Array.from(removeIds), fileName: fileName ?? undefined },
      });
      toast.success(
        `Sync complete — ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.flagged} flagged.`,
      );
      qc.invalidateQueries({ queryKey: ["admin-staff-list"] });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const canCommit = useMemo(
    () => !!preview && rows.length > 0 && preview.conflicts.length === 0 && !busy,
    [preview, rows, busy],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-3xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: "#0c111c", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5" style={{ color: "#c9a84c" }} />
            <div>
              <h2 className="text-white font-medium text-base">Import from TalentDesk</h2>
              <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                Upload a CSV or Excel export. Email is the merge key.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={onPickFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || busy}
              className="w-full flex items-center justify-center gap-2 rounded-md py-6 text-[14px] transition-colors hover:bg-white/[0.02]"
              style={{ border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing {fileName}…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {fileName ? `Replace file (${fileName})` : "Choose CSV or Excel file"}
                </>
              )}
            </button>
            {skipped > 0 && (
              <p className="mt-2 text-[12px]" style={{ color: "#eab308" }}>
                {skipped} row{skipped === 1 ? "" : "s"} skipped (missing or invalid email).
              </p>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="New" value={preview.newMembers.length} color="#22c55e" />
                <Stat label="Updates" value={preview.updatedMembers.length} color="#3b82f6" />
                <Stat label="Missing" value={preview.missing.length} color="#eab308" />
                <Stat label="Conflicts" value={preview.conflicts.length} color="#ef4444" />
              </div>

              {preview.conflicts.length > 0 && (
                <Section title="Duplicate emails in file" tone="error">
                  <ul className="text-[12px] space-y-1">
                    {preview.conflicts.map((c) => (
                      <li key={c.email} className="text-white/70">
                        {c.email} <span className="text-white/40">× {c.count}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] mt-2" style={{ color: "#ef4444" }}>
                    Resolve duplicates in the source file and re-upload before importing.
                  </p>
                </Section>
              )}

              {preview.newMembers.length > 0 && (
                <Section title={`Will add ${preview.newMembers.length}`} tone="success">
                  <PeopleList
                    items={preview.newMembers.map((m) => ({
                      key: m.email,
                      name: [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email,
                      sub: m.email,
                    }))}
                  />
                </Section>
              )}

              {preview.updatedMembers.length > 0 && (
                <Section title={`Will update ${preview.updatedMembers.length}`}>
                  <PeopleList
                    items={preview.updatedMembers.map((m) => ({
                      key: m.id,
                      name: [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email,
                      sub: m.email,
                    }))}
                  />
                  <p className="text-[12px] mt-2 text-white/40">
                    Only TalentDesk fields update. ATLAS role, invite status, and notes are preserved.
                  </p>
                </Section>
              )}

              {preview.missing.length > 0 && (
                <Section title={`In ATLAS but not in file (${preview.missing.length})`} tone="warn">
                  <ul className="space-y-1.5">
                    {preview.missing.map((m) => {
                      const checked = removeIds.has(m.id);
                      return (
                        <li key={m.id} className="flex items-center gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setRemoveIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                return next;
                              });
                            }}
                            className="accent-[#c9a84c]"
                          />
                          <span className="text-white/80">
                            {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                          </span>
                          <span className="text-white/40">{m.email}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[12px] mt-2 text-white/40">
                    Check anyone to soft-remove from the roster. Unchecked = flagged only.
                  </p>
                </Section>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-[14px] rounded-md text-white/70 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!canCommit}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[14px] font-medium disabled:opacity-50"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Import {rows.length > 0 ? `${rows.length} rows` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md p-3" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      <div className="text-2xl font-medium" style={{ color }}>{value}</div>
      <div className="text-[12px] tracking-wide text-white/45 mt-0.5">{label}</div>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "success" | "warn" | "error";
  children: React.ReactNode;
}) {
  const borderColor =
    tone === "error" ? "rgba(239,68,68,0.3)" :
    tone === "warn" ? "rgba(234,179,8,0.3)" :
    tone === "success" ? "rgba(34,197,94,0.25)" :
    "rgba(255,255,255,0.08)";
  return (
    <div className="rounded-md p-3" style={{ border: `1px solid ${borderColor}`, background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-1.5 mb-2">
        {tone === "error" || tone === "warn" ? <AlertTriangle className="h-3.5 w-3.5" style={{ color: tone === "error" ? "#ef4444" : "#eab308" }} /> : null}
        <h3 className="text-[12px] font-medium tracking-wide text-white/70">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PeopleList({ items }: { items: Array<{ key: string; name: string; sub: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 6);
  return (
    <>
      <ul className="space-y-1">
        {visible.map((it) => (
          <li key={it.key} className="flex items-center justify-between text-[12px]">
            <span className="text-white/80 truncate">{it.name}</span>
            <span className="text-white/40 truncate ml-2">{it.sub}</span>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[12px] text-white/50 hover:text-white/80"
        >
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}
