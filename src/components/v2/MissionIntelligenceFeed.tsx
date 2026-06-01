import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { scoreAll, type IntelItem, type MissionProfile, type ScoredItem } from "@/lib/intelligence-feed";
import { Sparkles, BookmarkPlus, Link2, Users, Flag, MessageSquarePlus, Target, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type MissionRow = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  program_type: string | null;
  win_themes: string[] | null;
  priority_topics: string[] | null;
  competitors: string[] | null;
};

const LEVEL_BADGE: Record<ScoredItem["level"], string> = {
  HIGH: "border-destructive/40 bg-destructive/10 text-destructive",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  LOW: "border-border bg-background text-muted-foreground",
};

export function MissionIntelligenceFeed({ missionId }: { missionId: string }) {
  const [profileOpen, setProfileOpen] = useState(true);
  const [showLow, setShowLow] = useState(false);

  const { data: mission } = useQuery({
    queryKey: ["mip-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,program_type,win_themes,priority_topics,competitors")
        .eq("id", missionId)
        .maybeSingle();
      return data as MissionRow | null;
    },
  });

  const { data: items = [], refetch, isFetching } = useQuery({
    queryKey: ["mip-intel", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_intelligence")
        .select("id,source,type,category,title,summary,url,published_at,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as IntelItem[];
    },
  });

  const profile: MissionProfile = useMemo(() => ({
    state: mission?.state ?? null,
    client: mission?.client ?? null,
    competitors: mission?.competitors ?? [],
    win_themes: mission?.win_themes ?? [],
    priority_topics: mission?.priority_topics ?? [],
  }), [mission]);

  const scored = useMemo(() => scoreAll(items, profile), [items, profile]);
  const visible = showLow ? scored : scored.filter((s) => s.level !== "LOW");

  const profileEmpty =
    !mission?.state && !mission?.client &&
    (mission?.win_themes ?? []).length === 0 &&
    (mission?.priority_topics ?? []).length === 0 &&
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
            {profileEmpty ? "Not configured" : "Configured"}
          </span>
        </button>
        {profileOpen && (
          <div className="px-5 py-4">
            {profileEmpty ? (
              <p className="text-sm text-muted-foreground italic">
                Configure the Intelligence Profile in Mission Settings to start scoring intelligence relevance.
              </p>
            ) : (
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <ProfileRow label="State" value={mission?.state} />
                <ProfileRow label="Client" value={mission?.client} />
                <ProfileRow label="Program" value={mission?.program_type} />
                <ProfileTags label="Win Themes" tags={mission?.win_themes ?? []} tone="primary" />
                <ProfileTags label="Priority Topics" tags={mission?.priority_topics ?? []} />
                <ProfileTags label="Competitors" tags={mission?.competitors ?? []} tone="warn" />
              </dl>
            )}
          </div>
        )}
      </section>

      {/* FEED HEADER */}
      <section className="iris-panel rounded-[12px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h3 className="iris-label">Mission Intelligence Feed</h3>
            <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {visible.length} scored items
            </span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <ul className="divide-y divide-border">
          {scored.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">
              {profileEmpty
                ? "Set up the Mission Profile to begin relevance scoring."
                : "No relevant intelligence yet. IRIS will surface items as they arrive."}
            </li>
          ) : (
            visible.map((s) => (
              <FeedItem key={s.item.id} scored={s} missionId={missionId} />
            ))
          )}
        </ul>

        {!showLow && scored.some((s) => s.level === "LOW") && (
          <div className="border-t border-border px-5 py-3 text-center">
            <button
              onClick={() => setShowLow(true)}
              className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              Show {scored.filter((s) => s.level === "LOW").length} low-relevance items
            </button>
          </div>
        )}
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

function FeedItem({ scored, missionId }: { scored: ScoredItem; missionId: string }) {
  const qc = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [discussOpen, setDiscussOpen] = useState(false);

  const { item, level, insight, matchedThemes } = scored;

  const saveToVault = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("mission_library").insert({
        mission_id: missionId,
        name: item.title ?? "Intelligence item",
        category: "Market Intelligence",
        url: item.url,
        notes: insight,
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
        question_id: "00000000-0000-0000-0000-000000000000", // mission-level note (not tied to a question)
        author_id: user!.id,
        author_name: prof?.display_name ?? "Member",
        entry_type: "note",
        body: `📡 Intelligence shared: ${item.title}\n${insight}${item.url ? `\n${item.url}` : ""}`,
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
        signal_title: `Intelligence flagged for leadership review: ${item.title}`,
        signal_summary: insight,
        source_module: "oracle",
        user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Flagged for leadership"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${LEVEL_BADGE[level]}`}>
          {level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.category && (
              <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-primary">
                {item.category}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{item.source}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {relativeTime(item.published_at ?? item.created_at)}
            </span>
          </div>

          <a
            href={item.url ?? "#"}
            target={item.url ? "_blank" : undefined}
            rel="noreferrer"
            className="mt-1.5 block text-sm font-semibold text-foreground hover:text-primary"
          >
            {item.title}
          </a>

          {/* IRIS INSIGHT */}
          <div className="mt-2 border-l-2 border-primary bg-primary/5 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary mb-0.5">IRIS Insight</div>
            <p className="text-xs text-foreground/90 leading-relaxed">{insight}</p>
          </div>

          {matchedThemes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {matchedThemes.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ActionBtn icon={<BookmarkPlus className="h-3 w-3" />} onClick={() => saveToVault.mutate()} disabled={saveToVault.isPending}>
              Save to Vault
            </ActionBtn>
            <ActionBtn icon={<Link2 className="h-3 w-3" />} onClick={() => setAttachOpen(true)}>
              Attach to Question
            </ActionBtn>
            <ActionBtn icon={<Users className="h-3 w-3" />} onClick={() => shareWithTeam.mutate()} disabled={shareWithTeam.isPending}>
              Share with Team
            </ActionBtn>
            <ActionBtn icon={<Flag className="h-3 w-3" />} onClick={() => flagForLeadership.mutate()} disabled={flagForLeadership.isPending}>
              Flag for Leadership
            </ActionBtn>
            <ActionBtn icon={<MessageSquarePlus className="h-3 w-3" />} onClick={() => setDiscussOpen(true)}>
              Create Discussion
            </ActionBtn>
            <ActionBtn icon={<Target className="h-3 w-3" />} onClick={() => setThemeOpen(true)}>
              Add to Win Theme
            </ActionBtn>
          </div>
        </div>
      </div>

      {attachOpen && (
        <AttachToQuestionDialog
          missionId={missionId}
          item={item}
          insight={insight}
          onClose={() => setAttachOpen(false)}
        />
      )}
      {themeOpen && (
        <AddToThemeDialog
          missionId={missionId}
          item={item}
          insight={insight}
          onClose={() => setThemeOpen(false)}
        />
      )}
      {discussOpen && (
        <CreateDiscussionDialog
          missionId={missionId}
          item={item}
          insight={insight}
          onClose={() => setDiscussOpen(false)}
        />
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
        <DialogHeader><DialogTitle>Attach to Question</DialogTitle></DialogHeader>
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
