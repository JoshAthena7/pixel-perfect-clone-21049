import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IntelItem } from "@/lib/intelligence-feed";
import {
  Sparkles, BookmarkPlus, Link2, Users, Flag, MessageSquarePlus,
  Target, ChevronDown, ChevronRight, RefreshCw, Brain, Loader2, ExternalLink,
} from "lucide-react";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiveBadge, TypewriterText, TransmittedFlash } from "@/components/v2/effects";

type MissionRow = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  program_type: string | null;
  win_themes: string[] | null;
  priority_topics: string[] | null;
  competitors: string[] | null;
  focus_areas: string[] | null;
  iris_search_terms: string[] | null;
};

type ResearchSource = { title?: string; url: string };

type ResearchFeedRow = {
  task_id: string;
  result_id: string | null;
  question: string;
  why_it_matters: string | null;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "complete" | "failed";
  answer: string | null;
  sources: ResearchSource[];
  confidence: "high" | "medium" | "low" | null;
  follow_up_questions: string[];
  generated_at: string | null;
  created_at: string;
};

export function MissionIntelligenceFeed({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(true);
  const [running, setRunning] = useState<"dna" | "research" | null>(null);

  const { data: mission } = useQuery({
    queryKey: ["mip-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,program_type,win_themes,priority_topics,competitors,focus_areas,iris_search_terms")
        .eq("id", missionId)
        .maybeSingle();
      return data as MissionRow | null;
    },
  });

  const { data: dna } = useQuery({
    queryKey: ["mission-dna", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_intelligence_dna")
        .select("id,dna_version,generated_from,generated_at")
        .eq("mission_id", missionId)
        .eq("is_current", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: feed = [], refetch, isFetching } = useQuery({
    queryKey: ["iris-research-feed", missionId],
    queryFn: async (): Promise<ResearchFeedRow[]> => {
      const { data: tasks } = await supabase
        .from("research_tasks")
        .select("id,question,why_it_matters,priority,status,created_at")
        .eq("mission_id", missionId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      const list = tasks ?? [];
      if (list.length === 0) return [];

      const { data: results } = await supabase
        .from("research_results")
        .select("id,task_id,answer,sources,confidence,follow_up_questions,generated_at")
        .in("task_id", list.map((t) => t.id));

      const byTask = new Map<string, any>();
      for (const r of results ?? []) byTask.set(r.task_id, r);

      return list.map((t) => {
        const r = byTask.get(t.id);
        return {
          task_id: t.id,
          result_id: r?.id ?? null,
          question: t.question,
          why_it_matters: t.why_it_matters ?? null,
          priority: (t.priority as ResearchFeedRow["priority"]) ?? "medium",
          status: (t.status as ResearchFeedRow["status"]) ?? "pending",
          answer: r?.answer ?? null,
          sources: Array.isArray(r?.sources) ? (r.sources as ResearchSource[]) : [],
          confidence: r?.confidence ?? null,
          follow_up_questions: Array.isArray(r?.follow_up_questions) ? r.follow_up_questions : [],
          generated_at: r?.generated_at ?? null,
          created_at: t.created_at,
        };
      });
    },
    refetchInterval: running ? 4000 : false,
  });

  const counts = useMemo(() => ({
    total: feed.length,
    complete: feed.filter((f) => f.status === "complete").length,
    pending: feed.filter((f) => f.status === "pending").length,
    in_progress: feed.filter((f) => f.status === "in_progress").length,
    failed: feed.filter((f) => f.status === "failed").length,
  }), [feed]);

  async function runResearch() {
    setRunning("research");
    toast.loading("IRIS is executing research via Perplexity…", { id: "iris-research" });
    try {
      const { executeResearchAgenda } = await import("@/lib/iris-research.functions");
      let totalOk = 0;
      let totalFail = 0;
      let safety = 24; // hard cap so a bug can't infinite-loop the UI
      // Process one task per request so each call stays under the worker
      // timeout. Loop client-side until the queue is empty.
      while (safety-- > 0) {
        const out = await executeResearchAgenda({ data: { missionId, limit: 1 } });
        totalOk += out.succeeded;
        totalFail += out.failed;
        if (out.executed === 0) break;
        const done = totalOk + totalFail;
        const total = done + (out.remaining ?? 0);
        toast.loading(`Researching ${done}/${total}…`, { id: "iris-research" });
        qc.invalidateQueries({ queryKey: ["iris-research-feed", missionId] });
        if ((out.remaining ?? 0) === 0) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success(`Research complete — ${totalOk} answered${totalFail ? `, ${totalFail} failed` : ""}`, { id: "iris-research" });
      qc.invalidateQueries({ queryKey: ["iris-research-feed", missionId] });
    } catch (e) {
      toast.error(`Research execution failed: ${e instanceof Error ? e.message : "unknown"}`, { id: "iris-research" });
    } finally {
      setRunning(null);
    }
  }

  async function buildDna() {
    setRunning("dna");
    toast.loading("IRIS is reading the RFP and building the research agenda…", { id: "iris-dna" });
    try {
      const { generateMissionDna } = await import("@/lib/iris-dna.functions");
      const out = await generateMissionDna({ data: { missionId } });
      toast.success(`Research agenda built — ${out.questionsGenerated} questions queued`, { id: "iris-dna" });
      qc.invalidateQueries({ queryKey: ["mission-dna", missionId] });
      qc.invalidateQueries({ queryKey: ["iris-research-feed", missionId] });
      await runResearch();
    } catch (e) {
      toast.error(`DNA generation failed: ${e instanceof Error ? e.message : "unknown"}`, { id: "iris-dna" });
    } finally {
      setRunning(null);
    }
  }

  const profileEmpty =
    !mission?.state && !mission?.client &&
    (mission?.win_themes ?? []).length === 0 &&
    (mission?.priority_topics ?? []).length === 0 &&
    (mission?.focus_areas ?? []).length === 0 &&
    (mission?.iris_search_terms ?? []).length === 0 &&
    (mission?.competitors ?? []).length === 0;

  return (
    <div className="space-y-5">
      {/* MISSION PROFILE */}
      <section className="rounded-[12px] border border-border bg-surface">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 border-b border-border"
        >
          <div className="flex items-center gap-2">
            {profileOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Target className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mission Profile</h3>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {dna ? `DNA v${(dna as any).dna_version}` : profileEmpty ? "Not configured" : "Configured"}
          </span>
        </button>
        {profileOpen && (
          <div className="px-5 py-4">
            {profileEmpty ? (
              <p className="text-sm text-muted-foreground italic">
                Configure the Intelligence Profile in Mission Settings or upload an RFP so IRIS can build the mission DNA.
              </p>
            ) : (
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <ProfileRow label="State" value={mission?.state} />
                <ProfileRow label="Client" value={mission?.client} />
                <ProfileRow label="Program" value={mission?.program_type} />
                <ProfileTags label="Focus Areas" tags={mission?.focus_areas ?? []} tone="primary" />
                <ProfileTags label="IRIS Search Terms" tags={mission?.iris_search_terms ?? []} />
                <ProfileTags label="Win Themes" tags={mission?.win_themes ?? []} tone="primary" />
                <ProfileTags label="Priority Topics" tags={mission?.priority_topics ?? []} />
                <ProfileTags label="Competitors" tags={mission?.competitors ?? []} tone="warn" />
              </dl>
            )}
          </div>
        )}
      </section>

      {/* IRIS RESEARCH FEED */}
      <section className="iris-panel rounded-[12px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h3 className="iris-label">IRIS Research Feed</h3>
            <LiveBadge />
            <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mono">
              {counts.complete} answered · {counts.in_progress + counts.pending} pending{counts.failed > 0 ? ` · ${counts.failed} failed` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
            {!dna ? (
              <button
                onClick={buildDna}
                disabled={running !== null}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {running === "dna" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                Build Intelligence DNA
              </button>
            ) : (counts.pending + counts.failed) > 0 ? (
              <button
                onClick={runResearch}
                disabled={running !== null}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {running === "research" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Run Research ({counts.pending + counts.failed})
              </button>
            ) : null}
          </div>
        </div>

        <ul className="divide-y divide-border">
          {feed.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground space-y-3">
              <div>
                {dna
                  ? "Intelligence DNA built but no research questions yet."
                  : profileEmpty
                    ? "Upload an RFP to the Vault first — IRIS will read it and build the research agenda."
                    : "No IRIS research yet. Build the intelligence DNA from the latest RFP in the Vault."}
              </div>
              {!profileEmpty && !dna && (
                <div className="pt-2">
                  <button
                    onClick={buildDna}
                    disabled={running !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12px] text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {running === "dna" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                    Build Intelligence DNA from latest RFP
                  </button>
                </div>
              )}
            </li>
          ) : (
            feed.map((row, idx) => (
              <ResearchFeedItem key={row.task_id} row={row} missionId={missionId} idx={idx} />
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground w-28 shrink-0">{label}</dt>
      <dd className="text-foreground">{value || <span className="text-muted-foreground italic">—</span>}</dd>
    </div>
  );
}

function ProfileTags({ label, tags, tone }: { label: string; tags: string[]; tone?: "primary" | "warn" }) {
  const cls =
    tone === "primary" ? "border-primary/30 bg-primary/5 text-primary" :
    tone === "warn" ? "border-amber-500/30 bg-amber-500/5 text-amber-400" :
    "border-border bg-background text-foreground/90";
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground w-28 shrink-0">{label}</dt>
      <dd className="flex flex-wrap gap-1">
        {tags.length === 0 && <span className="text-muted-foreground italic">—</span>}
        {tags.map((t) => (
          <span key={t} className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{t}</span>
        ))}
      </dd>
    </div>
  );
}

function ResearchFeedItem({ row, missionId, idx = 0 }: { row: ResearchFeedRow; missionId: string; idx?: number }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(idx < 3 && row.status === "complete");
  const [attachOpen, setAttachOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [discussOpen, setDiscussOpen] = useState(false);
  const [flash, setFlash] = useState<{ label: string; tone: "teal" | "red" } | null>(null);
  const fireFlash = (label: string, tone: "teal" | "red" = "teal") => {
    setFlash({ label, tone });
    window.setTimeout(() => setFlash(null), 1600);
  };

  const item: IntelItem = useMemo(() => ({
    id: row.result_id ?? row.task_id,
    source: "IRIS Research",
    type: "research",
    category: row.priority === "high" ? "PRIORITY" : "RESEARCH",
    title: row.question,
    summary: row.answer ?? row.why_it_matters ?? "",
    url: row.sources[0]?.url ?? null,
    published_at: row.generated_at,
    created_at: row.created_at,
  }), [row]);
  const insight = (row.answer ?? row.why_it_matters ?? "").slice(0, 600);

  const retry = useMutation({
    mutationFn: async () => {
      const { executeResearchTask } = await import("@/lib/iris-research.functions");
      await executeResearchTask({ data: { taskId: row.task_id } });
    },
    onSuccess: () => {
      toast.success("Research retried");
      qc.invalidateQueries({ queryKey: ["iris-research-feed", missionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveToVault = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const noteBody = row.answer
        ? `${row.answer}\n\nSources:\n${row.sources.map((s) => `• ${s.url}`).join("\n")}`
        : row.why_it_matters ?? "";
      const { error } = await supabase.from("mission_library").insert({
        mission_id: missionId,
        name: `IRIS: ${row.question.slice(0, 120)}`,
        category: "IRIS Research",
        url: row.sources[0]?.url ?? null,
        notes: noteBody,
        added_by_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved to Vault"); qc.invalidateQueries({ queryKey: ["mission-library"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareWithTeam = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      const { error } = await supabase.from("question_collaboration").insert({
        mission_id: missionId,
        question_id: "00000000-0000-0000-0000-000000000000",
        author_id: user!.id,
        author_name: prof?.display_name ?? "Member",
        entry_type: "note",
        body: `🧠 IRIS Research: ${row.question}\n\n${insight}`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Shared with team"),
    onError: (e: Error) => toast.error(e.message),
  });

  const flagForLeadership = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("signals").insert({
        mission_id: missionId,
        signal_type: "iris_alert",
        severity: "warning",
        signal_title: `IRIS research flagged: ${row.question.slice(0, 140)}`,
        signal_summary: insight,
        source_module: "oracle",
        user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Flagged for leadership"),
    onError: (e: Error) => toast.error(e.message),
  });

  const priorityCls =
    row.priority === "high" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
    row.priority === "low"  ? "border-border bg-background text-muted-foreground" :
                              "border-primary/30 bg-primary/5 text-primary";

  const statusCls =
    row.status === "complete"    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
    row.status === "in_progress" ? "border-primary/40 bg-primary/10 text-primary" :
    row.status === "failed"      ? "border-red-500/40 bg-red-500/10 text-red-300" :
                                   "border-border bg-background text-muted-foreground";

  return (
    <li className="relative px-5 py-4 feed-item" style={{ animationDelay: `${Math.min(idx, 12) * 80}ms` }}>
      <TransmittedFlash show={!!flash} label={flash?.label ?? ""} tone={flash?.tone ?? "teal"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${priorityCls}`}>
            {row.priority}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${statusCls}`}>
            {row.status === "in_progress" ? "researching…" : row.status}
          </span>
          {row.confidence && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              confidence: {row.confidence}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground mono">
            {relativeTime(row.generated_at ?? row.created_at)}
          </span>
        </div>

        <button
          onClick={() => row.status === "complete" && setExpanded((v) => !v)}
          className="mt-1.5 block text-left text-sm font-semibold text-foreground hover:text-primary"
        >
          {row.question}
        </button>

        {row.status === "failed" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-red-400">Research failed.</span>
            <button
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${retry.isPending ? "animate-spin" : ""}`} /> Retry
            </button>
          </div>
        )}

        {row.status === "complete" && expanded && row.answer && (
          <div className="mt-2 border-l-2 border-primary bg-primary/5 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary mb-1">IRIS Finding</div>
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {idx < 1 ? <TypewriterText text={row.answer} /> : row.answer}
            </p>
            {row.sources.length > 0 && (
              <div className="mt-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">Sources</div>
                <ul className="space-y-1">
                  {row.sources.slice(0, 8).map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline break-all">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{s.title ?? s.url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {row.follow_up_questions.length > 0 && (
              <div className="mt-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">Follow-up questions</div>
                <ul className="text-[11px] text-foreground/80 list-disc pl-4 space-y-0.5">
                  {row.follow_up_questions.slice(0, 4).map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {row.status === "complete" && !expanded && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.answer}</p>
        )}

        {row.why_it_matters && row.status !== "complete" && (
          <p className="mt-1 text-xs text-muted-foreground italic">Why it matters: {row.why_it_matters}</p>
        )}

        {row.status === "complete" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ActionBtn icon={<BookmarkPlus className="h-3 w-3" />} onClick={() => { saveToVault.mutate(); fireFlash("VAULTED ✓", "teal"); }} disabled={saveToVault.isPending}>
              Save to Vault
            </ActionBtn>
            <ActionBtn icon={<Link2 className="h-3 w-3" />} onClick={() => setAttachOpen(true)}>
              Attach to Section
            </ActionBtn>
            <ActionBtn icon={<Users className="h-3 w-3" />} onClick={() => { shareWithTeam.mutate(); fireFlash("TRANSMITTED ✓", "teal"); }} disabled={shareWithTeam.isPending}>
              Share with Team
            </ActionBtn>
            <ActionBtn icon={<Flag className="h-3 w-3" />} onClick={() => { flagForLeadership.mutate(); fireFlash("FLAGGED ✓", "red"); }} disabled={flagForLeadership.isPending}>
              Flag for Leadership
            </ActionBtn>
            <ActionBtn icon={<MessageSquarePlus className="h-3 w-3" />} onClick={() => setDiscussOpen(true)}>
              Create Discussion
            </ActionBtn>
            <ActionBtn icon={<Target className="h-3 w-3" />} onClick={() => setThemeOpen(true)}>
              Add to Win Theme
            </ActionBtn>
          </div>
        )}
      </div>

      {attachOpen && (
        <AttachToQuestionDialog missionId={missionId} item={item} insight={insight} onClose={() => setAttachOpen(false)} />
      )}
      {themeOpen && (
        <AddToThemeDialog missionId={missionId} item={item} insight={insight} onClose={() => setThemeOpen(false)} />
      )}
      {discussOpen && (
        <CreateDiscussionDialog missionId={missionId} item={item} insight={insight} onClose={() => setDiscussOpen(false)} />
      )}
    </li>
  );
}

function ActionBtn({ icon, children, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      {icon} {children}
    </button>
  );
}

function AttachToQuestionDialog({ missionId, item, insight, onClose }: { missionId: string; item: IntelItem; insight: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: questions = [] } = useQuery({
    queryKey: ["mip-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
  });

  const attach = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a question");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      const { error } = await supabase.from("question_collaboration").insert({
        mission_id: missionId,
        question_id: selected,
        author_id: user!.id,
        author_name: prof?.display_name ?? "Member",
        entry_type: "note",
        body: `📡 Intelligence attached: ${item.title}\n${insight}${item.url ? `\n${item.url}` : ""}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attached to question");
      qc.invalidateQueries({ queryKey: ["question-collaboration"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Attach to Section</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a question…</option>
            {questions.map((q: any) => (
              <option key={q.id} value={q.id}>{q.question_number} — {q.title}</option>
            ))}
          </select>
          <button
            onClick={() => attach.mutate()}
            disabled={!selected || attach.isPending}
            className="w-full rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {attach.isPending ? "Attaching…" : "Attach"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddToThemeDialog({ missionId, item, insight, onClose }: { missionId: string; item: IntelItem; insight: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: themes = [] } = useQuery({
    queryKey: ["mip-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,description")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const addToTheme = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a theme");
      const theme = themes.find((t: any) => t.id === selected) as any;
      const newDescription = `${theme?.description ?? ""}\n\n📡 ${item.title}: ${insight}${item.url ? ` (${item.url})` : ""}`.trim();
      const { error } = await supabase
        .from("win_themes")
        .update({ description: newDescription })
        .eq("id", selected);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Added to win theme"); qc.invalidateQueries({ queryKey: ["win-themes"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add to Win Theme</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No win themes yet. Add them in Mission Settings.</p>
          ) : (
            <>
              <select
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value || null)}
                className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a win theme…</option>
                {themes.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <button
                onClick={() => addToTheme.mutate()}
                disabled={!selected || addToTheme.isPending}
                className="w-full rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {addToTheme.isPending ? "Adding…" : "Add"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDiscussionDialog({ missionId, item, insight, onClose }: { missionId: string; item: IntelItem; insight: string; onClose: () => void }) {
  const [body, setBody] = useState(`Re: ${item.title}\n\n${insight}\n\nThoughts?`);
  const [questionId, setQuestionId] = useState<string>("");

  const { data: questions = [] } = useQuery({
    queryKey: ["mip-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!questionId) throw new Error("Select a question to anchor the discussion");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      const { error } = await supabase.from("question_collaboration").insert({
        mission_id: missionId,
        question_id: questionId,
        author_id: user!.id,
        author_name: prof?.display_name ?? "Member",
        entry_type: "question",
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Discussion started"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create Discussion</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <select
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Anchor to question…</option>
            {questions.map((q: any) => (
              <option key={q.id} value={q.id}>{q.question_number} — {q.title}</option>
            ))}
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!questionId || create.isPending}
            className="w-full rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Posting…" : "Start Discussion"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
