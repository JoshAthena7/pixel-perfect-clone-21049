import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isValidUrl } from "./intel-shared";

const CATEGORIES = [
  { value: "stakeholders", label: "Stakeholders" },
  { value: "political_environment", label: "Political Environment" },
  { value: "incumbent_performance", label: "Incumbent Performance" },
  { value: "news_media", label: "News and Media" },
  { value: "legislative_activity", label: "Legislative Activity" },
  { value: "cms_waivers", label: "CMS Waivers" },
  { value: "advocacy_groups", label: "Advocacy Groups" },
  { value: "state_priorities", label: "State Priorities" },
] as const;

type Entry = {
  id: string;
  category: string;
  title: string | null;
  content: string | null;
  source_url: string | null;
  date_of_intelligence: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

export function ClientIntelligenceTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ entry?: Entry; category: string } | null>(null);
  const [delTarget, setDelTarget] = useState<Entry | null>(null);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles")
        .select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const { data: entries, isLoading, isError, refetch } = useQuery({
    queryKey: ["client-intel", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("mission_client_intelligence")
        .select("*").eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Entry[];
    },
  });

  const byCategory = useMemo(() => {
    const m = new Map<string, Entry[]>();
    CATEGORIES.forEach((c) => m.set(c.value, []));
    (entries ?? []).forEach((e) => {
      if (!m.has(e.category)) m.set(e.category, []);
      m.get(e.category)!.push(e);
    });
    return m;
  }, [entries]);

  const matchesSearch = (e: Entry) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${e.title ?? ""} ${e.content ?? ""}`.toLowerCase().includes(q);
  };

  if (roleLoading) return <SkeletonRows rows={3} height="h-16" />;
  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin only"
        description="You do not have permission to view this tab."
      />
    );
  }
  if (isError) return <ErrorState message="Couldn't load client intelligence." onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-medium text-foreground">Client Intelligence</h2>
        <p className="text-[14px] text-muted-foreground">
          Structured intelligence about the client, stakeholders, and environment. Admin only.
        </p>
      </div>
      <div className="rounded-md border bg-primary/5 px-4 py-3 text-[14px]">
        This intelligence is visible to IRIS and informs every section brief and Sticky Notes interaction on this mission.
      </div>

      <Input placeholder="Search across all categories…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {isLoading ? <SkeletonRows rows={4} height="h-16" /> : (
        <div className="space-y-2">
          {CATEGORIES.map((c) => {
            const items = (byCategory.get(c.value) ?? []).filter(matchesSearch);
            const isOpen = openCats.has(c.value) || search.trim().length > 0;
            return (
              <div key={c.value} className="rounded-lg border bg-card">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30"
                  onClick={() => {
                    const n = new Set(openCats);
                    if (n.has(c.value)) n.delete(c.value); else n.add(c.value);
                    setOpenCats(n);
                  }}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {c.label}
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t p-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-[14px] text-muted-foreground">No {c.label} intelligence added yet.</p>
                    ) : items.map((e) => (
                      <EntryCard key={e.id} entry={e} onEdit={() => setEditing({ entry: e, category: e.category })} onDelete={() => setDelTarget(e)} />
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setEditing({ category: c.value })}>
                      <Plus className="h-4 w-4 mr-1" /> Add Entry
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EntrySheet
        open={!!editing} onOpenChange={(o) => !o && setEditing(null)}
        missionId={missionId} initial={editing}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["client-intel", missionId] }); setEditing(null); }}
      />

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This is permanent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!delTarget) return;
              await supabase.from("mission_client_intelligence").delete().eq("id", delTarget.id);
              setDelTarget(null);
              qc.invalidateQueries({ queryKey: ["client-intel", missionId] });
              toast.success("Entry deleted.");
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete }: { entry: Entry; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const content = entry.content ?? "";
  const truncated = content.length > 200 && !expanded ? content.slice(0, 200) + "…" : content;
  return (
    <div className="rounded-md border p-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{entry.title ?? "Untitled"}</div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-[14px] mt-1 whitespace-pre-wrap">
        {truncated}
        {content.length > 200 && (
          <button className="text-primary ml-1 text-[12px]" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </p>
      {entry.source_url && (
        <a href={entry.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-primary mt-1 inline-block">{entry.source_url}</a>
      )}
      <div className="text-[12px] text-muted-foreground mt-2">
        {entry.date_of_intelligence && <>Dated {entry.date_of_intelligence} · </>}
        Added {new Date(entry.created_at).toLocaleDateString()}
        {entry.updated_at !== entry.created_at && <> · Last updated {new Date(entry.updated_at).toLocaleDateString()}</>}
      </div>
    </div>
  );
}

function EntrySheet({
  open, onOpenChange, missionId, initial, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  missionId: string;
  initial: { entry?: Entry; category: string } | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [dateOf, setDateOf] = useState("");
  const [busy, setBusy] = useState(false);

  // Populate when opening
  useMemo(() => {
    if (!open) return;
    setTitle(initial?.entry?.title ?? "");
    setContent(initial?.entry?.content ?? "");
    setSourceUrl(initial?.entry?.source_url ?? "");
    setDateOf(initial?.entry?.date_of_intelligence ?? "");
  }, [open, initial]);

  async function save() {
    if (!title.trim() || !content.trim()) { toast.error("Title and content required."); return; }
    if (sourceUrl && !isValidUrl(sourceUrl)) { toast.error("Invalid URL."); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (initial?.entry) {
        await supabase.from("mission_client_intelligence").update({
          title, content, source_url: sourceUrl || null,
          date_of_intelligence: dateOf || null, updated_at: new Date().toISOString(),
        }).eq("id", initial.entry.id);
      } else {
        await supabase.from("mission_client_intelligence").insert({
          mission_id: missionId, category: initial?.category ?? "stakeholders",
          title, content, source_url: sourceUrl || null,
          date_of_intelligence: dateOf || null, added_by: u.user?.id ?? null,
        } as never);
      }
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{initial?.entry ? "Edit Entry" : "Add Entry"}</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Content</Label><Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
          <div><Label>Source URL</Label><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." /></div>
          <div><Label>Date of Intelligence</Label><Input type="date" value={dateOf} onChange={(e) => setDateOf(e.target.value)} /></div>
        </div>
        <SheetFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
