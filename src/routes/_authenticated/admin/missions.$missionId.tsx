import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Brain, FileText, ListChecks, LayoutGrid, Sliders, ShieldCheck, Check, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";
import MissionWizard from "@/components/olympus/MissionWizard";

type Tab = "overview" | "sections" | "intelligence" | "requirements" | "setup" | "oversight" | "closeout";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    if (t === "overview" || t === "sections" || t === "intelligence" || t === "requirements" || t === "setup" || t === "oversight" || t === "closeout") return { tab: t };
    return {};
  },
  component: MissionDetail,
});

function MissionDetail() {
  const { missionId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate();

  const { data: mission, isLoading, error } = useQuery({
    queryKey: ["olympus-mission", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading mission…</div>;
  if (error) {
    return (
      <div className="p-8">
        <div className="text-lg font-semibold text-rose-300">Failed to load mission</div>
        <div className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</div>
        <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> All Missions
        </Link>
      </div>
    );
  }
  if (!mission) {
    return (
      <div className="p-8">
        <div className="text-lg font-semibold">Mission not found</div>
        <div className="mt-1 text-xs text-muted-foreground">ID: {missionId}</div>
        <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> All Missions
        </Link>
      </div>
    );
  }

  const setTab = (t: Tab) =>
    navigate({ to: "/admin/missions/$missionId", params: { missionId }, search: { tab: t } });

  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All Missions
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <h1 className="truncate text-sm font-semibold text-foreground">{mission.name}</h1>
          {mission.client && <span className="text-xs text-muted-foreground">{mission.client}</span>}
          <MissionStatusBadge status={mission.mission_status ?? mission.status} />
        </div>
        <FastReportsMenu />
      </header>

      <div className="border-b border-border bg-surface/20 px-5">
        <nav className="flex gap-1 overflow-x-auto">
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={<LayoutGrid className="h-3.5 w-3.5" />}>Overview</TabBtn>
          <TabBtn active={tab === "sections"} onClick={() => setTab("sections")} icon={<FileText className="h-3.5 w-3.5" />}>Sections</TabBtn>
          <TabBtn active={tab === "intelligence"} onClick={() => setTab("intelligence")} icon={<Brain className="h-3.5 w-3.5" />}>Intelligence</TabBtn>
          <TabBtn active={tab === "requirements"} onClick={() => setTab("requirements")} icon={<ListChecks className="h-3.5 w-3.5" />}>Requirements</TabBtn>
          {((mission.wizard_step ?? 0) < 7) && (
            <TabBtn active={tab === "setup"} onClick={() => setTab("setup")} icon={<Sliders className="h-3.5 w-3.5" />}>Setup</TabBtn>
          )}
          {(mission.mission_status === "Live" || mission.mission_status === "Live with Pending Edits") && (
            <TabBtn active={tab === "oversight"} onClick={() => setTab("oversight")} icon={<ShieldCheck className="h-3.5 w-3.5" />}>Oversight</TabBtn>
          )}
          {(mission.mission_status === "Live" || mission.mission_status === "Live with Pending Edits" || mission.status === "ACTIVE") && (
            <TabBtn active={tab === "closeout"} onClick={() => setTab("closeout")} icon={<Archive className="h-3.5 w-3.5" />}>Closeout</TabBtn>
          )}
        </nav>
      </div>

      <div className="p-5">
        {tab === "overview" && <OverviewTab missionId={missionId} mission={mission} />}
        {tab === "sections" && <SectionsTab missionId={missionId} />}
        {tab === "intelligence" && <IntelligenceTab missionId={missionId} />}
        {tab === "requirements" && <RequirementsTab missionId={missionId} />}
        {tab === "setup" && <SetupTab missionId={missionId} mission={mission} />}
        {tab === "oversight" && <OversightTab missionId={missionId} mission={mission} />}
        {tab === "closeout" && <CloseoutTab missionId={missionId} mission={mission} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? "border-[color:var(--athena-gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─── Overview ─── */
function OverviewTab({ missionId, mission }: { missionId: string; mission: any }) {
  const { data: sections = [] } = useQuery({
    queryKey: ["ov-sections", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("question_records").select("id,health,status").eq("mission_id", missionId);
      return data ?? [];
    },
  });
  const { data: reqs = [] } = useQuery({
    queryKey: ["ov-reqs", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_requirements").select("id,severity").eq("mission_id", missionId);
      return data ?? [];
    },
  });
  const { data: latestIntel } = useQuery({
    queryKey: ["ov-intel", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_intelligence")
        .select("layer,content,generated_at")
        .eq("mission_id", missionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const complete = sections.filter((s: any) => s.status === "complete" || s.health === "green").length;
  const totalReqs = reqs.length;
  const greenReqs = reqs.filter((r: any) => (r.severity ?? "").toLowerCase() === "standard").length;

  return (
    <div className="space-y-4">
      {mission.mission_status === "Live with Pending Edits" && (
        <PendingEditsBanner missionId={missionId} />
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Sections Complete" value={`${complete} / ${sections.length}`} />
            <StatCard label="Requirements Coverage" value={totalReqs ? `${greenReqs} / ${totalReqs}` : "—"} />
            <StatCard label="Submission Date" value={formatDate(mission.submission_date)} sub={mission.submission_date ? countdown(mission.submission_date) : undefined} />
            <StatCard label="IRIS Last Run" value={latestIntel?.generated_at ? formatDate(latestIntel.generated_at) : "Never"} />
          </div>
        </div>
        <section className="rounded-lg border border-border bg-surface/40 p-4">
          <header className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-[color:var(--athena-gold)]" />
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.28em]">IRIS Next Action</h2>
          </header>
          {latestIntel ? (
            <div>
              <div className="mb-2 inline-flex rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                {latestIntel.layer}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-6">
                {summarize(latestIntel.content)}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground">IRIS has not analyzed this mission.</p>
              <Link to="/admin/intel-engine" className="mt-3 inline-flex text-xs font-medium text-amber-300 hover:underline">
                Run IRIS Engine →
              </Link>
            </div>
          )}
        </section>
      </div>
      <ChangeLogSection missionId={missionId} mission={mission} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ─── Sections ─── */
function SectionsTab({ missionId }: { missionId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["tab-sections", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,section_number,title,health,status,pens_down_date,assigned_writer_id,assigned_sme_id")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set([...rows.map((r: any) => r.assigned_writer_id), ...rows.map((r: any) => r.assigned_sme_id)].filter(Boolean)));
      const profMap: Record<string, string> = {};
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
        (ps ?? []).forEach((p: any) => { profMap[p.id] = p.display_name || p.email || "—"; });
      }
      return rows.map((r: any) => ({
        ...r,
        writer: r.assigned_writer_id ? profMap[r.assigned_writer_id] : null,
        sme: r.assigned_sme_id ? profMap[r.assigned_sme_id] : null,
      }));
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <Empty>No sections yet. Complete the Setup Record first.</Empty>;

  const soon = (d: string | null) => {
    if (!d) return false;
    const ms = new Date(d).getTime() - Date.now();
    return ms > 0 && ms < 3 * 86400000;
  };

  return (
    <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th>Section</Th><Th>Writer</Th><Th>SME</Th><Th>Due</Th><Th>Health</Th><Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((s: any) => (
            <tr key={s.id} className="border-t border-border/60">
              <Td>
                <div className="text-foreground">{s.section_number ?? "—"}</div>
                <div className="max-w-[20rem] truncate text-[11px] text-muted-foreground">{s.title}</div>
              </Td>
              <Td>{s.writer ?? <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">Unassigned</span>}</Td>
              <Td>{s.sme ?? <span className="text-muted-foreground">—</span>}</Td>
              <Td className={soon(s.pens_down_date) ? "text-amber-300" : "text-muted-foreground"}>{formatDate(s.pens_down_date)}</Td>
              <Td><HealthDot value={s.health} /></Td>
              <Td className="text-muted-foreground">{s.status ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Intelligence ─── */
function IntelligenceTab({ missionId }: { missionId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["tab-intel", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_intelligence")
        .select("id,layer,content,generated_at")
        .eq("mission_id", missionId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <Empty>IRIS has not generated intelligence for this mission.</Empty>;

  // Most recent per layer
  const byLayer = new Map<string, any>();
  for (const r of data) if (!byLayer.has(r.layer)) byLayer.set(r.layer, r);

  return (
    <div className="space-y-3">
      {Array.from(byLayer.values()).map((r: any) => {
        const isOpen = !!open[r.id];
        const text = summarize(r.content);
        return (
          <div key={r.id} className="rounded-lg border border-border bg-surface/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{r.layer}</span>
              <span className="text-[11px] text-muted-foreground">{formatDateTime(r.generated_at)}</span>
            </div>
            <p className={`text-sm text-foreground/80 whitespace-pre-wrap ${isOpen ? "" : "line-clamp-4"}`}>{text}</p>
            <button onClick={() => setOpen((s) => ({ ...s, [r.id]: !isOpen }))} className="mt-2 text-xs text-amber-300 hover:underline">
              {isOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Requirements ─── */
function RequirementsTab({ missionId }: { missionId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["tab-reqs", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_requirements")
        .select("id,requirement_text,plain_language,severity,section_reference,is_federal")
        .eq("mission_id", missionId)
        .order("severity", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <Empty>No requirements extracted. Run IRIS to extract requirements.</Empty>;

  const sevColor = (sev: string) => {
    const s = sev?.toLowerCase();
    if (s === "critical") return "bg-rose-500";
    if (s === "important") return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-surface/40 p-3 text-sm text-muted-foreground">
        {data.length} requirement{data.length === 1 ? "" : "s"} extracted.
      </div>
      <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
        <ul className="divide-y divide-border/60">
          {data.map((r: any) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevColor(r.severity)}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground">{r.plain_language || r.requirement_text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {r.section_reference && <span>§ {r.section_reference}</span>}
                  <span className="uppercase tracking-wider">{r.severity}</span>
                  {r.is_federal && <span className="rounded border border-border px-1 py-0.5">Federal</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Setup ─── */
const SETUP_STEPS = [
  "Mission Basics",
  "Source Materials",
  "IRIS Review",
  "Review Record",
  "Build Team",
  "Readiness & GO LIVE",
];

function SetupTab({ missionId, mission }: { missionId: string; mission: any }) {
  const qc = useQueryClient();
  const [wizardStart, setWizardStart] = useState<number | null>(null);
  const completed = Math.min(6, mission.wizard_step ?? 0);
  const current = Math.max(1, Math.min(6, completed + 1));

  const openAt = (n: number) => setWizardStart(n);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface/40 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Setup Progress</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              Step {current} of 6 — {SETUP_STEPS[current - 1]}
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAt(current)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-black"
            style={{ backgroundColor: "#C9A84C" }}
          >
            Continue Setup →
          </button>
        </div>

        <ol className="flex flex-wrap items-center gap-2">
          {SETUP_STEPS.map((label, i) => {
            const num = i + 1;
            const isDone = num <= completed;
            const isCurrent = num === current && completed < 6;
            const clickable = isDone || isCurrent;
            return (
              <li key={num} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && openAt(num)}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    isDone
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                      : isCurrent
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-100"
                      : "border-border bg-surface/30 text-muted-foreground/60 cursor-not-allowed"
                  }`}
                >
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    isDone ? "bg-emerald-500 text-black" : isCurrent ? "bg-amber-400 text-black" : "bg-border/60 text-muted-foreground"
                  }`}>
                    {isDone ? <Check className="h-2.5 w-2.5" /> : num}
                  </span>
                  {label}
                </button>
                {num < 6 && <span className="text-muted-foreground/40">·</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <MissionWizard
        open={wizardStart !== null}
        onClose={() => {
          setWizardStart(null);
          qc.invalidateQueries({ queryKey: ["olympus-mission", missionId] });
        }}
        missionId={missionId}
        startStep={wizardStart ?? 1}
      />
    </div>
  );
}

/* ─── Oversight ─── */
function OversightTab({ missionId, mission }: { missionId: string; mission: any }) {
  const qc = useQueryClient();
  const { data: team = [] } = useQuery({
    queryKey: ["oversight-team", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("*")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const [syncing, setSyncing] = useState(false);

  const syncAtlas = async () => {
    setSyncing(true);
    try {
      const { data: intel } = await supabase
        .from("mission_intelligence")
        .select("content")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .maybeSingle();
      const content = (intel?.content ?? {}) as Record<string, unknown>;
      const themes = Array.isArray(content.recommended_win_themes) ? (content.recommended_win_themes as string[]) : [];
      const flags = Array.isArray(content.compliance_flags) ? (content.compliance_flags as string[]) : [];

      if (themes.length) {
        await supabase.from("win_themes").upsert(
          themes.map((t) => ({ mission_id: missionId, theme: t })) as never,
          { onConflict: "mission_id,theme" } as never,
        );
      }
      if (flags.length) {
        await supabase.from("compliance_requirements").upsert(
          flags.map((f) => ({
            mission_id: missionId,
            requirement_text: f,
            plain_language: f,
            severity: "important",
          })) as never,
        );
      }
      const updates: Record<string, unknown> = { atlas_synced_at: new Date().toISOString() };
      if (mission.mission_status === "Live with Pending Edits") {
        updates.mission_status = "Live";
      }
      await supabase
        .from("missions")
        .update(updates as never)
        .eq("id", missionId);
      await supabase
        .from("mission_change_log")
        .update({ synced_to_atlas: true } as never)
        .eq("mission_id", missionId)
        .eq("synced_to_atlas", false);
      toast.success("Synced to Atlas");
      qc.invalidateQueries({ queryKey: ["olympus-mission", missionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const isOk = (v: string | null) => v === "complete" || v === "signed" || v === "active";
  const rowColor = (m: any) => {
    const items = [m.talentdesk_status, m.contract_status, m.nda_status];
    if (m.baa_required) items.push(m.baa_status);
    const expired = items.some((x) => x === "expired");
    if (expired) return "bg-rose-500/10";
    const allOk = items.every((x) => isOk(x));
    if (allOk) return "bg-emerald-500/5";
    return "bg-amber-500/10";
  };

  const counts = {
    unsignedContracts: team.filter((m: any) => m.contract_status !== "signed").length,
    unsignedNDAs: team.filter((m: any) => m.nda_status !== "signed" && m.nda_status !== "waived").length,
    notActiveTalent: team.filter((m: any) => m.talentdesk_status !== "active").length,
    unsignedBAAs: team.filter((m: any) => m.baa_required && m.baa_status !== "signed").length,
  };

  const days = mission.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;
  const deadlineColor = days == null ? "text-muted-foreground" : days > 30 ? "text-emerald-300" : days > 7 ? "text-amber-300" : "text-rose-300";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Team Status */}
      <section className="rounded-lg border border-border bg-surface/40 p-4 lg:col-span-2">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Team Status</h2>
        {team.length === 0 ? (
          <Empty>No team members yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <Th>Name</Th><Th>Role</Th><Th>TalentDesk</Th><Th>Contract</Th><Th>NDA</Th><Th>BAA</Th><Th>Start</Th>
                </tr>
              </thead>
              <tbody>
                {team.map((m: any) => (
                  <tr key={m.id} className={`border-t border-border/60 ${rowColor(m)}`}>
                    <Td>{m.name}</Td>
                    <Td className="text-muted-foreground">{m.role}</Td>
                    <Td><StatusPill v={m.talentdesk_status} okValue="active" /></Td>
                    <Td><StatusPill v={m.contract_status} okValue="signed" /></Td>
                    <Td><StatusPill v={m.nda_status} okValue="signed" waivable /></Td>
                    <Td>{m.baa_required ? <StatusPill v={m.baa_status} okValue="signed" /> : <span className="text-muted-foreground">n/a</span>}</Td>
                    <Td className="text-muted-foreground">{formatDate(m.start_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open Items */}
      <section className="rounded-lg border border-border bg-surface/40 p-4">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Open Items</h2>
        <ul className="space-y-2 text-sm">
          <OpenItem label="Unsigned contracts" count={counts.unsignedContracts} />
          <OpenItem label="Unsigned NDAs" count={counts.unsignedNDAs} />
          <OpenItem label="Not active in TalentDesk" count={counts.notActiveTalent} />
          <OpenItem label="Unsigned BAAs" count={counts.unsignedBAAs} />
        </ul>
      </section>

      {/* Deadline */}
      <section className="rounded-lg border border-border bg-surface/40 p-4">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Deadline Tracker</h2>
        <div className="text-xs text-muted-foreground">Submission Date</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{formatDate(mission.submission_date)}</div>
        <div className={`mt-2 text-2xl font-bold ${deadlineColor}`}>
          {days == null ? "—" : days < 0 ? `${Math.abs(days)} days past` : days === 0 ? "Today" : `${days} days remaining`}
        </div>
      </section>

      {/* Atlas Sync */}
      <section className="rounded-lg border border-border bg-surface/40 p-4 lg:col-span-2">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Atlas Sync</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {mission.atlas_synced_at
              ? `Last synced ${formatDateTime(mission.atlas_synced_at)}`
              : "Never synced to Atlas."}
          </div>
          <button
            type="button"
            onClick={syncAtlas}
            disabled={syncing}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync Changes to Atlas"}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ v, okValue, waivable }: { v: string | null; okValue: string; waivable?: boolean }) {
  const ok = v === okValue || (waivable && v === "waived");
  const expired = v === "expired";
  const cls = ok
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : expired
    ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {v ?? "pending"}
    </span>
  );
}

function OpenItem({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-surface/30 px-3 py-2">
      <span className="text-foreground/80">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${count === 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
        {count}
      </span>
    </li>
  );
}

/* ─── Shared ─── */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border bg-surface/20 p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
function HealthDot({ value }: { value: string | null }) {
  const v = (value ?? "").toLowerCase();
  const color = v === "green" ? "bg-emerald-500" : v === "yellow" ? "bg-amber-500" : v === "red" ? "bg-rose-500" : "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs capitalize">{value ?? "—"}</span>
    </span>
  );
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return iso; }
}
function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (days < 0) return `${Math.abs(days)} days past`;
  if (days === 0) return "Today";
  return `in ${days} days`;
}
function summarize(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content.slice(0, 800);
  if (typeof content === "object") {
    const c: any = content;
    if (typeof c.summary === "string") return c.summary;
    if (typeof c.text === "string") return c.text;
    if (typeof c.body === "string") return c.body;
    if (Array.isArray(c.key_risks) && c.key_risks.length > 0) {
      return c.key_risks.map((r: any) => `• ${r.risk}`).join("\n");
    }
    if (Array.isArray(c.emerging_themes) && c.emerging_themes.length > 0) {
      return c.emerging_themes.map((t: any) => `• ${t.theme}: ${t.strategic_implication}`).join("\n");
    }
    if (Array.isArray(c.recommendations) && c.recommendations.length > 0) {
      return c.recommendations.map((r: any) => `• ${typeof r === "string" ? r : r.recommendation || r.text || JSON.stringify(r)}`).join("\n");
    }
    const firstArray = Object.values(c).find((v) => Array.isArray(v)) as any[] | undefined;
    if (firstArray && firstArray.length > 0) {
      return firstArray.map((item: any) => `• ${typeof item === "string" ? item : item.risk || item.theme || item.text || item.recommendation || JSON.stringify(item)}`).join("\n").slice(0, 800);
    }
    try { return JSON.stringify(content, null, 2).slice(0, 800); } catch { return ""; }
  }
  return String(content);
}

/* ─── Closeout ─── */
const CLOSEOUT_ITEMS: { key: string; label: string }[] = [
  { key: "client_access_removed", label: "Client access removed for all team members" },
  { key: "final_invoices_submitted", label: "Final invoices submitted" },
  { key: "contracts_marked_closed", label: "Contracts marked closed" },
  { key: "documents_archived", label: "Documents archived to final storage" },
  { key: "lessons_learned_documented", label: "Lessons learned documented" },
  { key: "team_feedback_collected", label: "Team feedback collected" },
];

function CloseoutTab({ missionId, mission }: { missionId: string; mission: any }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const initialChecklist: Record<string, boolean> = {};
  for (const item of CLOSEOUT_ITEMS) {
    initialChecklist[item.key] = !!(mission.closeout_checklist?.[item.key]);
  }
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialChecklist);

  const initialNotes = (mission.closeout_notes ?? {}) as Record<string, string>;
  const [notes, setNotes] = useState({
    went_well: initialNotes.went_well ?? "",
    improvements: initialNotes.improvements ?? "",
    reusable_intelligence: initialNotes.reusable_intelligence ?? "",
  });
  const [archiving, setArchiving] = useState(false);

  const toggle = async (key: string) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    const { error } = await supabase
      .from("missions")
      .update({ closeout_checklist: next } as never)
      .eq("id", missionId);
    if (error) {
      toast.error(error.message);
      setChecklist(checklist);
    }
  };

  const saveNotes = async () => {
    const { error } = await supabase
      .from("missions")
      .update({ closeout_notes: notes } as never)
      .eq("id", missionId);
    if (error) toast.error(error.message);
  };

  const allChecked = CLOSEOUT_ITEMS.every((i) => checklist[i.key]);

  const archive = async () => {
    if (!window.confirm(`Archive ${mission.name}? The mission will move to archived view and all access should be reviewed.`)) return;
    setArchiving(true);
    const { error } = await supabase
      .from("missions")
      .update({
        status: "ARCHIVED",
        closed_at: new Date().toISOString(),
        wizard_step: 11,
      } as never)
      .eq("id", missionId);
    setArchiving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mission archived.");
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    qc.invalidateQueries({ queryKey: ["olympus-mission", missionId] });
    navigate({ to: "/admin" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Checklist */}
      <section className="rounded-lg border border-border bg-surface/40 p-4 lg:col-span-2">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Closeout Checklist</h2>
        <ul className="space-y-2">
          {CLOSEOUT_ITEMS.map((item) => {
            const on = !!checklist[item.key];
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => toggle(item.key)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    on
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                      : "border-border bg-surface/30 text-foreground hover:bg-surface-hover"
                  }`}
                >
                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${on ? "border-emerald-500 bg-emerald-500" : "border-border"}`}>
                    {on && <Check className="h-3 w-3 text-black" />}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Lessons Learned */}
      <section className="rounded-lg border border-border bg-surface/40 p-4 lg:col-span-2">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Lessons Learned</h2>
        <div className="space-y-3">
          <NoteField
            label="What went well?"
            value={notes.went_well}
            onChange={(v) => setNotes({ ...notes, went_well: v })}
            onBlur={saveNotes}
          />
          <NoteField
            label="What could be improved?"
            value={notes.improvements}
            onChange={(v) => setNotes({ ...notes, improvements: v })}
            onBlur={saveNotes}
          />
          <NoteField
            label="Reusable intelligence for future missions"
            value={notes.reusable_intelligence}
            onChange={(v) => setNotes({ ...notes, reusable_intelligence: v })}
            onBlur={saveNotes}
          />
        </div>
      </section>

      {/* Archive */}
      <section className="rounded-lg border border-border bg-surface/40 p-4 lg:col-span-2">
        <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">Archive</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {allChecked
              ? "All closeout items complete. Ready to archive."
              : `Complete all 6 checklist items before archiving (${Object.values(checklist).filter(Boolean).length}/6 done).`}
          </div>
          <button
            type="button"
            onClick={archive}
            disabled={!allChecked || archiving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "#C9A84C" }}
          >
            <Archive className="h-3.5 w-3.5" />
            {archiving ? "Archiving…" : "Archive Mission"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NoteField({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={3}
        className="w-full resize-y rounded-md border border-border bg-surface/40 px-3 py-2 text-sm"
      />
    </label>
  );
}

/* ─── Status badge ─── */
const STATUS_STYLES: Record<string, string> = {
  "Draft": "bg-muted text-muted-foreground border-border",
  "IRIS Review Needed": "bg-violet-500/15 text-violet-200 border-violet-500/40",
  "Ready for Review": "bg-sky-500/15 text-sky-200 border-sky-500/40",
  "Ready to Go Live": "bg-amber-500/15 text-amber-200 border-amber-500/40",
  "Live": "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  "Live with Pending Edits": "bg-amber-500/20 text-amber-100 border-amber-500/60",
  "Locked": "bg-rose-500/15 text-rose-200 border-rose-500/40",
};
function MissionStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const cls = STATUS_STYLES[status] ?? "bg-surface border-border text-foreground";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

/* ─── Pending edits banner ─── */
function PendingEditsBanner({ missionId }: { missionId: string }) {
  const { data: count = 0 } = useQuery({
    queryKey: ["pending-edits-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_change_log")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId)
        .eq("synced_to_atlas", false);
      return count ?? 0;
    },
  });
  return (
    <div className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Pending edits — {count} change{count === 1 ? "" : "s"} not yet synced to Atlas.
      Go to the Oversight tab and click <span className="font-semibold">Sync Changes to Atlas</span> when ready.
    </div>
  );
}

/* ─── Change log ─── */
function ChangeLogSection({ missionId, mission }: { missionId: string; mission: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["change-log", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_change_log")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["change-log", missionId] });
    qc.invalidateQueries({ queryKey: ["pending-edits-count", missionId] });
    qc.invalidateQueries({ queryKey: ["olympus-mission", missionId] });
  };

  const lockIn = async (id: string) => {
    const { error } = await supabase
      .from("mission_change_log")
      .update({ locked_in: true } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Locked in");
    refresh();
  };

  const lockAllAndSync = async () => {
    const { data: intel } = await supabase
      .from("mission_intelligence")
      .select("content")
      .eq("mission_id", missionId)
      .eq("layer", "wizard_analysis")
      .maybeSingle();
    const content = (intel?.content ?? {}) as Record<string, unknown>;
    const themes = Array.isArray(content.recommended_win_themes) ? (content.recommended_win_themes as string[]) : [];
    if (themes.length) {
      await supabase.from("win_themes").upsert(
        themes.map((t) => ({ mission_id: missionId, theme: t })) as never,
        { onConflict: "mission_id,theme" } as never,
      );
    }
    await supabase
      .from("mission_change_log")
      .update({ locked_in: true, synced_to_atlas: true } as never)
      .eq("mission_id", missionId)
      .eq("synced_to_atlas", false);
    const updates: Record<string, unknown> = { atlas_synced_at: new Date().toISOString() };
    if (mission.mission_status === "Live with Pending Edits") updates.mission_status = "Live";
    await supabase.from("missions").update(updates as never).eq("id", missionId);
    toast.success("All changes locked in and synced");
    refresh();
  };

  if (rows.length === 0) return null;
  const pending = rows.filter((r) => !r.synced_to_atlas).length;

  return (
    <section className="rounded-lg border border-border bg-surface/40">
      <header className="flex items-center justify-between gap-3 p-4">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.28em]">
          <span>Change Log</span>
          <span className="rounded bg-border/60 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            {rows.length} total · {pending} pending
          </span>
          <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
        </button>
        {pending > 0 && (
          <button
            type="button"
            onClick={lockAllAndSync}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
          >
            Lock In All & Sync
          </button>
        )}
      </header>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><Th>Field</Th><Th>Old</Th><Th>New</Th><Th>Date</Th><Th>Synced</Th><Th>{" "}</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <Td>{r.field_name ?? r.change_type}</Td>
                  <Td className="text-muted-foreground">{r.old_value ?? "—"}</Td>
                  <Td>{r.new_value ?? "—"}</Td>
                  <Td className="text-muted-foreground">{formatDateTime(r.created_at)}</Td>
                  <Td>
                    {r.synced_to_atlas
                      ? <span className="text-emerald-300">✓</span>
                      : <span className="text-amber-300">pending</span>}
                  </Td>
                  <Td>
                    {!r.locked_in && (
                      <button onClick={() => lockIn(r.id)} className="rounded border border-border bg-surface px-2 py-0.5 text-[10px] hover:bg-surface-hover">
                        Lock In
                      </button>
                    )}
                    {r.locked_in && <span className="text-[10px] text-emerald-300">locked</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
