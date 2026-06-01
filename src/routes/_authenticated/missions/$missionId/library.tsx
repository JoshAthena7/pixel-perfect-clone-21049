import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { Upload, Plus, FileText, ExternalLink, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/library")({
  component: LibraryPage,
});

const CATEGORIES = [
  "RFP",
  "Amendment",
  "Q&A Document",
  "State Intelligence",
  "Competitive Intel",
  "Meeting Notes",
  "Client Direction",
  "Research",
  "Compliance",
  "Leadership Guidance",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

type Doc = {
  id: string;
  mission_id: string;
  name: string;
  category: string;
  notes: string | null;
  url: string | null;
  file_path: string | null;
  is_rfp: boolean | null;
  added_by: string | null;
  created_at: string;
};

function LibraryPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["mission-library", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: docs.length };
    for (const c of CATEGORIES) map[c] = 0;
    for (const d of docs) map[d.category] = (map[d.category] ?? 0) + 1;
    return map;
  }, [docs]);

  const visible = activeCategory === "All" ? docs : docs.filter((d) => d.category === activeCategory);

  const deleteDoc = useMutation({
    mutationFn: async (doc: Doc) => {
      if (doc.file_path) {
        await supabase.storage.from("mission-library").remove([doc.file_path]);
      }
      await supabase.from("mission_library").delete().eq("id", doc.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-library", missionId] }),
  });

  async function handleRfpUpload(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${missionId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("mission-library").upload(path, file);
      if (upErr) throw upErr;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", u.user!.id)
        .maybeSingle();
      const { data: ins } = await supabase.from("mission_library").insert({
        mission_id: missionId,
        name: file.name,
        category: "RFP",
        is_rfp: true,
        file_path: path,
        added_by_id: u.user!.id,
        added_by: profile?.display_name ?? u.user!.email,
        notes: "Upload RFP → Auto-create Question Records (parsing pending).",
      }).select("id").maybeSingle();
      await createSignal({
        mission_id: missionId,
        source_module: "library",
        signal_type: "document_uploaded",
        signal_title: `RFP uploaded: ${file.name}`,
        severity: "info",
        related_document_id: ins?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["mission-library", missionId] });
    } finally {
      setUploading(false);
    }
  }

  async function downloadDoc(doc: Doc) {
    if (doc.url) {
      window.open(doc.url, "_blank");
      return;
    }
    if (doc.file_path) {
      const { data } = await supabase.storage.from("mission-library").createSignedUrl(doc.file_path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mission Library</h1>
          <p className="text-sm text-muted-foreground">All RFPs, intelligence, and reference docs for this mission.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add Document
        </button>
      </div>

      {/* Upload RFP banner */}
      <label className="mb-6 block cursor-pointer rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-6 transition hover:border-primary hover:bg-primary/10">
        <input
          type="file"
          className="hidden"
          accept=".pdf,.docx,.doc,.txt"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleRfpUpload(f);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-primary/15 p-3">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold text-foreground">
              {uploading ? "Uploading…" : "Upload RFP"}
            </div>
            <div className="text-sm text-muted-foreground">
              Upload RFP → Auto-create Question Records
            </div>
          </div>
        </div>
      </label>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        {/* Category filter list */}
        <aside className="rounded-lg border border-border p-2">
          <CategoryRow
            label="All Documents"
            count={counts.All}
            active={activeCategory === "All"}
            onClick={() => setActiveCategory("All")}
          />
          <div className="my-2 border-t border-border" />
          {CATEGORIES.map((c) => (
            <CategoryRow
              key={c}
              label={c}
              count={counts[c] ?? 0}
              active={activeCategory === c}
              onClick={() => setActiveCategory(c)}
            />
          ))}
        </aside>

        {/* Document cards */}
        <div>
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No documents in {activeCategory === "All" ? "this library" : activeCategory} yet.
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((doc) => (
              <div
                key={doc.id}
                className="group rounded-lg border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
                    <div className="min-w-0">
                      <button
                        onClick={() => downloadDoc(doc)}
                        className="text-left text-sm font-medium text-foreground hover:underline truncate block"
                      >
                        {doc.name}
                      </button>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">{doc.category}</span>
                        {doc.is_rfp && (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">RFP</span>
                        )}
                        {doc.url && <ExternalLink className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${doc.name}?`)) deleteDoc.mutate(doc);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {doc.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {doc.added_by ? `Added by ${doc.added_by} · ` : ""}
                  {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddDocumentModal
          missionId={missionId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["mission-library", missionId] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm transition ${
        active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function AddDocumentModal({
  missionId,
  onClose,
  onSaved,
}: {
  missionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("Other");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", u.user!.id)
        .maybeSingle();
      await supabase.from("mission_library").insert({
        mission_id: missionId,
        name: name.trim().slice(0, 200),
        category,
        notes: notes.trim().slice(0, 2000) || null,
        url: url.trim().slice(0, 1000) || null,
        added_by_id: u.user!.id,
        added_by: profile?.display_name ?? u.user!.email,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Document</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Document title"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="URL (optional)">
            <input
              value={url}
              maxLength={1000}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://…"
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add Document"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
