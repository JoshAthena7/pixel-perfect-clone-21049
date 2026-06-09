import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X, AlertTriangle, FileText, CheckCircle2, RefreshCcw } from "lucide-react";
import {
  previewAtlasTeamSync,
  commitAtlasTeamSync,
} from "@/lib/atlas-team-sync.functions";

/**
 * "Sync from TalentDesk" button + modal.
 * Parses CSV client-side, validates required columns, asks the server for a
 * preview, lets admin pick which missing members to remove, then commits.
 */

type ParsedRow = {
  talentdesk_id?: string | null;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  address?: string | null;
  avatar_url?: string | null;
  skills?: string[];
  languages?: string[];
  talentdesk_status?: "approved" | "pending_onboarding" | null;
  talentdesk_date_joined?: string | null;
  talentdesk_last_login?: string | null;
  talentdesk_invited_by?: string | null;
};

type Preview = {
  newMembers: Array<{ email: string; first_name: string | null; last_name: string | null }>;
  updatedMembers: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>;
  missing: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>;
  conflicts: Array<{ email: string; count: number }>;
};

const REQUIRED_HEADERS = ["ID", "Email", "First name", "Last name", "Status"];

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normStatus(v: string | undefined): "approved" | "pending_onboarding" | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "approved") return "approved";
  if (s === "pending" || s === "pending_onboarding") return "pending_onboarding";
  return null;
}

function toIsoDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function toIsoTs(v: string | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function parseCsv(text: string): { rows: ParsedRow[]; missingHeaders: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], missingHeaders: [...REQUIRED_HEADERS] };
  const headers = parseCsvLine(lines[0]);
  const lowerHeaders = headers.map((h) => h.toLowerCase());

  const missingHeaders = REQUIRED_HEADERS.filter(
    (h) => !lowerHeaders.includes(h.toLowerCase()),
  );
  if (missingHeaders.length > 0) return { rows: [], missingHeaders };

  const idx = (name: string) => lowerHeaders.indexOf(name.toLowerCase());
  const iId = idx("ID");
  const iEmail = idx("Email");
  const iFirst = idx("First name");
  const iLast = idx("Last name");
  const iJob = idx("Job title");
  const iPhone = idx("Phone");
  const iAddr = idx("Address");
  const iAvatar = idx("Avatar");
  const iSkills = idx("Skills");
  const iLangs = idx("Languages");
  const iStatus = idx("Status");
  const iJoined = idx("Date joined");
  const iLogin = idx("Last logged in");
  const iInvited = idx("Invited by");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const email = (cells[iEmail] ?? "").trim();
    if (!email) continue;
    rows.push({
      talentdesk_id: iId >= 0 ? cells[iId] || null : null,
      email,
      first_name: iFirst >= 0 ? cells[iFirst] || null : null,
      last_name: iLast >= 0 ? cells[iLast] || null : null,
      job_title: iJob >= 0 ? cells[iJob] || null : null,
      phone: iPhone >= 0 ? cells[iPhone] || null : null,
      address: iAddr >= 0 ? cells[iAddr] || null : null,
      avatar_url: iAvatar >= 0 ? cells[iAvatar] || null : null,
      skills: iSkills >= 0 ? splitList(cells[iSkills]) : [],
      languages: iLangs >= 0 ? splitList(cells[iLangs]) : [],
      talentdesk_status: iStatus >= 0 ? normStatus(cells[iStatus]) : null,
      talentdesk_date_joined: iJoined >= 0 ? toIsoDate(cells[iJoined]) : null,
      talentdesk_last_login: iLogin >= 0 ? toIsoTs(cells[iLogin]) : null,
      talentdesk_invited_by: iInvited >= 0 ? cells[iInvited] || null : null,
    });
  }
  return { rows, missingHeaders: [] };
}

function fullName(first?: string | null, last?: string | null) {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const n = `${f} ${l}`.trim();
  return n || "—";
}

export function AtlasTeamSyncButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
      >
        <RefreshCcw className="h-3.5 w-3.5" /> Sync from TalentDesk
      </button>
      {open && <SyncModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SyncModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const previewFn = useServerFn(previewAtlasTeamSync);
  const commitFn = useServerFn(commitAtlasTeamSync);

  async function handleFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const text = await f.text();
    const { rows: parsed, missingHeaders: missing } = parseCsv(text);
    setFileName(f.name);
    setMissingHeaders(missing);
    if (missing.length > 0) {
      setRows([]);
      setPreview(null);
      return;
    }
    if (parsed.length === 0) {
      toast.error("No data rows found in CSV");
      return;
    }
    setRows(parsed);
    setBusy(true);
    try {
      const p = (await previewFn({ data: { rows: parsed } })) as Preview;
      setPreview(p);
      setRemoveIds(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    if (preview.conflicts.length > 0) {
      toast.error("Resolve conflicts before committing.");
      return;
    }
    setBusy(true);
    try {
      const res = (await commitFn({
        data: { rows, removeIds: Array.from(removeIds), fileName: fileName ?? undefined },
      })) as { added: number; updated: number; flagged: number; removed: number };
      toast.success(
        `Sync complete — ${res.added} added, ${res.updated} updated, ${res.flagged} flagged for review.`,
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const blocked = preview ? preview.conflicts.length > 0 : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-bold">Sync from TalentDesk</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!preview && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  dragging ? "border-[color:var(--athena-gold)] bg-surface/60" : "border-border bg-surface/20 hover:bg-surface/40"
                }`}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-sm font-medium">Drop your TalentDesk CSV here</div>
                <div className="text-xs text-muted-foreground">or click to browse · .csv only</div>
                {fileName && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs">
                    <FileText className="h-3 w-3" /> {fileName}
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {missingHeaders.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    This file is missing required columns: <b>{missingHeaders.join(", ")}</b>. Please export a fresh file from TalentDesk.
                  </div>
                </div>
              )}
              {busy && <div className="text-xs text-muted-foreground">Analyzing…</div>}
            </>
          )}

          {preview && (
            <>
              <div className="text-xs text-muted-foreground">
                Reviewing <b className="text-foreground">{fileName}</b> · {rows.length} row{rows.length === 1 ? "" : "s"} parsed
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <PreviewColumn
                  tone="green"
                  title="New Members"
                  count={preview.newMembers.length}
                  items={preview.newMembers.map((m) => ({
                    key: m.email,
                    primary: fullName(m.first_name, m.last_name),
                    secondary: m.email,
                  }))}
                />
                <PreviewColumn
                  tone="gray"
                  title="Updated Members"
                  count={preview.updatedMembers.length}
                  items={preview.updatedMembers.map((m) => ({
                    key: m.id,
                    primary: fullName(m.first_name, m.last_name),
                    secondary: m.email,
                  }))}
                />
                <PreviewColumn
                  tone="amber"
                  title="No Longer in TalentDesk"
                  count={preview.missing.length}
                  items={preview.missing.map((m) => ({
                    key: m.id,
                    primary: fullName(m.first_name, m.last_name),
                    secondary: m.email,
                    checkbox: {
                      checked: removeIds.has(m.id),
                      onChange: (v: boolean) => {
                        setRemoveIds((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(m.id); else next.delete(m.id);
                          return next;
                        });
                      },
                    },
                  }))}
                  footer={
                    preview.missing.length > 0
                      ? `${removeIds.size} selected to remove · others stay flagged for review`
                      : undefined
                  }
                />
              </div>

              {preview.conflicts.length > 0 && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
                    <AlertTriangle className="h-4 w-4" /> Conflicts — duplicate emails in CSV
                  </div>
                  <div className="mt-1 text-[11px] text-red-200/80">
                    Resolve these in TalentDesk and re-export. Commit is blocked.
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-red-200">
                    {preview.conflicts.map((c) => (
                      <li key={c.email}>• {c.email} <span className="text-red-300/60">({c.count} rows)</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div className="text-[11px] text-muted-foreground">
            {preview && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {preview.newMembers.length} new · {preview.updatedMembers.length} updated · {preview.missing.length} flagged
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={!preview || blocked || busy}
              className="rounded-md bg-[color:var(--athena-gold)] px-3 py-1.5 text-xs font-bold text-black shadow disabled:opacity-50"
            >
              {busy ? "Working…" : "Confirm Sync"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewColumn({
  tone,
  title,
  count,
  items,
  footer,
}: {
  tone: "green" | "gray" | "amber";
  title: string;
  count: number;
  items: Array<{
    key: string;
    primary: string;
    secondary?: string;
    checkbox?: { checked: boolean; onChange: (v: boolean) => void };
  }>;
  footer?: string;
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-surface/40";
  const headCls =
    tone === "green"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-foreground/80";

  return (
    <div className={`rounded-md border ${toneCls} flex flex-col overflow-hidden`}>
      <div className={`flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${headCls}`}>
        <span>{title}</span>
        <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px]">{count}</span>
      </div>
      <div className="max-h-72 overflow-auto px-2 py-2">
        {items.length === 0 ? (
          <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">None</div>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.key} className="flex items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-black/20">
                {it.checkbox && (
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5"
                    checked={it.checkbox.checked}
                    onChange={(e) => it.checkbox!.onChange(e.target.checked)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.primary}</div>
                  {it.secondary && (
                    <div className="truncate text-[10px] text-muted-foreground">{it.secondary}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer && (
        <div className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}
