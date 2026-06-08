import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Brain, FileText, ListChecks, LayoutGrid, Sliders, ShieldCheck, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";
import MissionWizard from "@/components/olympus/MissionWizard";

type Tab = "overview" | "sections" | "intelligence" | "requirements" | "setup" | "oversight";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    if (t === "overview" || t === "sections" || t === "intelligence" || t === "requirements" || t === "setup" || t === "oversight") return { tab: t };
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
          {mission.status && (
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              {mission.status}
            </span>
          )}
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
          {mission.status === "ACTIVE" && (
            <TabBtn active={tab === "oversight"} onClick={() => setTab("oversight")} icon={<ShieldCheck className="h-3.5 w-3.5" />}>Oversight</TabBtn>
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
function SetupTab({ missionId }: { missionId: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-6">
      <p className="text-sm text-muted-foreground">
        The full Setup Record editor lives on its own page.
      </p>
      <Link
        to="/admin/missions/$missionId/setup"
        params={{ missionId }}
        className="mt-4 inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
      >
        Open Setup Record →
      </Link>
    </div>
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
