import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Download, ArrowLeft, Save, Send, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";
import { Watermark } from "@/components/war-room/Watermark";
import { WinThemesReferencePanel } from "@/components/war-room/WinThemesReferencePanel";
import { WriterPolicyAlertsPanel } from "@/components/war-room/WriterPolicyAlertsPanel";
import { WriterCompliancePanel } from "@/components/war-room/WriterCompliancePanel";

export const Route = createFileRoute("/_authenticated/engagement/$id/section/$sectionId/edit")({
  head: () => ({ meta: [{ title: "Section Editor — Athena" }] }),
  component: SectionEditorPage,
});

type Section = {
  id: string;
  section_name: string;
  instructions: string | null;
};

type Assignment = {
  id: string;
  word_count_min: number | null;
  word_count_max: number | null;
};

type Draft = {
  id: string;
  body: string;
  word_count: number;
  status: "draft" | "in_review" | "approved" | "returned";
  version: number;
  return_note: string | null;
  updated_at: string;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const STATUS_BADGE: Record<Draft["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-blue-500/20 text-blue-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  returned: "bg-amber-500/20 text-amber-300",
};

function SectionEditorPage() {
  const { id: engagementId, sectionId } = useParams({ from: "/_authenticated/engagement/$id/section/$sectionId/edit" });
  const { engagement, member, isLeadership, switchEngagement } = useEngagement();
  const { user } = useSession();

  const [section, setSection] = useState<Section | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const lastSavedBodyRef = useRef("");

  // Make sure the engagement context matches the route param
  useEffect(() => {
    if (engagementId && engagement?.id !== engagementId) {
      switchEngagement(engagementId);
    }
  }, [engagementId, engagement?.id, switchEngagement]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [{ data: sec, error: secErr }, { data: assn }, { data: drafts, error: dErr }] = await Promise.all([
        supabase.from("heatmap_sections").select("id, section_name, instructions").eq("id", sectionId).maybeSingle(),
        supabase
          .from("section_assignments")
          .select("id, word_count_min, word_count_max")
          .eq("engagement_id", engagementId)
          .eq("section_id", sectionId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("section_drafts")
          .select("id, body, word_count, status, version, return_note, updated_at")
          .eq("engagement_id", engagementId)
          .eq("section_id", sectionId)
          .eq("author_id", user.id)
          .order("version", { ascending: false })
          .limit(1),
      ]);
      if (secErr) throw secErr;
      if (dErr) throw dErr;
      if (!sec) throw new Error("Section not found");
      setSection(sec as Section);
      setAssignment((assn as Assignment) ?? null);
      const latest = (drafts as Draft[] | null)?.[0] ?? null;
      setDraft(latest);
      const b = latest?.body ?? "";
      setBody(b);
      lastSavedBodyRef.current = b;
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load section");
    } finally {
      setLoading(false);
    }
  }, [engagementId, sectionId, user]);

  useEffect(() => {
    load();
  }, [load]);

  // Log leadership viewing another author's draft (security audit)
  useEffect(() => {
    if (!draft || !member || !user || !engagementId) return;
    const d: any = draft;
    if (isLeadership && d.author_id && d.author_id !== user.id) {
      logActivity({
        engagementId,
        userId: user.id,
        actorName: member.display_name,
        action: "view_section_draft",
        targetTable: "section_drafts",
        targetId: draft.id,
        metadata: { section_id: sectionId, author_id: d.author_id },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  const wordCount = useMemo(() => countWords(body), [body]);
  const minWords = assignment?.word_count_min ?? null;
  const maxWords = assignment?.word_count_max ?? null;
  const wordCountColor =
    minWords && wordCount < minWords
      ? "text-amber-400"
      : maxWords && wordCount > maxWords
      ? "text-red-400"
      : "text-emerald-400";

  const status = draft?.status ?? "draft";
  const isReadOnly = status === "in_review" || status === "approved";

  const persist = useCallback(
    async (nextBody: string, opts?: { silent?: boolean }) => {
      if (!user || !engagementId) return;
      if (isReadOnly) return;
      if (nextBody === lastSavedBodyRef.current && draft) return;
      setSavingState("saving");
      const wc = countWords(nextBody);
      try {
        if (!draft) {
          const { data, error } = await supabase
            .from("section_drafts")
            .insert({
              engagement_id: engagementId,
              section_id: sectionId,
              author_id: user.id,
              body: nextBody,
              word_count: wc,
              status: "draft",
              version: 1,
            })
            .select("id, body, word_count, status, version, return_note, updated_at")
            .single();
          if (error) throw error;
          setDraft(data as Draft);
        } else {
          const { data, error } = await supabase
            .from("section_drafts")
            .update({ body: nextBody, word_count: wc, updated_at: new Date().toISOString() })
            .eq("id", draft.id)
            .select("id, body, word_count, status, version, return_note, updated_at")
            .single();
          if (error) throw error;
          setDraft(data as Draft);
        }
        lastSavedBodyRef.current = nextBody;
        setSavingState("saved");
        if (!opts?.silent) {
          setTimeout(() => setSavingState("idle"), 1500);
        }
      } catch (e: any) {
        setSavingState("idle");
        toast.error(e.message ?? "Failed to save");
      }
    },
    [draft, engagementId, isReadOnly, sectionId, user],
  );

  // Auto-save every 30s
  useEffect(() => {
    if (isReadOnly) return;
    const t = setInterval(() => {
      persist(body, { silent: true });
    }, 30_000);
    return () => clearInterval(t);
  }, [body, isReadOnly, persist]);

  async function submitForReview() {
    if (!user || !draft) {
      // Persist first if no draft yet
      await persist(body, { silent: true });
    }
    if (!engagementId) return;
    // Re-fetch current draft id from state (after persist it should exist)
    const current = draft;
    const wc = countWords(body);

    try {
      // Save current body first
      if (current) {
        const newVersion = current.status === "returned" ? current.version + 1 : current.version;
        const { data, error } = await supabase
          .from("section_drafts")
          .update({
            body,
            word_count: wc,
            status: "in_review",
            version: newVersion,
            return_note: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id)
          .select("id, body, word_count, status, version, return_note, updated_at")
          .single();
        if (error) throw error;
        setDraft(data as Draft);
        lastSavedBodyRef.current = body;
      } else {
        const { data, error } = await supabase
          .from("section_drafts")
          .insert({
            engagement_id: engagementId,
            section_id: sectionId,
            author_id: user!.id,
            body,
            word_count: wc,
            status: "in_review",
            version: 1,
          })
          .select("id, body, word_count, status, version, return_note, updated_at")
          .single();
        if (error) throw error;
        setDraft(data as Draft);
        lastSavedBodyRef.current = body;
      }

      // Flip assignment status to Under Review
      if (assignment) {
        await supabase
          .from("section_assignments")
          .update({ status: "Under Review", updated_at: new Date().toISOString() })
          .eq("id", assignment.id);
      }

      logActivity({
        engagementId,
        userId: user!.id,
        action: "submitted section for review",
        actorName: member?.display_name ?? "Writer",
        targetTable: "section_drafts",
        targetId: current?.id ?? null,
        metadata: { section_id: sectionId, section_name: section?.section_name },
      });

      toast.success("Submitted for review");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    }
  }

  function exportDraft() {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${section?.section_name ?? "section"}-v${draft?.version ?? 1}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading section…</div>;
  }
  if (loadError) {
    return <div className="p-6 text-red-400">{loadError}</div>;
  }
  if (!section) {
    return <div className="p-6">Section not found.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Watermark />
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/writer/my-sections">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to my sections
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_BADGE[status]}>{status.replace("_", " ")}</Badge>
          {draft && <span className="text-xs text-muted-foreground">v{draft.version}</span>}
        </div>
      </div>

      {/* Instructions panel */}
      <Card className="p-0">
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between gap-2 p-4 text-left">
              <div>
                <h1 className="text-lg font-semibold">{section.section_name}</h1>
                <p className="text-xs text-muted-foreground">RFP instructions</p>
              </div>
              {instructionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/50 p-4 text-sm">
              {section.instructions ? (
                <p className="whitespace-pre-wrap text-muted-foreground">{section.instructions}</p>
              ) : (
                <p className="text-muted-foreground italic">No instructions provided.</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Status banners */}
      {status === "in_review" && (
        <Card className="border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-200">
          <Lock className="mr-2 inline h-4 w-4" />
          Under Review — editor is locked while leadership reviews this draft.
        </Card>
      )}
      {status === "approved" && (
        <Card className="border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Approved — this draft is locked. Use Export to download.
        </Card>
      )}
      {status === "returned" && draft?.return_note && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          <span className="font-semibold">Returned by leadership: </span>
          <span className="whitespace-pre-wrap">{draft.return_note}</span>
        </Card>
      )}

      {/* Policy alerts */}
      {user && (
        <WriterPolicyAlertsPanel engagementId={engagementId} sectionId={sectionId} userId={user.id} />
      )}

      {/* Win Themes reference */}
      <WinThemesReferencePanel engagementId={engagementId} sectionId={sectionId} />

      {/* Compliance requirements */}
      {section && (
        <WriterCompliancePanel engagementId={engagementId} sectionId={sectionId} sectionName={section.section_name} />
      )}


      {/* Editor */}
      <Card className="p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Begin your section here…"
          className="min-h-[480px] resize-y font-serif text-base leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className={`text-sm ${wordCountColor}`}>
            <span className="font-semibold">{wordCount}</span> words
            {(minWords || maxWords) && (
              <span className="text-muted-foreground">
                {" "}
                / target {minWords ?? "?"}–{maxWords ?? "?"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {savingState === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
            {savingState === "saved" && <span className="text-xs text-emerald-400">Saved</span>}
            {!isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => persist(body)}>
                <Save className="mr-1 h-4 w-4" /> Save now
              </Button>
            )}
            {status === "approved" && (
              <Button size="sm" onClick={exportDraft}>
                <Download className="mr-1 h-4 w-4" /> Export
              </Button>
            )}
            {!isReadOnly && (
              <Button size="sm" onClick={submitForReview} disabled={body.trim().length === 0}>
                <Send className="mr-1 h-4 w-4" />
                {status === "returned" ? "Resubmit for Review" : "Submit for Review"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {isLeadership && (
        <p className="text-xs text-muted-foreground">
          Leadership tip: use the Delivery Map review queue to approve or return drafts.
        </p>
      )}
    </div>
  );
}
