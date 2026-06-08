import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Info, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ROLES = [
  "Writer",
  "Athena SME",
  "Client SME",
  "Reviewer",
  "Copy Editor",
  "Workstream Lead",
  "Leadership",
  "Other",
  "Multi-Role",
];

const CLEARANCES = ["None", "Public Trust", "Secret", "Top Secret", "TS-SCI"];

type Member = {
  id: string;
  mission_id: string;
  name: string;
  email: string | null;
  role: string;
  org: string | null;
  clearance: string | null;
  active: boolean | null;
  source: string | null;
};

export default function MissionTeam({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["mission-team", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_team_members")
        .select("*")
        .eq("mission_id", missionId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mission-team", missionId] });

  const updateField = async (id: string, field: keyof Member, value: any) => {
    const { error } = await supabase
      .from("mission_team_members")
      .update({ [field]: value })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("mission_team_members")
      .update({ active: false })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    invalidate();
  };

  const importedCount = members.filter((m) => m.source === "tracker_import").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Team</h2>
          <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--athena-gold)] px-3 py-1.5 text-xs font-semibold text-[color:var(--athena-navy,#0a1628)] hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Member
        </button>
      </div>

      {importedCount > 0 && !bannerDismissed && (
        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {importedCount} {importedCount === 1 ? "member was" : "members were"} auto-imported from your assignment tracker. Review and update roles as needed.
          </span>
          <button onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="shrink-0 text-sky-200/70 hover:text-sky-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
          No team members yet. Click "Add Member" to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Org</th>
                <th className="px-3 py-2 text-left">Clearance</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const inactive = m.active === false;
                return (
                  <tr key={m.id} className={`border-t border-border/60 ${inactive ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2">
                      <InlineText value={m.name} onSave={(v) => updateField(m.id, "name", v)} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineSelect value={m.role} options={ROLES} onSave={(v) => updateField(m.id, "role", v)} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineText value={m.email ?? ""} onSave={(v) => updateField(m.id, "email", v || null)} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineText value={m.org ?? ""} onSave={(v) => updateField(m.id, "org", v || null)} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineSelect value={m.clearance ?? "None"} options={CLEARANCES} onSave={(v) => updateField(m.id, "clearance", v)} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => updateField(m.id, "active", !(m.active ?? true))}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                          inactive
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {inactive ? "Inactive" : "Active"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => remove(m.id)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-hover hover:text-rose-300"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddMemberModal
          missionId={missionId}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function InlineText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground hover:border-border focus:border-border focus:bg-surface focus:outline-none"
    />
  );
}

function InlineSelect({ value, options, onSave }: { value: string; options: string[]; onSave: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onSave(e.target.value)}
      className="rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground hover:border-border focus:border-border focus:bg-surface focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function AddMemberModal({
  missionId,
  onClose,
  onAdded,
}: {
  missionId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Writer");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [clearance, setClearance] = useState("None");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("mission_team_members").insert({
      mission_id: missionId,
      name: name.trim(),
      role,
      email: email.trim() || null,
      org: org.trim() || null,
      clearance,
      active: true,
      source: "manual",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${name.trim()} added to team`);
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Add Team Member</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Org">
            <input value={org} onChange={(e) => setOrg(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Clearance">
            <select value={clearance} onChange={(e) => setClearance(e.target.value)} className={inputCls}>
              {CLEARANCES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded bg-[color:var(--athena-gold)] px-3 py-1.5 text-xs font-semibold text-[color:var(--athena-navy,#0a1628)] hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add to Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-[color:var(--athena-gold)] focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
