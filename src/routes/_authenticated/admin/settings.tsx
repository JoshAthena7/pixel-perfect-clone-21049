import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {

  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[12px] font-extrabold uppercase tracking-[0.32em]">
            Olympus · <span className="text-foreground/70">Athena Team</span>
          </h1>
        </div>
        <FastReportsMenu />
      </header>

      <div className="p-5">
        <TeamTab />
      </div>
    </div>
  );
}


function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? "border-[color:var(--athena-gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function TeamTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["olympus-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,email,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<
    | null
    | { rows: { email: string; display_name: string; role: string }[]; fileName: string; errors: string[] }
  >(null);

  function handleExport() {
    if (!data.length) {
      toast.info("No team members to export yet.");
      return;
    }
    const header = ["email", "display_name", "role", "joined"];
    const rows = data.map((p: any) => [
      p.email ?? "",
      p.display_name ?? "",
      "", // role unknown here — leave blank for round-trip editing
      p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-team-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} member${data.length === 1 ? "" : "s"}`);
  }

  function handleDownloadTemplate() {
    const csv =
      'email,display_name,role\n"jane@example.com","Jane Doe","member"\n"admin@example.com","Admin User","admin"\n';
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "athena-team-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      toast.error("CSV is empty.");
      return;
    }
    const parseRow = (line: string) => {
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
          if (c === ',') { out.push(cur); cur = ""; }
          else if (c === '"') inQ = true;
          else cur += c;
        }
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const header = parseRow(lines[0]).map((h) => h.toLowerCase());
    const idxEmail = header.indexOf("email");
    const idxName = header.indexOf("display_name");
    const idxRole = header.indexOf("role");
    if (idxEmail === -1) {
      toast.error('CSV must include an "email" column.');
      return;
    }
    const rows: { email: string; display_name: string; role: string }[] = [];
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      const email = (cells[idxEmail] ?? "").trim();
      const display_name = idxName >= 0 ? (cells[idxName] ?? "").trim() : "";
      const role = idxRole >= 0 ? (cells[idxRole] ?? "").trim().toLowerCase() : "member";
      if (!email) { errors.push(`Row ${i + 1}: missing email`); continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Row ${i + 1}: invalid email "${email}"`); continue; }
      rows.push({ email, display_name, role: role || "member" });
    }
    setImportPreview({ rows, fileName: file.name, errors });
  }

  function confirmImport() {
    if (!importPreview) return;
    // Real invite/role assignment endpoint isn't wired yet — stage to local toast.
    toast.success(`Queued ${importPreview.rows.length} invite${importPreview.rows.length === 1 ? "" : "s"} (invite delivery coming soon)`);
    setImportPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
        }}
      />
      <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Team ({data.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
              title="Download a blank CSV template"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
            >
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </button>
            <button
              onClick={() => alert("Invite flow coming soon")}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Invite User
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No users yet.</td></tr>
            ) : (
              data.map((p: any) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="px-4 py-2.5">{p.display_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-bold">
                Import preview · <span className="text-muted-foreground font-normal">{importPreview.fileName}</span>
              </h3>
              <button onClick={() => setImportPreview(null)} className="rounded p-1 hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-muted-foreground">
                {importPreview.rows.length} valid row{importPreview.rows.length === 1 ? "" : "s"}
                {importPreview.errors.length > 0 && (
                  <> · <span className="text-amber-400">{importPreview.errors.length} skipped</span></>
                )}
              </div>
              {importPreview.errors.length > 0 && (
                <ul className="max-h-24 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300">
                  {importPreview.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
              <div className="max-h-[360px] overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-hover text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Email</th>
                      <th className="px-3 py-1.5 text-left">Name</th>
                      <th className="px-3 py-1.5 text-left">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-1.5">{r.email}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.display_name || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={() => setImportPreview(null)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importPreview.rows.length === 0}
                className="rounded-md bg-[color:var(--athena-gold)] px-3 py-1.5 text-xs font-bold text-black shadow disabled:opacity-50"
              >
                Queue {importPreview.rows.length} invite{importPreview.rows.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
