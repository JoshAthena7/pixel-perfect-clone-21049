import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { Home, Upload, UserPlus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAtlasTeam, addAtlasTeamMember, removeAtlasTeamMember,
} from "@/lib/atlas-team-admin.functions";
import {
  previewAtlasTeamSync, commitAtlasTeamSync,
} from "@/lib/atlas-team-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/team")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) {
      throw redirect({ to: "/olympus/missions" });
    }
  },
  component: TeamRosterPage,
});

type CsvRow = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  talentdesk_id?: string | null;
};

type PreviewResult = {
  newMembers: Array<{ email: string; first_name: string | null; last_name: string | null }>;
  updatedMembers: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>;
  missing: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>;
  conflicts: Array<{ email: string; count: number }>;
};

function TeamRosterPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listAtlasTeam);
  const addFn = useServerFn(addAtlasTeamMember);
  const removeFn = useServerFn(removeAtlasTeamMember);
  const previewFn = useServerFn(previewAtlasTeamSync);
  const commitFn = useServerFn(commitAtlasTeamSync);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["atlas-team-roster"],
    queryFn: () => fetchList(),
  });

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const list = data?.members ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m: any) =>
      [m.email, m.first_name, m.last_name, m.job_title, m.atlas_role]
        .filter(Boolean).some((s: string) => s.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  // ----- manual add -----
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", job_title: "", phone: "", atlas_role: "" });
  const addMut = useMutation({
    mutationFn: (input: typeof form) => addFn({ data: input }),
    onSuccess: (r: any) => {
      toast.success(r.mode === "reactivated" ? "Member re-added" : "Member added");
      setAddOpen(false);
      setForm({ email: "", first_name: "", last_name: "", job_title: "", phone: "", atlas_role: "" });
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add member"),
  });

  // ----- remove -----
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Member removed");
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  // ----- CSV import -----
  const fileInput = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [removeChecked, setRemoveChecked] = useState<Set<string>>(new Set());

  const previewMut = useMutation({
    mutationFn: (rows: CsvRow[]) => previewFn({ data: { rows } }),
    onSuccess: (r: any) => setPreview(r),
    onError: (e: any) => toast.error(e?.message ?? "Preview failed"),
  });
  const commitMut = useMutation({
    mutationFn: () => commitFn({
      data: {
        rows: csvRows!,
        removeIds: Array.from(removeChecked),
        fileName: csvFileName || undefined,
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Sync complete · +${r.added} added · ${r.updated} updated · ${r.removed} removed`);
      setCsvRows(null); setPreview(null); setRemoveChecked(new Set()); setCsvFileName("");
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Commit failed"),
  });

  const handleFile = (file: File) => {
    setParseError(""); setPreview(null); setRemoveChecked(new Set()); setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (result) => {
        try {
          const rows: CsvRow[] = result.data
            .map((r) => {
              const email = (r.email || r["email_address"] || "").trim();
              if (!email) return null;
              return {
                email,
                first_name: (r.first_name || r.firstname || null) as string | null,
                last_name: (r.last_name || r.lastname || null) as string | null,
                job_title: (r.job_title || r.title || null) as string | null,
                phone: (r.phone || null) as string | null,
                talentdesk_id: (r.talentdesk_id || r.id || null) as string | null,
              };
            })
            .filter((r): r is CsvRow => !!r);
          if (rows.length === 0) {
            setParseError("No valid rows found. Make sure the CSV has an 'email' column.");
            return;
          }
          setCsvRows(rows);
          previewMut.mutate(rows);
        } catch (err: any) {
          setParseError(err?.message ?? "Failed to parse CSV");
        }
      },
      error: (err) => setParseError(err.message),
    });
  };

  return (
    <div className="min-h-screen bg-background px-8 py-8 text-foreground">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <Home className="h-3.5 w-3.5" /> Admin
          </Link>
          <h1 className="mt-3 text-3xl font-bold">Athena Team Roster</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the people who appear in Mission Wizard team pickers, assignments, and journey owners.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><UserPlus className="mr-2 h-4 w-4" /> Add manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
                <DialogDescription>One-off addition. For bulk, use the CSV importer.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email}
                         onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="fn">First name *</Label>
                  <Input id="fn" value={form.first_name}
                         onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="ln">Last name *</Label>
                  <Input id="ln" value={form.last_name}
                         onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="jt">Job title</Label>
                  <Input id="jt" value={form.job_title}
                         onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="role">Atlas role</Label>
                  <Input id="role" value={form.atlas_role} placeholder="e.g. Engagement Lead"
                         onChange={(e) => setForm({ ...form, atlas_role: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="ph">Phone</Label>
                  <Input id="ph" value={form.phone}
                         onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button
                  disabled={!form.email || !form.first_name || !form.last_name || addMut.isPending}
                  onClick={() => addMut.mutate(form)}>
                  {addMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileInput.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV (TalentDesk)
          </Button>

          <Input
            placeholder="Filter roster…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto max-w-xs"
          />
        </div>

        {/* CSV preview panel */}
        {(parseError || previewMut.isPending || preview) && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                CSV preview {csvFileName && <span className="text-muted-foreground">· {csvFileName}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setCsvRows(null); setPreview(null); setRemoveChecked(new Set()); setParseError("");
              }}>Cancel</Button>
            </div>
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            {previewMut.isPending && (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
              </p>
            )}
            {preview && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <Stat label="New" value={preview.newMembers.length} tone="add" />
                <Stat label="Will update" value={preview.updatedMembers.length} tone="update" />
                <Stat label="Missing from CSV" value={preview.missing.length} tone="warn" />
                <Stat label="Duplicates in CSV" value={preview.conflicts.length} tone="error" />
              </div>
            )}
            {preview && preview.conflicts.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-semibold mb-1">Duplicate emails block commit. Fix the CSV and re-upload:</p>
                <ul className="list-disc pl-4">
                  {preview.conflicts.map((c) => <li key={c.email}>{c.email} ({c.count}×)</li>)}
                </ul>
              </div>
            )}
            {preview && preview.missing.length > 0 && (
              <div className="rounded-md border p-3 text-xs space-y-2">
                <p className="font-medium">
                  {preview.missing.length} existing member(s) are NOT in this CSV. Check any you want to mark removed:
                </p>
                <div className="max-h-40 overflow-auto space-y-1">
                  {preview.missing.map((m) => (
                    <label key={m.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={removeChecked.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(removeChecked);
                          e.target.checked ? next.add(m.id) : next.delete(m.id);
                          setRemoveChecked(next);
                        }}
                      />
                      <span>{m.first_name} {m.last_name} · <span className="text-muted-foreground">{m.email}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {preview && (
              <div className="flex justify-end">
                <Button
                  onClick={() => commitMut.mutate()}
                  disabled={preview.conflicts.length > 0 || commitMut.isPending}>
                  {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Commit sync
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Roster table */}
        <div className="rounded-lg border">
          <div className="grid grid-cols-12 gap-2 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Name</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Job title</div>
            <div className="col-span-2">Atlas role</div>
            <div className="col-span-1">Invite</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {isLoading && (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
          {isError && <p className="p-4 text-sm text-destructive">Failed to load roster.</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No team members yet. Add manually or import a TalentDesk CSV.
            </p>
          )}
          {filtered.map((m: any) => (
            <div key={m.id} className="grid grid-cols-12 gap-2 border-b px-4 py-3 text-sm items-center last:border-0">
              <div className="col-span-3 font-medium">{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}</div>
              <div className="col-span-3 text-muted-foreground truncate">{m.email}</div>
              <div className="col-span-2 truncate">{m.job_title || "—"}</div>
              <div className="col-span-2 truncate">{m.atlas_role || "—"}</div>
              <div className="col-span-1">
                <Badge variant="outline" className="text-[10px]">{m.atlas_invite_status ?? "—"}</Badge>
              </div>
              <div className="col-span-1 text-right">
                <Button variant="ghost" size="icon" onClick={() => setRemoveTarget(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.email} will be hidden from wizard pickers and assignments. Their history is preserved and they can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeTarget && removeMut.mutate(removeTarget.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "add" | "update" | "warn" | "error" }) {
  const colors = {
    add: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
    update: "border-sky-500/40 bg-sky-500/10 text-sky-500",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    error: "border-red-500/40 bg-red-500/10 text-red-500",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${colors}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider">{label}</div>
    </div>
  );
}
