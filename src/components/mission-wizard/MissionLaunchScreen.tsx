import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Rocket, Calendar, Users, ShieldAlert, Sparkles, Target, FileText, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type Phase = "upload" | "analyzing" | "results" | "memory" | "intel" | "team" | "brain" | "insights";

type Check = {
  id: string;
  label: string;
  done: boolean;
  fixTo?: Phase;
};

type Snapshot = {
  name?: string | null;
  client_name?: string | null;
  state?: string | null;
  submission_deadline?: string | null;
  status?: string | null;
};

export function MissionLaunchScreen({
  missionId,
  onLaunched,
  onJumpToPhase,
}: {
  missionId: string;
  onLaunched: () => void;
  onJumpToPhase: (phase: Phase) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [themes, setThemes] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [team, setTeam] = useState<{ role: string; count: number }[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [memory, setMemory] = useState<{ title: string; content: string }[]>([]);
  const [insights, setInsights] = useState<{ title: string; content: string }[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    (async () => {
      const [m, t, r, tm, q, asg, mem, ins, docs] = await Promise.all([
        supabase.from("missions").select("name, client_name, state, submission_deadline, status").eq("id", missionId).maybeSingle(),
        supabase.from("win_themes").select("title").eq("mission_id", missionId).limit(8),
        supabase.from("mission_risks").select("description").eq("mission_id", missionId).limit(8),
        supabase.from("mission_team_members").select("mission_role").eq("mission_id", missionId),
        supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_assignments").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("iris_memories").select("title, content, category, tags").eq("mission_id", missionId).limit(20),
        supabase.from("iris_memories").select("title, content, tags").eq("mission_id", missionId).contains("tags", ["athena_insight"]).limit(8),
        supabase.from("mission_documents").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);

      setSnapshot(m.data ?? {});
      setThemes((t.data ?? []).map((x) => (x as { title: string }).title).filter(Boolean));
      setRisks((r.data ?? []).map((x) => (x as { description: string }).description).filter(Boolean));

      const roleCounts: Record<string, number> = {};
      (tm.data ?? []).forEach((x) => {
        const role = (x as { mission_role: string }).mission_role ?? "other";
        roleCounts[role] = (roleCounts[role] ?? 0) + 1;
      });
      setTeam(Object.entries(roleCounts).map(([role, count]) => ({ role, count })));

      setQuestionCount(q.count ?? 0);
      setAssignedCount(asg.count ?? 0);

      const memRows = (mem.data ?? []) as { title: string | null; content: string; category: string | null; tags: string[] | null }[];
      setMemory(
        memRows
          .filter((x) => !(x.tags ?? []).includes("athena_insight"))
          .slice(0, 6)
          .map((x) => ({ title: x.title ?? x.category ?? "Note", content: x.content })),
      );
      setInsights(
        ((ins.data ?? []) as { title: string | null; content: string }[]).map((x) => ({
          title: x.title ?? "Insight",
          content: x.content,
        })),
      );

      const docCount = docs.count ?? 0;
      const hasTeamSme = (tm.data ?? []).some((x) => {
        const r = (x as { mission_role: string }).mission_role;
        return r === "client_sme" || r === "athena_sme";
      });
      const hasWriters = (tm.data ?? []).some((x) => (x as { mission_role: string }).mission_role === "writer");
      const hasMemory = memRows.some((x) => (x.category ?? "").includes("win") || (x.tags ?? []).includes("win"));
      const hasInsights = (ins.data ?? []).length > 0;

      setChecks([
        { id: "docs", label: "Documents Loaded", done: docCount > 0, fixTo: "upload" },
        { id: "structure", label: "Mission Structure Built", done: (q.count ?? 0) > 0, fixTo: "results" },
        { id: "team", label: "Team Assigned", done: hasTeamSme && hasWriters, fixTo: "team" },
        { id: "strategy", label: "Strategy Captured", done: hasMemory || hasInsights, fixTo: "memory" },
        { id: "brain", label: "Mission Brain Trained", done: hasInsights, fixTo: "insights" },
      ]);

      setLoading(false);
    })();
  }, [missionId]);

  async function goLive() {
    setLaunching(true);
    try {
      await supabase.from("missions").update({ status: "Active" }).eq("id", missionId);
      await new Promise((res) => setTimeout(res, 900));
      onLaunched();
    } catch (e) {
      console.error("launch failed", e);
      setLaunching(false);
    }
  }

  const allChecksDone = checks.every((c) => c.done);
  const deadline = snapshot.submission_deadline
    ? new Date(snapshot.submission_deadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#0A1628", color: "white" }}>
      <div className="max-w-[920px] mx-auto">
        {/* IRIS header */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: "rgba(127,119,221,0.12)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 0 24px rgba(167,139,250,0.25)",
            }}
          >
            <IrisMark size={32} glow />
          </div>
          <div className="pt-1 flex-1">
            <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: "#C49A2B" }}>
              IRIS · Mission Dossier
            </div>
            <div className="text-white text-[18px] mt-1 leading-snug">
              This mission is ready.{" "}
              <span className="text-white/55">Your team has been briefed.</span>
            </div>
          </div>
        </div>

        {/* Pre-flight checklist */}
        <div
          className="rounded-xl p-5 mb-8"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/45 mb-4">
            Pre-flight checklist
          </div>
          <div className="space-y-2.5">
            {checks.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                {c.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#7BC47F" }} />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0" style={{ color: "#E8C26B" }} />
                )}
                <span
                  className="text-[14px] flex-1"
                  style={{ color: c.done ? "rgba(255,255,255,0.85)" : "#E8C26B" }}
                >
                  {c.label}
                </span>
                {!c.done && c.fixTo && (
                  <button
                    onClick={() => onJumpToPhase(c.fixTo!)}
                    className="text-[12px] font-medium"
                    style={{ color: "#C49A2B" }}
                  >
                    Complete now →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mission Snapshot */}
        <Section icon={<Target className="h-4 w-4" />} title="Mission Snapshot">
          <div className="grid grid-cols-2 gap-4 text-[13.5px]">
            <Field label="Mission" value={snapshot.name ?? "Untitled"} />
            <Field label="Client" value={snapshot.client_name ?? "—"} />
            <Field label="State" value={snapshot.state ?? "—"} />
            <Field label="Submission" value={deadline} />
          </div>
        </Section>

        {/* Win Themes */}
        <Section icon={<Sparkles className="h-4 w-4" />} title="Win Themes" count={themes.length}>
          {themes.length ? (
            <ul className="space-y-2">
              {themes.map((t, i) => (
                <li key={i} className="text-[13.5px] text-white/80 leading-relaxed pl-3 border-l-2" style={{ borderColor: "#C49A2B" }}>
                  {t}
                </li>
              ))}
            </ul>
          ) : <Empty label="No win themes captured." />}
        </Section>

        {/* Risks */}
        <Section icon={<ShieldAlert className="h-4 w-4" />} title="Risks" count={risks.length}>
          {risks.length ? (
            <ul className="space-y-2">
              {risks.map((r, i) => (
                <li key={i} className="text-[13.5px] text-white/80 leading-relaxed pl-3 border-l-2" style={{ borderColor: "#E57373" }}>
                  {r}
                </li>
              ))}
            </ul>
          ) : <Empty label="No risks logged." />}
        </Section>

        {/* Team */}
        <Section icon={<Users className="h-4 w-4" />} title="Team">
          {team.length ? (
            <div className="flex flex-wrap gap-2">
              {team.map((t) => (
                <span
                  key={t.role}
                  className="text-[12.5px] px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  {formatRole(t.role)} · <span className="text-white/55">{t.count}</span>
                </span>
              ))}
            </div>
          ) : <Empty label="No team assigned." />}
        </Section>

        {/* Timeline */}
        <Section icon={<Calendar className="h-4 w-4" />} title="Timeline">
          <div className="text-[13.5px] text-white/80">
            Submission deadline: <span className="text-white font-medium">{deadline}</span>
          </div>
        </Section>

        {/* Assignments */}
        <Section icon={<FileText className="h-4 w-4" />} title="Assignments">
          <div className="text-[13.5px] text-white/80">
            <span className="text-white font-medium">{assignedCount}</span> of{" "}
            <span className="text-white font-medium">{questionCount}</span> questions assigned.
          </div>
        </Section>

        {/* Mission Memory */}
        <Section icon={<Brain className="h-4 w-4" />} title="Mission Memory" count={memory.length}>
          {memory.length ? (
            <ul className="space-y-2.5">
              {memory.map((m, i) => (
                <li key={i} className="text-[13.5px]">
                  <span className="text-white/55">{m.title}: </span>
                  <span className="text-white/85">{m.content}</span>
                </li>
              ))}
            </ul>
          ) : <Empty label="No memory captured yet." />}
        </Section>

        {/* Athena Insights */}
        <Section icon={<Sparkles className="h-4 w-4" />} title="Athena Insights" count={insights.length}>
          {insights.length ? (
            <ul className="space-y-2.5">
              {insights.map((m, i) => (
                <li
                  key={i}
                  className="text-[13.5px] rounded-lg px-3 py-2.5"
                  style={{
                    background: "rgba(196,154,43,0.06)",
                    border: "1px solid rgba(196,154,43,0.25)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <span style={{ color: "#C49A2B", fontWeight: 600 }}>{m.title}. </span>
                  {m.content}
                </li>
              ))}
            </ul>
          ) : <Empty label="No strategic insights accepted." />}
        </Section>

        {/* Go Live */}
        <div className="mt-12 mb-8">
          {!allChecksDone && (
            <div className="text-center text-[12.5px] text-amber-300/80 mb-3">
              You can launch with gaps — IRIS will keep nudging the team to close them.
            </div>
          )}
          <button
            onClick={goLive}
            disabled={launching || loading}
            className={cn(
              "w-full rounded-xl py-5 text-[17px] font-semibold tracking-wide flex items-center justify-center gap-3 transition-all",
              (launching || loading) && "opacity-70 cursor-not-allowed",
            )}
            style={{
              background: "linear-gradient(180deg, #D9B04A 0%, #C49A2B 50%, #A37E1F 100%)",
              color: "#0A1628",
              boxShadow: "0 16px 50px -12px rgba(196,154,43,0.65), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <Rocket className="h-5 w-5" />
            {launching ? "Activating mission…" : "GO LIVE"}
          </button>
          <p className="text-center text-[12px] text-white/45 mt-3">
            Activates the mission and notifies the assigned team.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: "#C49A2B" }}>{icon}</span>
        <h3 className="text-[13px] uppercase tracking-[0.18em] text-white/75 font-medium">
          {title}
        </h3>
        {typeof count === "number" && (
          <span className="ml-auto text-[11px] text-white/40">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{label}</div>
      <div className="text-white/90">{value}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-[13px] text-white/40 italic">{label}</div>;
}

function formatRole(role: string) {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
