/**
 * IRIS Intelligence Brief — six collapsible sections. Caches results
 * per (sectionId|questionId) key inside a Map so navigating between
 * sections in the Cascade Review never regenerates content for a
 * section already loaded in this session.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Search, UserCheck, FileBadge, FlaskConical, ChessKnight as Chess, Sparkles, Lock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { generateIntelligenceBrief, type BriefBody } from "@/lib/iris-brief.functions";

const GOLD = "#C9A55C";

export type IrisBriefContext = "cascade_review" | "thread" | "flight_deck";

type Props = {
  missionId: string;
  sectionId?: string | null;
  questionId?: string | null;
  contextType: IrisBriefContext;
};

const cache = new Map<string, BriefBody>();
const cacheKey = (m: string, s?: string | null, q?: string | null) => `${m}::${s ?? ""}::${q ?? ""}`;

export function IrisIntelligenceBrief({ missionId, sectionId = null, questionId = null }: Props) {
  const key = cacheKey(missionId, sectionId, questionId);
  const [brief, setBrief] = useState<BriefBody | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({
    asked: true, eval: true, policy: true, research: true, comp: true, rec: true,
  });
  const generate = useServerFn(generateIntelligenceBrief);
  const inflight = useRef<Promise<unknown> | null>(null);

  // Look up current user's role on this mission for competitive gating.
  const { data: roleInfo } = useQuery({
    queryKey: ["iris-brief-role", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isPrivileged: false };
      const [{ data: roles }, { data: tm }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("mission_team_members").select("mission_role").eq("mission_id", missionId).eq("member_id", user.id).maybeSingle(),
      ]);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const memberRole = (tm as { mission_role: string | null } | null)?.mission_role ?? "";
      const isEngagementLead = /engagement|lead|principal/i.test(memberRole);
      return { isPrivileged: isAdmin || isEngagementLead };
    },
  });
  const canSeeCompetitive = !!roleInfo?.isPrivileged;

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) { setBrief(cached); setLoading(false); setError(null); return; }
    setBrief(null);
    setLoading(true);
    setError(null);
    const p = generate({ data: { missionId, sectionId, questionId } })
      .then((b) => { cache.set(key, b); setBrief(b); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "IRIS couldn't generate the brief."))
      .finally(() => { setLoading(false); inflight.current = null; });
    inflight.current = p;
  }, [key, missionId, sectionId, questionId, generate]);

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="space-y-3">
      <Section
        id="asked"
        icon={<Search className="h-4 w-4" style={{ color: GOLD }} />}
        title="What They're Really Asking"
        open={open.asked}
        onToggle={() => toggle("asked")}
      >
        {loading && !brief ? <Skeleton className="h-16 w-full" /> :
         error && !brief ? <ErrText message={error} /> :
         <p className="italic text-sm text-foreground/90 leading-relaxed">{brief?.whats_asked || "—"}</p>}
      </Section>

      {(!brief || brief.has_evaluators) && (
        <Section
          id="eval"
          icon={<UserCheck className="h-4 w-4" style={{ color: GOLD }} />}
          title="Evaluator Intelligence"
          open={open.eval}
          onToggle={() => toggle("eval")}
        >
          {loading && !brief ? <Skeleton className="h-20 w-full" /> :
           !brief?.evaluator_intel.length ? <p className="text-xs text-muted-foreground">No evaluator profiles for this mission yet.</p> :
           <ul className="space-y-2 text-sm">
             {brief.evaluator_intel.map((b, i) => (
               <li key={i} className="flex gap-2"><UserCheck className="h-3 w-3 mt-1 shrink-0" style={{ color: GOLD }} /><span>{b}</span></li>
             ))}
           </ul>}
        </Section>
      )}

      <Section
        id="policy"
        icon={<FileBadge className="h-4 w-4" style={{ color: GOLD }} />}
        title="Policy Context"
        open={open.policy}
        onToggle={() => toggle("policy")}
      >
        {loading && !brief ? <Skeleton className="h-16 w-full" /> :
         <p className="text-sm leading-relaxed">{brief?.policy_context || "—"}</p>}
      </Section>

      <Section
        id="research"
        icon={<FlaskConical className="h-4 w-4" style={{ color: GOLD }} />}
        title="Research Evidence"
        open={open.research}
        onToggle={() => toggle("research")}
      >
        {loading && !brief ? <Skeleton className="h-24 w-full" /> :
         !brief?.research_evidence.length ? <p className="text-xs text-muted-foreground">No supporting research available yet.</p> :
         <ul className="space-y-2 text-sm">
           {brief.research_evidence.map((r, i) => (
             <li key={i} className="leading-relaxed">
               <span className="font-semibold" style={{ color: GOLD }}>{r.source}</span>
               {r.year ? <span className="text-muted-foreground"> ({r.year})</span> : null}
               <span> — {r.finding}</span>
               {r.source_url && (
                 <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-2 text-xs underline" style={{ color: GOLD }}>
                   View Source <ExternalLink className="h-3 w-3" />
                 </a>
               )}
             </li>
           ))}
         </ul>}
      </Section>

      {(!brief || brief.has_competitors) && (
        <Section
          id="comp"
          icon={<Chess className="h-4 w-4" style={{ color: GOLD }} />}
          title="Competitive Positioning"
          open={open.comp}
          onToggle={() => toggle("comp")}
        >
          {!canSeeCompetitive ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Lock className="h-3 w-3" /> Competitive intelligence is visible to Engagement Leads and Admins.
            </p>
          ) : loading && !brief ? <Skeleton className="h-16 w-full" /> :
             !brief?.competitive ? <p className="text-xs text-muted-foreground">No competitor data yet.</p> :
             <p className="text-sm leading-relaxed">{brief.competitive}</p>}
        </Section>
      )}

      <div className="rounded-lg border-l-4 p-4" style={{ borderLeftColor: GOLD, background: "rgba(201,165,92,0.06)" }}>
        <button onClick={() => toggle("rec")} className="w-full flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-base font-semibold" style={{ color: GOLD }}>
            <Sparkles className="h-4 w-4" /> IRIS Recommends
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open.rec ? "" : "-rotate-90"}`} style={{ color: GOLD }} />
        </button>
        {open.rec && (
          loading && !brief ? (
            <p className="text-sm italic text-muted-foreground">IRIS is formulating her recommendation…</p>
          ) : (
            <p className="text-[18px] leading-relaxed text-foreground">{brief?.iris_recommends || "—"}</p>
          )
        )}
      </div>
    </div>
  );
}

function Section({ id, icon, title, open, onToggle, children }: {
  id: string; icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <button onClick={onToggle} className="w-full flex items-center justify-between mb-2" aria-expanded={open} aria-controls={`brief-${id}`}>
        <span className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} style={{ color: GOLD }} />
      </button>
      {open && <div id={`brief-${id}`}>{children}</div>}
    </div>
  );
}

function ErrText({ message }: { message: string }) {
  return <p className="text-xs text-destructive">{message}</p>;
}

/** Useful helper for callers needing to reset cached briefs. */
export function clearIrisBriefCache() { cache.clear(); }
