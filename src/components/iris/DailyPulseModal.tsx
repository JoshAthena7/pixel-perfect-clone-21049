/**
 * Daily Pulse — personalized intelligence brief modal.
 *
 * Behavior:
 * - Load today's daily_intelligence_briefs row (if present) and render the
 *   structured admin_brief / consultant_brief content.
 * - If none exists, generate inline via /api/chat/iris and persist a new row
 *   so subsequent opens hit the cached brief.
 * - Mark brief as read on first view; allow Regenerate (overwrite today).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Flame } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const GOLD = "#C9A55C";

type AdminBrief = {
  greeting?: string;
  mission_status?: string;
  new_intelligence?: Array<{ headline: string; why_it_matters: string; affected_sections?: string[]; action?: string }>;
  questions_needing_attention?: Array<{ question_number: string; issue: string; recommended_action: string }>;
  todays_priority?: string;
  one_risk_to_watch?: string;
  key_intelligence_summary?: string;
};

type ConsultantBrief = {
  greeting?: string;
  your_assignments?: Array<{ question_number: string; section: string; health: string; due_date: string; days_remaining: number; confidence: string; recommended_focus: string }>;
  new_intelligence_for_your_sections?: Array<{ headline: string; why_it_matters: string; section?: string }>;
  todays_priority?: string;
  one_thing_to_read?: string;
  key_intelligence_summary?: string;
};

type BriefRow = {
  id: string;
  brief_type: string;
  content: AdminBrief | ConsultantBrief | null;
  key_intelligence_summary: string | null;
  delivered_at: string | null;
  is_read: boolean;
  new_feed_items_count: number | null;
  at_risk_questions_count: number | null;
};

export function DailyPulseModal({ open, onOpenChange, missionId }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasAlreadyRead, setWasAlreadyRead] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);

  const generateInline = useCallback(async (userId: string, mid: string): Promise<BriefRow | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/chat/iris", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          missionId: mid,
          pageLabel: "Daily Pulse",
          messages: [{
            role: "user",
            content: `Deliver my personalized Daily Pulse brief for this mission. Cover: (1) what's new since yesterday, (2) the single most important priority for today, (3) any risk I should know about. Keep it under 180 words. Use plain prose, no headings.`,
          }],
        }),
      });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
      }
      const content: AdminBrief = {
        greeting: "Your Daily Pulse",
        mission_status: acc,
        todays_priority: acc.split(".").slice(0, 1).join(".") + ".",
        key_intelligence_summary: acc.slice(0, 140),
      };
      const { data: inserted } = await supabase
        .from("daily_intelligence_briefs")
        .insert({
          mission_id: mid,
          recipient_id: userId,
          brief_date: todayIso,
          brief_type: "admin_brief",
          content: content as never,
          key_intelligence_summary: content.key_intelligence_summary ?? null,
          is_delivered: true,
          delivered_at: new Date().toISOString(),
        })
        .select("id,brief_type,content,key_intelligence_summary,delivered_at,is_read,new_feed_items_count,at_risk_questions_count")
        .single();
      return (inserted as BriefRow | null) ?? null;
    } catch (e) {
      console.error("inline brief failed", e);
      return null;
    }
  }, [todayIso]);

  const load = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    setError(null);
    setBrief(null);
    setWasAlreadyRead(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); return; }

      const { data: existing } = await supabase
        .from("daily_intelligence_briefs")
        .select("id,brief_type,content,key_intelligence_summary,delivered_at,is_read,new_feed_items_count,at_risk_questions_count")
        .eq("recipient_id", user.id)
        .eq("mission_id", missionId)
        .eq("brief_date", todayIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let row = existing as BriefRow | null;
      if (!row) {
        row = await generateInline(user.id, missionId);
      }

      if (!row) { setError("IRIS couldn't generate a pulse right now."); return; }

      setWasAlreadyRead(row.is_read);
      setBrief(row);

      if (!row.is_read) {
        await supabase
          .from("daily_intelligence_briefs")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    } finally {
      setLoading(false);
    }
  }, [missionId, todayIso, generateInline]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const regenerate = useCallback(async () => {
    if (!missionId) return;
    if (!window.confirm("This will replace today's brief. Continue?")) return;
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("daily_intelligence_briefs")
        .delete()
        .eq("recipient_id", user.id)
        .eq("mission_id", missionId)
        .eq("brief_date", todayIso);
      const fresh = await generateInline(user.id, missionId);
      if (fresh) { setBrief(fresh); setWasAlreadyRead(false); toast.success("Brief regenerated."); }
      else toast.error("Could not regenerate brief.");
    } finally {
      setGenerating(false);
    }
  }, [missionId, todayIso, generateInline]);

  const titleText = wasAlreadyRead ? "Re-reading Your Brief" : "Your Daily Brief";
  const todayLabel = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3" style={{ color: GOLD }}>
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: GOLD, animationDuration: "2.5s" }} />
            {titleText}
          </DialogTitle>
          <p className="text-[12px] text-muted-foreground">{todayLabel}</p>
        </DialogHeader>

        {!missionId ? (
          <p className="text-[14px] text-muted-foreground">Open a mission to see today's pulse.</p>
        ) : loading ? (
          <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-[14px] text-destructive">{error}</div>
        ) : brief ? (
          brief.brief_type === "consultant_brief"
            ? <ConsultantBriefView b={(brief.content ?? {}) as ConsultantBrief} />
            : <AdminBriefView b={(brief.content ?? {}) as AdminBrief} />
        ) : null}

        {brief && (
          <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border pt-3">
            <span>Brief generated {brief.delivered_at ? format(new Date(brief.delivered_at), "MMM d, h:mm a") : "—"}</span>
            <Button variant="ghost" size="sm" disabled={generating} onClick={regenerate}>
              {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Regenerate
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "amber" }) {
  const color = tone === "amber" ? "#F59E0B" : GOLD;
  return <p className="text-[11px] font-medium mb-2" style={{ color }}>{children}</p>;
}

function AdminBriefView({ b }: { b: AdminBrief }) {
  return (
    <div className="space-y-4">
      {b.greeting && <p className="text-[14px] text-foreground/90">{b.greeting}</p>}

      <div>
        <SectionLabel>Mission Status</SectionLabel>
        <p className="text-[14px] text-foreground">{b.mission_status ?? "—"}</p>
      </div>

      <div>
        <SectionLabel>
          New Intelligence
          {b.new_intelligence?.length ? <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[var(--athena-gold)]/20 px-1.5 text-[11px]" style={{ color: GOLD }}>{b.new_intelligence.length}</span> : null}
        </SectionLabel>
        {b.new_intelligence?.length ? (
          <div className="space-y-2">
            {b.new_intelligence.map((it, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-3">
                <p className="text-[14px] font-medium text-foreground">{it.headline}</p>
                <p className="text-[12px] text-muted-foreground mt-1">{it.why_it_matters}</p>
                {it.affected_sections?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {it.affected_sections.map((s, j) => <Badge key={j} variant="outline" className="text-[11px]">{s}</Badge>)}
                  </div>
                ) : null}
                {it.action && <p className="italic text-[12px] mt-2" style={{ color: GOLD }}>{it.action}</p>}
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-muted-foreground">No new intelligence since your last brief.</p>}
      </div>

      <div>
        <SectionLabel>Needs Attention</SectionLabel>
        {b.questions_needing_attention?.length ? (
          <div className="space-y-1.5">
            {b.questions_needing_attention.map((q, i) => (
              <div key={i} className="flex items-start gap-3 text-[14px]">
                <span className="font-medium mt-0.5" style={{ color: GOLD }}>Q{q.question_number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{q.issue}</p>
                  <p className="text-[12px] text-muted-foreground italic">{q.recommended_action}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-green-400"><CheckCircle2 className="h-3 w-3" /> All questions healthy.</p>
        )}
      </div>

      {b.todays_priority && (
        <div className="rounded-md p-4 border-l-4" style={{ borderLeftColor: GOLD, background: "rgba(201,165,92,0.06)" }}>
          <SectionLabel>Focus Today</SectionLabel>
          <p className="text-base text-foreground leading-relaxed">{b.todays_priority}</p>
        </div>
      )}

      {b.one_risk_to_watch && (
        <div className="rounded-md p-3 border-l-4 border-amber-500/60 bg-amber-500/5">
          <SectionLabel tone="amber">Watch</SectionLabel>
          <p className="text-[14px] text-foreground inline-flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" />{b.one_risk_to_watch}</p>
        </div>
      )}
    </div>
  );
}

function healthClass(h: string) {
  const v = h.toLowerCase();
  if (v === "red") return "bg-red-500/20 text-red-400 border-red-500/40";
  if (v === "yellow" || v === "amber") return "bg-amber-500/20 text-amber-400 border-amber-500/40";
  return "bg-green-500/20 text-green-400 border-green-500/40";
}

function ConsultantBriefView({ b }: { b: ConsultantBrief }) {
  return (
    <div className="space-y-4">
      {b.greeting && <p className="text-[14px] text-foreground/90">{b.greeting}</p>}

      <div>
        <SectionLabel>Your Assignments</SectionLabel>
        {b.your_assignments?.length ? (
          <div className="space-y-2">
            {b.your_assignments.map((a, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="font-medium" style={{ color: GOLD }}>Q{a.question_number}</span>
                  <span className="text-foreground">{a.section}</span>
                  <Badge variant="outline" className={`text-[11px] ${healthClass(a.health)}`}>{a.health}</Badge>
                  <span className={`text-[12px] ${a.days_remaining < 7 ? "text-red-400" : "text-muted-foreground"}`}>
                    {a.due_date} ({a.days_remaining}d)
                  </span>
                  <Badge variant="outline" className="text-[11px]">{a.confidence}</Badge>
                </div>
                <p className="italic text-[12px] text-muted-foreground mt-1.5">{a.recommended_focus}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-muted-foreground">No active assignments today.</p>}
      </div>

      <div>
        <SectionLabel>New Intelligence for Your Sections</SectionLabel>
        {b.new_intelligence_for_your_sections?.length ? (
          <div className="space-y-2">
            {b.new_intelligence_for_your_sections.map((it, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-3">
                <p className="text-[14px] font-medium text-foreground">{it.headline}</p>
                <p className="text-[12px] text-muted-foreground mt-1">{it.why_it_matters}</p>
                {it.section && <Badge variant="outline" className="text-[11px] mt-2">{it.section}</Badge>}
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-muted-foreground">No new intelligence affecting your sections.</p>}
      </div>

      {b.todays_priority && (
        <div className="rounded-md p-4 border-l-4" style={{ borderLeftColor: GOLD, background: "rgba(201,165,92,0.06)" }}>
          <SectionLabel>Focus Today</SectionLabel>
          <p className="text-base text-foreground leading-relaxed">{b.todays_priority}</p>
        </div>
      )}

      {b.one_thing_to_read && (
        <div className="rounded-md p-4 bg-slate-950/50 border-t-2" style={{ borderTopColor: GOLD }}>
          <SectionLabel>Read This Today</SectionLabel>
          <p className="text-[14px] text-foreground inline-flex items-start gap-2"><Flame className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />{b.one_thing_to_read}</p>
        </div>
      )}
    </div>
  );
}
