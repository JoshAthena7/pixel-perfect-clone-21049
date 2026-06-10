import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, UploadCloud, FileText, Check, Loader2, Globe, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { extractRFPText } from "@/lib/extract-rfp-text.client";
import { comparePriorRfp, summarizeClientUrl } from "@/lib/intelligence-loadout.functions";
import { toast } from "sonner";

const BUCKET = "atlas-intelligence";

type Tier = "client" | "historical" | "internal";
type Slot = {
  key: string;
  label: string;
  helper: string;
  type: "file" | "url" | "text" | "file-or-text";
  multiple?: boolean;
  highlight?: boolean;
};

const CLIENT_SLOTS: Slot[] = [
  { key: "client_website", label: "Client Website", helper: "IRIS will index this page for organizational priorities and recent news.", type: "url" },
  { key: "strategic_plan", label: "Strategic Plan", helper: "The agency's published strategic priorities.", type: "file" },
  { key: "annual_reports", label: "Annual Reports", helper: "Up to 3 years recommended.", type: "file", multiple: true },
  { key: "board_materials", label: "Board Meeting Minutes or Materials", helper: "Useful for identifying recent agency priorities and concerns.", type: "file" },
  { key: "press_releases", label: "Press Releases", helper: "Recent agency announcements and priority statements.", type: "file", multiple: true },
];

const HISTORICAL_SLOTS: Slot[] = [
  { key: "prior_rfp", label: "Prior RFP", helper: "The previous version of this procurement. IRIS will compare it to the current RFP.", type: "file", highlight: true },
  { key: "prior_award", label: "Prior Award Announcement", helper: "Who won last time and any public information about the award decision.", type: "file" },
  { key: "prior_contract", label: "Prior Contract", helper: "The executed contract from the prior award.", type: "file" },
  { key: "prior_amendments", label: "Contract Amendments", helper: "Any amendments to the prior contract.", type: "file", multiple: true },
  { key: "protest_docs", label: "Protest Documents", helper: "Any GAO or court protests of the prior award.", type: "file", multiple: true },
];

const INTERNAL_SLOTS: Slot[] = [
  { key: "prior_proposals", label: "Prior Proposals for This Client or Program Type", helper: "Proposals Athena has submitted to this agency or for this program type.", type: "file", multiple: true },
  { key: "capture_notes", label: "Capture Notes", helper: "What you learned during capture — meetings, intelligence, relationships.", type: "file-or-text" },
  { key: "client_meetings", label: "Client Meeting Notes", helper: "Notes from any meetings with this client.", type: "file-or-text" },
  { key: "strategy_memos", label: "Strategy Memos", helper: "Internal strategy or positioning documents.", type: "file" },
  { key: "sme_notes", label: "SME Interview Summaries", helper: "What SMEs said during capture.", type: "file-or-text" },
  { key: "jpb_analysis", label: "JPB Analysis", helper: "Completed JPB Model analysis for this procurement if available.", type: "file" },
  { key: "corporate_caps", label: "Corporate Capabilities Statement", helper: "Athena's current capabilities statement relevant to this program type.", type: "file" },
];

type ExistingDoc = {
  id: string;
  title: string | null;
  document_type: string;
  metadata: any;
  source_url: string | null;
  file_url: string | null;
};

async function fetchDocs(missionId: string): Promise<ExistingDoc[]> {
  const { data } = await supabase
    .from("mission_documents")
    .select("id, title, document_type, metadata, source_url, file_url")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ExistingDoc[];
}

export function Step8IntelligenceUpload({ missionId, onAdvance }: { missionId: string; onAdvance: () => void }) {
  const qc = useQueryClient();
  const { data: docs } = useQuery({
    queryKey: ["mission-intel-docs", missionId],
    queryFn: () => fetchDocs(missionId),
  });
  const { data: evolution } = useQuery({
    queryKey: ["procurement-evolution", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("procurement_evolution_records")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
  });
  const [open, setOpen] = useState<{ a: boolean; b: boolean; c: boolean }>({ a: false, b: false, c: false });
  const [showEvolution, setShowEvolution] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mission-intel-docs", missionId] });
    qc.invalidateQueries({ queryKey: ["procurement-evolution", missionId] });
  };

  const byTier = (tier: Tier) => (docs ?? []).filter((d) => d.metadata?.intelligence_tier === tier);
  const clientStatus = byTier("client").length > 0 ? "green" : "gray";
  const histPrior = byTier("historical").some((d) => d.metadata?.slot === "prior_rfp");
  const histStatus = histPrior ? "green" : byTier("historical").length > 0 ? "amber" : "gray";
  const intStatus = byTier("internal").length > 0 ? "amber" : "gray";

  const total = docs?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--athena-navy)]">Load the intelligence.</h1>
        <p className="text-muted-foreground">
          The more IRIS knows going in, the smarter every consultant on this mission becomes from day one.
        </p>
      </header>

      <Section
        title="Client Intelligence"
        badge="Recommended"
        badgeColor="amber"
        status={clientStatus}
        open={open.a}
        onToggle={() => setOpen({ ...open, a: !open.a })}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          {CLIENT_SLOTS.map((s) => (
            <SlotCard key={s.key} missionId={missionId} tier="client" slot={s} docs={byTier("client")} onChange={refresh} />
          ))}
        </div>
      </Section>

      <Section
        title="Prior Procurement History"
        badge="Highly Recommended"
        badgeColor="gold"
        status={histStatus}
        open={open.b}
        onToggle={() => setOpen({ ...open, b: !open.b })}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          {HISTORICAL_SLOTS.map((s) => (
            <SlotCard
              key={s.key}
              missionId={missionId}
              tier="historical"
              slot={s}
              docs={byTier("historical")}
              onChange={refresh}
              evolution={s.key === "prior_rfp" ? evolution : undefined}
              onOpenEvolution={s.key === "prior_rfp" ? () => setShowEvolution(true) : undefined}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Internal Strategy Materials"
        badge="Recommended"
        badgeColor="amber"
        status={intStatus}
        open={open.c}
        onToggle={() => setOpen({ ...open, c: !open.c })}
        subhead="Upload everything Athena knows about this client and this program. IRIS will treat this as mission-specific institutional memory."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          {INTERNAL_SLOTS.map((s) => (
            <SlotCard key={s.key} missionId={missionId} tier="internal" slot={s} docs={byTier("internal")} onChange={refresh} />
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-between pt-4 border-t">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Save and continue later
        </button>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={async () => {
              await supabase.from("missions").update({ intelligence_loadout_step: 2 }).eq("id", missionId);
              onAdvance();
            }}
            className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
          >
            Configure Monitoring Feeds →
          </Button>
          <p className="text-xs text-muted-foreground">{total} documents uploaded</p>
        </div>
      </div>

      <EvolutionModal open={showEvolution} onClose={() => setShowEvolution(false)} record={evolution} />
    </div>
  );
}

function Section({
  title, badge, badgeColor, status, open, onToggle, subhead, children,
}: {
  title: string;
  badge: string;
  badgeColor: "amber" | "gold";
  status: "green" | "amber" | "gray";
  open: boolean;
  onToggle: () => void;
  subhead?: string;
  children: React.ReactNode;
}) {
  const dot = status === "green" ? "bg-green-500" : status === "amber" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
        <span className="font-semibold flex-1">{title}</span>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
            badgeColor === "gold"
              ? "bg-[var(--athena-gold)]/20 text-[var(--athena-gold)]"
              : "bg-amber-100 text-amber-700",
          )}
        >
          {badge}
        </span>
      </button>
      {open && (
        <div className="p-4 pt-0 space-y-3">
          {subhead && <p className="text-sm text-muted-foreground">{subhead}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

function SlotCard({
  missionId, tier, slot, docs, onChange, evolution, onOpenEvolution,
}: {
  missionId: string;
  tier: Tier;
  slot: Slot;
  docs: ExistingDoc[];
  onChange: () => void;
  evolution?: any;
  onOpenEvolution?: () => void;
}) {
  const existing = docs.filter((d) => d.metadata?.slot === slot.key);
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [defer, setDefer] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const summarizeFn = useServerFn(summarizeClientUrl);
  const compareFn = useServerFn(comparePriorRfp);

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    setErr(null);
    try {
      const { data: u, error: authErr } = await supabase.auth.getUser();
      if (authErr || !u?.user) {
        throw new Error("You must be signed in to upload. Please refresh and sign in again.");
      }
      for (const f of Array.from(files)) {
        const path = `${missionId}/${slot.key}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          cacheControl: "3600", upsert: false, contentType: f.type || undefined,
        });
        if (upErr) {
          console.error("[Step8] storage upload failed", upErr);
          throw new Error(`Storage upload failed: ${upErr.message}`);
        }
        const { data: doc, error: insErr } = await supabase
          .from("mission_documents")
          .insert({
            mission_id: missionId,
            document_type: "research",
            title: f.name.replace(/\.[^.]+$/, "").slice(0, 200),
            file_url: path,
            uploaded_by: u.user.id,
            metadata: { intelligence_tier: tier, slot: slot.key },
          })
          .select("id")
          .single();
        if (insErr) {
          console.error("[Step8] mission_documents insert failed", insErr);
          throw new Error(`Saving document record failed: ${insErr.message}`);
        }
        toast.success(`Uploaded ${f.name}`);

        // Prior RFP — kick off comparison
        if (slot.key === "prior_rfp" && doc) {
          try {
            const priorText = await extractRFPText(f);
            const { data: cur } = await supabase
              .from("mission_documents")
              .select("content_summary, title")
              .eq("mission_id", missionId)
              .eq("document_type", "primary_rfp")
              .limit(1)
              .maybeSingle();
            const currentText = cur?.content_summary ?? cur?.title ?? "Current RFP text unavailable for direct comparison.";
            await compareFn({ data: { missionId, priorDocumentId: doc.id, priorText, currentText } });
          } catch (e: any) {
            console.error("[Step8] prior RFP comparison failed", e);
            setErr(`Prior RFP saved, but comparison failed: ${e?.message ?? "error"}`);
          }
        }
      }
      onChange();
    } catch (e: any) {
      console.error("[Step8] upload failed", e);
      const msg = e?.message ?? "Upload failed.";
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await summarizeFn({ data: { missionId, url: url.trim(), label: slot.label } });
      setUrl("");
      onChange();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("mission_documents").insert({
        mission_id: missionId,
        document_type: "manual_note",
        title: slot.label,
        content_summary: text.slice(0, 8000),
        uploaded_by: u.user?.id ?? null,
        metadata: { intelligence_tier: tier, slot: slot.key },
      });
      setText("");
      onChange();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("rounded-md border border-border p-3 space-y-2", slot.highlight && "border-[var(--athena-gold)]")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold">{slot.label}</p>
          <p className="text-xs text-muted-foreground">{slot.helper}</p>
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Checkbox checked={defer} onCheckedChange={(v) => setDefer(!!v)} />
          Will add later
        </label>
      </div>

      {slot.type === "url" && (
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
          <Button size="sm" onClick={saveUrl} disabled={busy || !url.trim()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
          </Button>
        </div>
      )}

      {(slot.type === "file" || slot.type === "file-or-text") && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded border-2 border-dashed border-muted-foreground/30 hover:border-[var(--athena-gold)]/60 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
          Click to upload {slot.multiple ? "files" : "file"}
        </button>
      )}

      {slot.type === "text" || slot.type === "file-or-text" ? (
        <div className="space-y-1">
          <Textarea
            placeholder="Or type notes here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={busy}
          />
          {text.trim() && (
            <Button size="sm" variant="outline" onClick={saveText} disabled={busy}>Save notes</Button>
          )}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple={slot.multiple}
        accept=".pdf,.doc,.docx,.txt,.md,.rtf,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {existing.length > 0 && (
        <div className="space-y-1">
          {existing.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="truncate flex-1">{d.title ?? "Document"}</span>
              <Check className="h-3 w-3 text-green-500" />
            </div>
          ))}
        </div>
      )}

      {/* Prior RFP — analysis state */}
      {slot.key === "prior_rfp" && existing.length > 0 && (
        <div className="text-xs">
          {evolution?.analysis_completed_at ? (
            <div className="flex items-center justify-between rounded bg-green-50 dark:bg-green-950/30 px-2 py-1.5">
              <span className="text-green-700 dark:text-green-300 flex items-center gap-1">
                <Check className="h-3 w-3" /> Procurement Evolution Analysis complete.
              </span>
              <button onClick={onOpenEvolution} className="text-[var(--athena-gold)] inline-flex items-center gap-1 hover:underline">
                <Eye className="h-3 w-3" /> View Analysis
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-amber-700 dark:text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" /> IRIS is comparing this to the current RFP…
            </div>
          )}
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function EvolutionModal({ open, onClose, record }: { open: boolean; onClose: () => void; record: any }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[var(--athena-navy)]">How This RFP Changed</DialogTitle>
        </DialogHeader>
        {!record ? (
          <p className="text-sm text-muted-foreground">No analysis yet.</p>
        ) : (
          <div className="space-y-4 text-sm">
            {record.iris_summary && <p className="leading-relaxed">{record.iris_summary}</p>}
            <ListBlock title="Material Changes" items={record.material_changes} render={(c) => (
              <>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted mr-2">{c.change_type}</span>
                <span className="font-medium">{c.description}</span>
                {c.significance && <p className="text-xs text-muted-foreground mt-0.5">{c.significance}</p>}
              </>
            )} />
            <ListBlock title="New Sections" items={record.new_sections} render={(c) => (
              <>
                <span className="font-medium">{c.section_name}</span>
                {c.likely_signal && <p className="text-xs text-muted-foreground">{c.likely_signal}</p>}
              </>
            )} />
            <ListBlock title="Removed Sections" items={record.removed_sections} render={(c) => (
              <>
                <span className="font-medium">{c.section_name}</span>
                {c.likely_reason && <p className="text-xs text-muted-foreground">{c.likely_reason}</p>}
              </>
            )} />
            <ListBlock title="Scoring Changes" items={record.scoring_changes} render={(c) => (
              <>
                <span className="font-medium">{c.section}:</span> {c.old_weight} → {c.new_weight}
                {c.significance && <p className="text-xs text-muted-foreground">{c.significance}</p>}
              </>
            )} />
            {record.iris_signals && (
              <div>
                <h3 className="font-semibold text-[var(--athena-navy)]">IRIS Signals</h3>
                <p className="text-sm">{record.iris_signals}</p>
              </div>
            )}
            {record.iris_recommendations && (
              <div>
                <h3 className="font-semibold text-[var(--athena-navy)]">IRIS Recommendations</h3>
                <p className="text-sm">{record.iris_recommendations}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListBlock({ title, items, render }: { title: string; items: any[]; render: (x: any) => React.ReactNode }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold text-[var(--athena-navy)] mb-1">{title}</h3>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="rounded border border-border p-2">{render(it)}</li>
        ))}
      </ul>
    </div>
  );
}
