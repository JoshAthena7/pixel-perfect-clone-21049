import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowRight, Calendar, FileText, Sparkles, Users, Zap } from "lucide-react";
import { MissionHealthCard, WinThemesCard } from "@/components/v2/MissionHealthAndThemes";
import { ClientClarificationsCard } from "@/components/v2/ClientClarificationsCard";

export const Route = createFileRoute("/_authenticated/missions/$missionId/brief")({
  component: MissionBriefPage,
});

/* ─────────────────────── types ─────────────────────── */
type Mission = {
  id: string;
  name: string;
  client: string | null;
  state_agency: string | null;
  submission_date: string | null;
  qa_deadline: string | null;
  win_themes: string[] | null;
};
type Question = {
  id: string;
  health: string | null;
  current_score: number | null;
  status: string | null;
  win_theme_alignment_score: number | null;
};
type Member = {
  user_id: string;
  role: string;
  display_name: string | null;
  email?: string | null;
};
type Gate = { id: string; gate_name: string; target_date: string | null; gate_order: number };
type Decision = { id: string; title: string; owner: string | null; status: string };
type Risk = { id: string; title: string; severity: string; status: string };

/* ─────────────────────── helpers ─────────────────────── */
function daysTo(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
function fmtShort(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function countdownTone(n: number | null): string {
  if (n === null) return "text-muted-foreground";
  if (n < 0) return "text-muted-foreground line-through";
  if (n <= 7) return "text-red-300";
  if (n <= 21) return "text-amber-300";
  return "text-emerald-300";
}

/* ─────────────────────── page ─────────────────────── */
function MissionBriefPage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery<Mission | null>({
    queryKey: ["brief-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state_agency,submission_date,qa_deadline,win_themes")
        .eq("id", missionId)
        .maybeSingle();
      return (data ?? null) as Mission | null;
    },
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["brief-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,health,current_score,status,win_theme_alignment_score")
        .eq("mission_id", missionId);
      return (data ?? []) as Question[];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["brief-members", missionId],
    queryFn: async () => {
      const { data: mm } = await supabase
        .from("mission_members")
        .select("user_id,role,display_name")
        .eq("mission_id", missionId);
      const ids = (mm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ids);
      const pmap = new Map(profs?.map((p) => [p.id, p]) ?? []);
      return (mm ?? []).map((m) => {
        const p = pmap.get(m.user_id);
        return {
          ...m,
          display_name: m.display_name ?? p?.display_name ?? p?.email?.split("@")[0] ?? "Member",
          email: p?.email ?? null,
        } as Member;
      });
    },
  });

  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ["brief-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date,gate_order")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  const { data: decisions = [] } = useQuery<Decision[]>({
    queryKey: ["brief-decisions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_decisions")
        .select("id,title,owner,status")
        .eq("mission_id", missionId)
        .neq("status", "decided")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as Decision[];
    },
  });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["brief-risks", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_risks")
        .select("id,title,severity,status")
        .eq("mission_id", missionId)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as Risk[];
    },
  });

  const { data: docCount = 0 } = useQuery<number>({
    queryKey: ["brief-doc-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_vault_documents")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      return count ?? 0;
    },
  });

  const { data: oracle } = useQuery<string | null>({
    queryKey: ["brief-oracle", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_brief_cache")
        .select("brief_text,generated_at")
        .eq("scope", "mission")
        .eq("ref_id", missionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.brief_text ?? null;
    },
  });

  /* ── derived health ─────────────────────────── */
  const health = useMemo(() => {
    const total = questions.length || 1;
    const completed = questions.filter((q) => q.status === "approved").length;
    // F-6: win_theme_alignment_score has no writer yet — treat as null instead of
    // averaging missing values to 0 (which painted a misleading "0% alignment").
    const alignScores = questions
      .map((q) => q.win_theme_alignment_score)
      .filter((n): n is number => typeof n === "number");
    const alignment = alignScores.length
      ? Math.round(alignScores.reduce((a, b) => a + b, 0) / alignScores.length)
      : null;
    const riskCount = questions.filter((q) => q.health === "red").length;
    const yellowCount = questions.filter((q) => q.health === "yellow").length;
    const overall: "Red" | "Yellow" | "Green" =
      riskCount > 0 ? "Red" : yellowCount > 0 ? "Yellow" : "Green";
    return {
      overall,
      alignment,
      completeness: Math.round((completed / total) * 100),
      riskCount,
    };
  }, [questions]);

  const leadership = useMemo(() => {
    const pick = (role: string) => members.find((m) => m.role === role) ?? null;
    return [
      { label: "Engagement Lead", member: pick("engagement_lead") ?? pick("admin") },
      { label: "Project Manager", member: pick("project_manager") },
      { label: "Lead Writer", member: pick("lead_writer") },
      { label: "Lead Graphics", member: pick("lead_graphics") },
    ];
  }, [members]);

  const submissionDays = daysTo(mission?.submission_date ?? null);
  const qaDays = daysTo(mission?.qa_deadline ?? null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-5">
      {/* ── HEADER ─────────────────────── */}
      <header className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Mission Brief
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mission?.name ?? "Mission"}
        </h1>
        <div className="text-sm text-muted-foreground">
          {mission?.client ?? "—"}
          {mission?.state_agency ? ` · ${mission.state_agency}` : ""}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] pt-1">
          <span>
            <span className="text-muted-foreground">Submission</span>{" "}
            <span className="font-medium">{fmtShort(mission?.submission_date ?? null)}</span>{" "}
            <span className={countdownTone(submissionDays)}>
              · {submissionDays === null ? "—" : `${submissionDays}d`}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Q&amp;A Deadline</span>{" "}
            <span className="font-medium">{fmtShort(mission?.qa_deadline ?? null)}</span>{" "}
            <span className={countdownTone(qaDays)}>
              · {qaDays === null ? "—" : `${qaDays}d`}
            </span>
          </span>
          <Link
            to="/missions/$missionId/team"
            params={{ missionId }}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Users className="h-3 w-3" /> Team {members.length}
          </Link>
        </div>
      </header>

      {/* ── HEALTH + WIN THEMES ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MissionHealthCard
          overall={health.overall}
          alignment={health.alignment}
          completeness={health.completeness}
          riskCount={health.riskCount}
        />
        <WinThemesCard themes={mission?.win_themes ?? []} />
      </div>

      {/* ── ENTER COCKPIT — primary CTA, visible to all users ── */}
      <Link
        to="/missions/$missionId/cockpit"
        params={{ missionId }}
        className="group flex w-full items-center justify-center gap-3 rounded-xl px-6 py-5 text-base font-bold tracking-wide text-white shadow-2xl transition hover:-translate-y-0.5"
        style={{
          background: "#6366F1",
          boxShadow: "0 18px 50px rgba(99,102,241,0.35)",
        }}
      >
        <Zap className="h-5 w-5" />
        Enter Cockpit
        <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
      </Link>

      {/* ── KEY DATES ──────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" /> Key Dates
        </div>
        {gates.length === 0 ? (
          <div className="text-sm text-muted-foreground">No gates scheduled.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {gates.map((g) => {
              const n = daysTo(g.target_date);
              return (
                <div
                  key={g.id}
                  className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
                >
                  <div className="font-medium">{g.gate_name}</div>
                  <div className="text-muted-foreground">
                    {fmtShort(g.target_date)}{" "}
                    <span className={countdownTone(n)}>
                      · {n === null ? "—" : `${n}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── CLARIFICATIONS + KNOWLEDGE + ORACLE ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          <ClientClarificationsCard
            missionId={missionId}
            qaDeadline={mission?.qa_deadline ?? null}
            canManage={false}
          />
        </div>

        <Link
          to="/missions/$missionId/vault"
          params={{ missionId }}
          className="group rounded-lg border border-border bg-card p-4 hover:border-foreground/30 transition"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Mission Knowledge
          </div>
          <div className="text-2xl font-semibold">{docCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">documents in Vault</div>
          <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-foreground/80 group-hover:text-foreground">
            Open Vault <ArrowRight className="h-3 w-3" />
          </div>
        </Link>

        <Link
          to="/missions/$missionId/iris"
          params={{ missionId }}
          className="group rounded-lg border border-border bg-card p-4 hover:border-foreground/30 transition"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> IRIS Oracle
          </div>
          <div className="text-[12px] text-foreground/85 line-clamp-4">
            {oracle ?? "No oracle brief generated yet."}
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-foreground/80 group-hover:text-foreground">
            Open Oracle <ArrowRight className="h-3 w-3" />
          </div>
        </Link>
      </div>

      {/* ── DECISIONS + RISKS ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Open Decisions
            </div>
            <span className="text-[11px] text-muted-foreground">{decisions.length}</span>
          </div>
          {decisions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No open decisions.</div>
          ) : (
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-[13px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <div className="min-w-0">
                    <div className="truncate">{d.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.owner ?? "Unassigned"} · {d.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Open Risks
            </div>
            <span className="text-[11px] text-muted-foreground">{risks.length}</span>
          </div>
          {risks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No open risks.</div>
          ) : (
            <ul className="space-y-2">
              {risks.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-[13px]">
                  <AlertTriangle
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      r.severity === "high" || r.severity === "critical"
                        ? "text-red-400"
                        : "text-amber-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Severity {r.severity} · {r.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── LEADERSHIP ─────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Leadership
          </div>
          <Link
            to="/missions/$missionId/team"
            params={{ missionId }}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Full team <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {leadership.map((l) => (
            <div key={l.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {l.label}
              </div>
              <div className="text-[13px] font-medium truncate">
                {l.member?.display_name ?? "Unassigned"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
