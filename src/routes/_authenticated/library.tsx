import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageGate } from "@/components/war-room/PageGate";
import { relativeTime } from "@/lib/time";
import { FileText, ExternalLink, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Documents — Mission Control" }] }),
  component: () => <PageGate page="library"><LibraryPage /></PageGate>,
});

// Research-only categories. No proposal content.
const CATEGORIES = [
  "RFP Addenda",
  "State Q&A",
  "Model Contracts",
  "Rate Information",
  "Policy Documents",
  "Research",
  "Meeting Notes",
] as const;

type Category = typeof CATEGORIES[number];

const CAT_ICONS: Record<string, string> = {
  "RFP Addenda": "📄",
  "State Q&A": "❓",
  "Model Contracts": "📑",
  "Rate Information": "💰",
  "Policy Documents": "🏛️",
  "Research": "🔬",
  "Meeting Notes": "📋",
};

function LibraryPage() {
  const { engagement, member, canEdit } = useEngagement();
  const { user } = useSession();
  const canWrite = canEdit("library");
  const eid = engagement?.id ?? "";

  const [docs, setDocs] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("RFP Addenda");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!eid) return;
    const { data } = await supabase
      .from("content_library")
      .select("*")
      .eq("engagement_id", eid)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => { load(); }, [eid]);

  async function save() {
    if (!name.trim()) { toast.error("Document name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("content_library").insert({
      engagement_id: eid,
      name,
      category,
      notes,
      url: url || null,
      added_by: member?.display_name ?? user?.email ?? "Team",
    });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Document added");
    setName(""); setNotes(""); setUrl(""); setOpen(false);
    load();
  }

  const filtered = docs.filter(d => {
    const matchCat = activeCategory === "All" || d.category === activeCategory;
    const matchSearch = !search || (d.name + d.notes + d.category).toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const counts: Record<string, number> = { All: docs.length };
  CATEGORIES.forEach(c => { counts[c] = docs.filter(d => d.category === c).length; });

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Research, reference, and intelligence documents for {engagement.name}.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setOpen(v => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Document
          </Button>
        )}
      </div>

      {/* No proposal content notice */}
      <div className="mb-5 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        📚 Upload all mission documents here. RFPs, Q&A files, amendments, research, and reference materials. IRIS processes every upload automatically. Proposal drafts and content are not stored here.
      </div>

      {/* Add form */}
      {open && canWrite && (
        <div className="mb-5 rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Document Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Indiana RFP Addendum 2" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category</Label>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes / Summary</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brief description of contents..." rows={2} />
          </div>
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Link / URL (optional)</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Document"}</Button>
          </div>
        </div>
      )}

      {/* Search */}
      <Input
        placeholder="Search library…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="grid grid-cols-[160px_1fr] gap-5">
        {/* Category filter */}
        <div className="space-y-0.5">
          {["All", ...CATEGORIES].map(c => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors
                ${activeCategory === c
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
            >
              <span>{c === "All" ? "All Documents" : c}</span>
              <span className="text-xs text-muted-foreground/60">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Document list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
              {search ? "No documents match your search." : `No ${activeCategory === "All" ? "" : activeCategory + " "}documents yet.`}
            </div>
          ) : filtered.map(d => (
            <div
              key={d.id}
              className={`flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors ${d.url ? "cursor-pointer hover:border-primary/40" : ""}`}
              onClick={() => d.url && window.open(d.url, "_blank")}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{CAT_ICONS[d.category] ?? "📁"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{d.name}</span>
                  {d.url && <ExternalLink className="h-3 w-3 text-primary flex-shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {d.category} · Added {relativeTime(d.created_at)}{d.added_by ? ` by ${d.added_by}` : ""}
                </div>
                {d.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
