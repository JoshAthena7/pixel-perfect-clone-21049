import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Shield,
  FileText,
  ScrollText,
  BookOpen,
  Paperclip,
  Upload,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
  Link2,
  Lock,
  Sparkles,
  AlertTriangle,
  Target,
  Handshake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAccess";
import { toast } from "sonner";
import {
  listVaultDocs,
  createVaultDoc,
  deleteVaultDoc,
  getVaultDocUrl,
  VAULT_TYPE_META,
  type VaultDocType,
  type VaultDoc,
} from "@/lib/vault.functions";

export const Route = createFileRoute("/_authenticated/missions/$missionId/vault")({
  component: VaultPage,
});

const TYPE_ORDER: VaultDocType[] = [
  "data_security",
  "contract",
  "scope_of_work",
  "style_guide",
  "outline_template",
  "dpa",
  "other",
];

const TYPE_ICON: Record<VaultDocType, typeof Shield> = {
  data_security: Shield,
  contract: ScrollText,
  scope_of_work: FileText,
  style_guide: BookOpen,
  outline_template: FileText,
  dpa: Shield,
  other: Paperclip,
};

const TYPE_ACCENT: Record<VaultDocType, string> = {
  data_security: "rgba(244,63,94,0.45)",   // rose
  contract: "rgba(245,158,11,0.45)",       // amber
  scope_of_work: "rgba(56,189,248,0.45)",  // sky
  style_guide: "rgba(168,85,247,0.45)",    // violet
  outline_template: "rgba(132,204,22,0.45)", // lime
  dpa: "rgba(34,211,238,0.45)",            // iris cyan
  other: "rgba(148,163,184,0.35)",         // slate
};

function bytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function VaultPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listVaultDocs);
  const delFn = useServerFn(deleteVaultDoc);
  const urlFn = useServerFn(getVaultDocUrl);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["vault", missionId],
    queryFn: () => listFn({ data: { missionId } }),
  });

  // Beta lockdown: only platform admins can upload, edit, or delete vault content.
  const { isAdmin } = useIsAdmin();
  const isLead = isAdmin;


  const grouped = useMemo(() => {
    const out: Record<VaultDocType, VaultDoc[]> = {
      data_security: [], contract: [], scope_of_work: [], style_guide: [], outline_template: [], dpa: [], other: [],
    };
    for (const d of docs) out[d.doc_type as VaultDocType]?.push(d);
    return out;
  }, [docs]);

  const [openUpload, setOpenUpload] = useState<VaultDocType | null>(null);

  async function handleOpenDoc(doc: VaultDoc) {
    try {
      const { url } = await urlFn({ data: { id: doc.id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open document");
    }
  }

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed from Vault");
      qc.invalidateQueries({ queryKey: ["vault", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const requiredCount = TYPE_ORDER.filter(
    (t) => VAULT_TYPE_META[t].required && grouped[t].length > 0
  ).length;
  const requiredTotal = TYPE_ORDER.filter((t) => VAULT_TYPE_META[t].required).length;
  const allRequiredFilled = requiredCount === requiredTotal;

  // FedRAMP-scope flag
  const { data: missionMeta } = useQuery({
    queryKey: ["vault-mission-meta", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("is_fedramp_scope")
        .eq("id", missionId)
        .maybeSingle();
      return (data ?? { is_fedramp_scope: false }) as { is_fedramp_scope: boolean };
    },
  });
  const fedrampScope = missionMeta?.is_fedramp_scope ?? false;
  const fedrampMut = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("missions")
        .update({ is_fedramp_scope: next })
        .eq("id", missionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, next) => {
      toast.success(next ? "Mission marked FedRAMP-scope · Score Me disabled" : "FedRAMP-scope cleared");
      qc.invalidateQueries({ queryKey: ["vault-mission-meta", missionId] });
      qc.invalidateQueries({ queryKey: ["score-me-mission", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <>
      <MissionSetupTabs />
      <div className="mx-auto max-w-[1280px] px-6 py-10 space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            Mission · Vault
          </div>
          <h1 className="mt-2 text-3xl font-light tracking-tight">Client Reference Vault</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The four documents writers must read before drafting: Data Security
            Requirements, Contract, Scope of Work, and Style Guide. Drop
            additional client reference here as &ldquo;Other.&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
              allRequiredFilled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            {allRequiredFilled ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {requiredCount} of {requiredTotal} required documents loaded
          </div>
          <Link
            to="/missions/$missionId/library"
            params={{ missionId }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Full Library →
          </Link>
        </div>
      </header>

      <IntelligenceHighlights />



      {/* Beta: sensitive-data warning. Vault content is visible to every signed-in Atlas user on this mission. */}
      <div className="rounded-[10px] border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-rose-100">
        <div className="font-semibold text-rose-200 mb-0.5">Do not upload PHI, PII, or client-confidential material.</div>
        Beta Vault content is visible to every signed-in user on this mission. No HIPAA-regulated data,
        member identifiers, or confidential contract terms. Admin-only uploads during beta.
      </div>



      {/* FedRAMP-scope flag */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3"
        style={{
          borderColor: fedrampScope ? "rgba(244,63,94,0.35)" : "rgba(255,255,255,0.08)",
          background: fedrampScope ? "rgba(244,63,94,0.05)" : "rgba(255,255,255,0.02)",
        }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Lock
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: fedrampScope ? "rgb(244,63,94)" : "rgb(148,163,184)" }}
          />
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-foreground/95">
              FedRAMP-scope engagement
            </div>
            <div className="text-[11px] text-muted-foreground">
              {fedrampScope
                ? "Score Me is hard-blocked on this mission until Atlas achieves FedRAMP authorization (Phase 4)."
                : "Leave off for commercial / state engagements. Turn on for federal scope subject to FedRAMP."}
            </div>
          </div>
        </div>
        {isLead ? (
          <button
            onClick={() => fedrampMut.mutate(!fedrampScope)}
            disabled={fedrampMut.isPending}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold hover:bg-white/[0.08] disabled:opacity-50"
          >
            {fedrampMut.isPending ? "Saving…" : fedrampScope ? "Clear flag" : "Mark FedRAMP-scope"}
          </button>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">Lead-only</span>
        )}
      </div>

      {/* Slot grid */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading vault…</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {TYPE_ORDER.map((type) => {
            const meta = VAULT_TYPE_META[type];
            const Icon = TYPE_ICON[type];
            const items = grouped[type];
            const filled = items.length > 0;
            return (
              <section
                key={type}
                className="rounded-xl border bg-card/50 p-5"
                style={{
                  borderColor: filled
                    ? TYPE_ACCENT[type]
                    : "rgba(255,255,255,0.08)",
                  boxShadow: filled
                    ? `0 0 0 1px ${TYPE_ACCENT[type]} inset`
                    : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-md"
                      style={{
                        background: filled
                          ? `${TYPE_ACCENT[type].replace("0.45", "0.12")}`
                          : "rgba(255,255,255,0.04)",
                        color: filled ? undefined : "var(--muted-foreground)",
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold tracking-tight">
                          {meta.label}
                        </h2>
                        {meta.required && (
                          <span className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  {isLead && (
                    <button
                      onClick={() => setOpenUpload(type)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {items.length === 0 && (
                    <div className="rounded-md border border-dashed border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
                      No document loaded.
                      {isLead ? " Upload to satisfy this slot." : " Lead will upload shortly."}
                    </div>
                  )}
                  {items.map((doc) => (
                    <div
                      key={doc.id}
                      className="group flex items-start justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2.5"
                    >
                      <button
                        onClick={() => handleOpenDoc(doc)}
                        className="flex min-w-0 items-start gap-2 text-left"
                      >
                        {doc.external_url ? (
                          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        ) : (
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium group-hover:underline">
                            {doc.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {doc.version && (
                              <span className="rounded bg-white/5 px-1.5 py-0.5">
                                v{doc.version}
                              </span>
                            )}
                            <span>{bytes(doc.file_size)}</span>
                            {doc.uploaded_by_name && (
                              <span>· {doc.uploaded_by_name}</span>
                            )}
                            <span>· {new Date(doc.created_at).toLocaleDateString()}</span>
                            {doc.external_url && (
                              <span className="inline-flex items-center gap-1 text-sky-300">
                                <ExternalLink className="h-3 w-3" /> external
                              </span>
                            )}
                          </div>
                          {doc.description && (
                            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </button>
                      {isLead && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${doc.title}" from the Vault?`)) {
                              delMut.mutate(doc.id);
                            }
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {openUpload && (
        <UploadModal
          missionId={missionId}
          docType={openUpload}
          onClose={() => setOpenUpload(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["vault", missionId] });
            setOpenUpload(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Upload modal ──────────────────────────────────────────────────────────
function UploadModal({
  missionId,
  docType,
  onClose,
  onSaved,
}: {
  missionId: string;
  docType: VaultDocType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = VAULT_TYPE_META[docType];
  const createFn = useServerFn(createVaultDoc);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(meta.label);
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      let filePath: string | null = null;
      let fileSize: number | null = null;
      let mimeType: string | null = null;
      let extUrl: string | null = null;

      if (mode === "file") {
        if (!file) {
          toast.error("Choose a file to upload");
          setBusy(false);
          return;
        }
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${missionId}/vault/${docType}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("mission-library")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        filePath = path;
        fileSize = file.size;
        mimeType = file.type || null;
      } else {
        if (!externalUrl.trim()) {
          toast.error("Paste a link or switch to file upload");
          setBusy(false);
          return;
        }
        extUrl = externalUrl.trim();
      }

      await createFn({
        data: {
          missionId,
          docType,
          title: title.trim(),
          description: description.trim() || null,
          version: version.trim() || null,
          filePath,
          fileSize,
          mimeType,
          externalUrl: extUrl,
        },
      });
      toast.success(`${meta.label} added to Vault`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0b1220] p-6 shadow-2xl"
      >
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
          Vault · Upload
        </div>
        <h3 className="text-xl font-medium tracking-tight">{meta.label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>

        {/* Mode toggle */}
        <div className="mt-4 inline-flex rounded-md border border-white/10 bg-black/30 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`px-3 py-1.5 rounded ${
              mode === "file" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            <Upload className="mr-1 inline h-3 w-3" /> Upload file
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`px-3 py-1.5 rounded ${
              mode === "link" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            <Link2 className="mr-1 inline h-3 w-3" /> External link
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"
              required
            />
          </div>

          {mode === "file" ? (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                File
              </label>
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-foreground hover:file:bg-white/20"
                required
              />
              {file && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {file.name} · {bytes(file.size)}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                URL
              </label>
              <input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                type="url"
                placeholder="https://…"
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Description (optional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Version
              </label>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
                maxLength={40}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {busy ? "Saving…" : "Save to Vault"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Intelligence Highlights ────────────────────────────────────────────────
const INTEL_CARDS = [
  {
    kind: "Win Theme",
    title: "Family-Driven System of Care",
    icon: Target,
    accent: "emerald",
    body:
      "NJ's CSOC has prioritized family voice and youth-guided care since the 2011 redesign. Lead every section with how the model amplifies family decision-making — not how Athena delivers services.",
  },
  {
    kind: "Terminology Alert",
    title: "CSA vs MCO Language",
    icon: AlertTriangle,
    accent: "amber",
    body:
      "Do not refer to the Contracted System Administrator as an MCO. NJ DCF explicitly rejects managed-care framing. Use 'CSA,' 'care coordination,' and 'system administration' — never 'utilization management' or 'medical necessity gatekeeping.'",
  },
  {
    kind: "Strategic Note",
    title: "DCF Partnership Framing",
    icon: Handshake,
    accent: "sky",
    body:
      "DCF sees the CSA as an extension of the Department, not a vendor. Frame every operational decision as collaborative governance with DCF, CMOs, and family partners. Avoid 'we will deliver' — prefer 'we will partner with DCF to...'",
  },
] as const;

const INTEL_TONE: Record<string, { border: string; bg: string; chip: string; icon: string }> = {
  emerald: {
    border: "border-emerald-500/30",
    bg: "from-emerald-950/30",
    chip: "bg-emerald-500/15 text-emerald-300",
    icon: "text-emerald-400",
  },
  amber: {
    border: "border-amber-500/30",
    bg: "from-amber-950/30",
    chip: "bg-amber-500/15 text-amber-300",
    icon: "text-amber-400",
  },
  sky: {
    border: "border-sky-500/30",
    bg: "from-sky-950/30",
    chip: "bg-sky-500/15 text-sky-300",
    icon: "text-sky-400",
  },
};

function IntelligenceHighlights() {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[color:var(--athena-gold,#f59e0b)]" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Intelligence · From Iris
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {INTEL_CARDS.map((c) => {
          const Icon = c.icon;
          const tone = INTEL_TONE[c.accent];
          return (
            <article
              key={c.title}
              className={`overflow-hidden rounded-[12px] border ${tone.border} bg-gradient-to-br ${tone.bg} via-card/40 to-card/40 p-4`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={2} />
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.chip}`}>
                  {c.kind}
                </span>
              </div>
              <h3 className="mt-2.5 text-sm font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">{c.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
