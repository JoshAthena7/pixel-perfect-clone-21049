import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Search, UserPlus, Trash2, Users, Tag } from "lucide-react";
import { logOlympusAction } from "@/lib/audit";
import { addCollectiveMemberToMission } from "@/lib/mission-members.functions";

type Collective = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  location: string | null;
  skill_tags: string[];
  notes: string | null;
  source: string;
  profile_id: string | null;
  is_active: boolean;
  imported_at: string;
};

const ROLES = [
  "admin",
  "engagement_lead",
  "project_manager",
  "lead_writer",
  "lead_graphics",
  "lead",
  "writer",
  "sme",
  "viewer",
] as const;
type Role = (typeof ROLES)[number];
const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  engagement_lead: "Engagement Lead",
  project_manager: "Project Manager",
  lead_writer: "Lead Writer",
  lead_graphics: "Lead Graphics",
  lead: "Lead",
  writer: "Writer",
  sme: "SME",
  viewer: "Viewer",
};

// ---------- CSV parsing ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const HEADER_MAP: Record<string, string> = {
  "first name": "first_name", firstname: "first_name", first: "first_name",
  "last name": "last_name", lastname: "last_name", surname: "last_name", last: "last_name",
  "full name": "full_name", name: "full_name", "display name": "full_name",
  email: "email", "email address": "email", "e-mail": "email",
  phone: "phone", "phone number": "phone", mobile: "phone", "contact number": "phone",
  title: "title", role: "title", "job title": "title", position: "title",
  location: "location", city: "location", "city/state": "location",
  skills: "skill_tags", "skill tags": "skill_tags", tags: "skill_tags", expertise: "skill_tags",
  notes: "notes", bio: "notes",
};

function normalizeHeader(h: string): string {
  return HEADER_MAP[h.trim().toLowerCase()] ?? "";
}

type ParsedRow = {
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  location: string | null;
  skill_tags: string[];
  notes: string | null;
};

function parseRows(text: string): { rows: ParsedRow[]; errors: string[]; headerMap: Record<number, string> } {
  const csv = parseCsv(text);
  const errors: string[] = [];
  if (csv.length < 2) return { rows: [], errors: ["CSV is empty or missing a header row"], headerMap: {} };
  const headerMap: Record<number, string> = {};
  csv[0].forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key) headerMap[i] = key;
  });
  const cols = Object.values(headerMap);
  if (!cols.includes("full_name") && !(cols.includes("first_name") || cols.includes("last_name"))) {
    errors.push("Couldn't find a name column (expected Full Name, or First/Last Name)");
  }
  const rows: ParsedRow[] = [];
  for (let r = 1; r < csv.length; r++) {
    const get = (k: string) => {
      const idx = Object.entries(headerMap).find(([, v]) => v === k)?.[0];
      return idx != null ? (csv[r][Number(idx)] ?? "").trim() : "";
    };
    const first = get("first_name");
    const last = get("last_name");
    const full = get("full_name") || [first, last].filter(Boolean).join(" ").trim();
    if (!full) continue;
    const skillsRaw = get("skill_tags");
    const skill_tags = skillsRaw
      ? skillsRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];
    rows.push({
      full_name: full,
      email: get("email").toLowerCase() || null,
      phone: get("phone") || null,
      title: get("title") || null,
      location: get("location") || null,
      skill_tags,
      notes: get("notes") || null,
    });
  }
  return { rows, errors, headerMap };
}

// ---------- Component ----------
export function CollectivePanel({ missionId }: { missionId: string | null }) {
  const qc = useQueryClient();
  const addCollectiveMember = useServerFn(addCollectiveMemberToMission);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<Role>("writer");
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const { data: collective = [], isLoading } = useQuery({
    queryKey: ["collective-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collective_members")
        .select("*")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data as Collective[];
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    collective.forEach((c) => c.skill_tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [collective]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return collective.filter((c) => {
      if (tagFilter && !c.skill_tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.location ?? "").toLowerCase().includes(q) ||
        c.skill_tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [collective, search, tagFilter]);

  async function onPickFile(file: File) {
    const text = await file.text();
    const { rows, errors } = parseRows(text);
    if (errors.length) errors.forEach((e) => toast.error(e));
    if (rows.length === 0) { toast.error("No rows could be parsed"); return; }
    setPreview(rows);
    toast.success(`Parsed ${rows.length} rows — review and confirm import`);
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    // Link to existing profiles by email
    const emails = preview.map((p) => p.email).filter(Boolean) as string[];
    let byEmail = new Map<string, string>();
    if (emails.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email").in("email", emails);
      byEmail = new Map((profs ?? []).map((p: any) => [String(p.email).toLowerCase(), p.id]));
    }
    const payload = preview.map((p) => ({
      ...p,
      source: "talentdesk",
      imported_by: userId,
      profile_id: p.email ? byEmail.get(p.email) ?? null : null,
    }));
    // Upsert by lower(email) — for rows without email, plain insert
    const withEmail = payload.filter((p) => p.email);
    const withoutEmail = payload.filter((p) => !p.email);
    let added = 0, updated = 0;
    if (withEmail.length) {
      const { error, count } = await supabase
        .from("collective_members")
        .upsert(withEmail, { onConflict: "email", ignoreDuplicates: false, count: "exact" });
      if (error) { toast.error(error.message); setImporting(false); return; }
      added += count ?? withEmail.length;
    }
    if (withoutEmail.length) {
      const { error } = await supabase.from("collective_members").insert(withoutEmail);
      if (error) { toast.error(error.message); setImporting(false); return; }
      added += withoutEmail.length;
    }
    await logOlympusAction({
      action_type: "collective.import",
      action_summary: `Imported ${preview.length} collective members (TalentDesk)`,
      target_table: "collective_members",
    });
    setImporting(false);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    toast.success(`Imported ${added} members${updated ? `, ${updated} updated` : ""}`);
    qc.invalidateQueries({ queryKey: ["collective-members"] });
  }

  async function inviteToMission(c: Collective) {
    if (!missionId) { toast.error("Select a mission from the header first"); return; }
    setBusyMemberId(c.id);
    try {
      const result = await addCollectiveMember({
        data: { missionId, collectiveMemberId: c.id, role: addRole },
      });
      toast.success(`${result.sentInvite ? "Invited and added" : "Added"} ${c.full_name} as ${addRole}`);
      await logOlympusAction({
        action_type: "team.add",
        action_summary: `${result.sentInvite ? "Invited and added" : "Added"} ${c.full_name} (${c.email ?? "no email"}) from collective as ${addRole}`,
        mission_id: missionId,
        target_table: "mission_members",
      });
      qc.invalidateQueries({ queryKey: ["olympus-team", missionId] });
      qc.invalidateQueries({ queryKey: ["collective-members"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add member to mission");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function removeFromCollective(c: Collective) {
    if (!confirm(`Remove ${c.full_name} from the Athena Collective directory?`)) return;
    const { error } = await supabase
      .from("collective_members")
      .update({ is_active: false })
      .eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${c.full_name} removed from the collective`);
    qc.invalidateQueries({ queryKey: ["collective-members"] });
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-muted-foreground" /> Athena Collective
          <span className="text-xs text-muted-foreground">({collective.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
          >
            <Upload className="h-3.5 w-3.5" /> Upload TalentDesk CSV
          </button>
        </div>
      </div>

      {preview && (
        <div className="border-b border-border bg-surface-hover px-5 py-3 text-sm">
          <div className="mb-2 font-medium">
            Preview: {preview.length} rows ready to import
          </div>
          <div className="max-h-40 overflow-y-auto rounded border border-border bg-background text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Title</th>
                  <th className="px-2 py-1 text-left">Skills</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 25).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">{r.full_name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.email ?? "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.title ?? "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.skill_tags.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 25 && (
              <div className="px-2 py-1 text-[11px] text-muted-foreground">
                …and {preview.length - 25} more
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={confirmImport}
              disabled={importing}
              className="rounded-md bg-[#C49A22] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${preview.length} members`}
            </button>
            <button
              onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Cancel
            </button>
            <span className="text-[11px] text-muted-foreground">
              Rows are upserted by email. People with existing Athena profiles get auto-linked.
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, title, skill…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={tagFilter ?? ""}
          onChange={(e) => setTagFilter(e.target.value || null)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">All skill tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="text-[11px] text-muted-foreground italic">
          Add teammates to a mission from Mission Setup → Team.
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
      ) : collective.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No collective members yet. Upload a TalentDesk CSV to populate the directory.
          <div className="mt-2 text-[11px]">
            Expected columns: <span className="font-mono">Full Name (or First/Last Name), Email, Phone, Title, Location, Skills</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No matches.</div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Member</th>
                <th className="px-4 py-2 text-left">Title / Location</th>
                <th className="px-4 py-2 text-left">Skill tags</th>
                <th className="px-4 py-2 text-left w-24">Status</th>
                <th className="px-4 py-2 text-right w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.email ?? "no email"}{c.phone ? ` · ${c.phone}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    <div>{c.title ?? "—"}</div>
                    <div className="text-[11px]">{c.location ?? ""}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.skill_tags.slice(0, 6).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[10px]">
                          <Tag className="h-2.5 w-2.5" /> {t}
                        </span>
                      ))}
                      {c.skill_tags.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">+{c.skill_tags.length - 6}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.profile_id ? (
                      <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Linked</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">Will invite</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => removeFromCollective(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        title="Remove from collective"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
