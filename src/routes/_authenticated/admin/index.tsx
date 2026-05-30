import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { daysUntil, relativeTime } from "@/lib/time";
import { useEngagement } from "@/hooks/use-engagement";
import {
  Building2,
  Siren,
  
  Users,
  Brain,
  ArrowRight,
  Megaphone,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

type Eng = {
  id: string;
  name: string;
  client: string;
  status: string;
  submission_date: string | null;
  contract_value_estimate: number | null;
};
type Snap = { engagement_id: string; temperature_score: number; created_at: string };
type SosRow = { engagement_id: string; status: string };
type Broadcast = { id: string; engagement_id: string; content: string; created_at: string | null; author_name: string };
type Intel = { id: string; engagement_id: string | null; title: string; body: string; severity: string; insight_type: string; created_at: string; actioned: boolean };
type Member = { engagement_id: string; user_id: string | null; role: string };

const HEALTH_FROM_TEMP = (t: number | null): { label: string; color: string } => {
  if (t === null || t === undefined) return { label: "Unknown", color: "#6b7280" };
  if (t >= 70) return { label: "Strong", color: "#5fb8a8" };
  if (t >= 40) return { label: "Stable", color: "#e8c46b" };
  if (t >= 20) return { label: "At risk", color: "#e89556" };
  return { label: "Critical", color: "#e85d5d" };
};

function AdminDashboard() {
  const { switchEngagement } = useEngagement();
  const [engagements, setEngagements] = useState<Eng[]>([]);
  const [tempByEng, setTempByEng] = useState<Record<string, number | null>>({});
  const [sosByEng, setSosByEng] = useState<Record<string, number>>({});
  const [writerCountByEng, setWriterCountByEng] = useState<Record<string, number>>({});
  const [collectiveActive, setCollectiveActive] = useState(0);
  const [intelUnreviewed, setIntelUnreviewed] = useState(0);
  const [openSosTotal, setOpenSosTotal] = useState(0);
  const [recentBroadcasts, setRecentBroadcasts] = useState<Broadcast[]>([]);
  const [recentIntel, setRecentIntel] = useState<Intel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: engs }, { data: sos }, { data: members }, { data: intel }, { data: broadcasts }] = await Promise.all([
        supabase.from("engagements").select("id,name,client,status,submission_date,contract_value_estimate").order("submission_date", { ascending: true }),
        supabase.from("sos_alerts").select("engagement_id,status").eq("status", "Open"),
        supabase.from("engagement_members").select("engagement_id,user_id,role"),
        supabase.from("intelligence_insights").select("id,engagement_id,title,body,severity,insight_type,created_at,actioned").order("created_at", { ascending: false }).limit(100),
        supabase.from("broadcasts").select("id,engagement_id,content,created_at,author_name").order("created_at", { ascending: false }).limit(20),
      ]);

      // Temperature per engagement (latest snapshot)
      const engList = (engs ?? []) as Eng[];
      const activeIds = engList.filter((e) => e.status === "Active").map((e) => e.id);
      const tempMap: Record<string, number | null> = {};
      if (activeIds.length > 0) {
        const { data: snaps } = await supabase
          .from("snapshots")
          .select("engagement_id,temperature_score,created_at")
          .in("engagement_id", activeIds)
          .order("created_at", { ascending: false });
        for (const s of (snaps ?? []) as Snap[]) {
          if (!(s.engagement_id in tempMap)) tempMap[s.engagement_id] = s.temperature_score;
        }
      }

      if (cancelled) return;

      // SOS counts
      const sosMap: Record<string, number> = {};
      for (const r of (sos ?? []) as SosRow[]) sosMap[r.engagement_id] = (sosMap[r.engagement_id] ?? 0) + 1;

      // Writer counts + collective active
      const writerMap: Record<string, number> = {};
      const activeWriters = new Set<string>();
      for (const m of (members ?? []) as Member[]) {
        if (m.role === "writer" || m.role === "engagement_lead") {
          writerMap[m.engagement_id] = (writerMap[m.engagement_id] ?? 0) + 1;
          if (m.user_id) activeWriters.add(m.user_id);
        }
      }

      const intelList = (intel ?? []) as Intel[];

      setEngagements(engList);
      setTempByEng(tempMap);
      setSosByEng(sosMap);
      setOpenSosTotal((sos ?? []).length);
      setWriterCountByEng(writerMap);
      setCollectiveActive(activeWriters.size);
      setIntelUnreviewed(intelList.filter((i) => !i.actioned).length);
      setRecentIntel(intelList.filter((i) => !i.actioned).slice(0, 3));
      setRecentBroadcasts(((broadcasts ?? []) as Broadcast[]).slice(0, 3));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const active = engagements.filter((e) => e.status === "Active");


  async function enterRoom(engagementId: string) {
    await switchEngagement(engagementId);
    window.location.href = "/command";
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Building2} label="Active engagements" value={active.length} accent="#9b8cc7" />
        <Kpi icon={Siren} label="Open SOS" value={openSosTotal} accent="#e85d5d" />
        <Kpi icon={Users} label="Active collective" value={collectiveActive} accent="#5fb8a8" />
        <Kpi icon={Brain} label="Unreviewed intel" value={intelUnreviewed} accent="#5fb8a8" />
      </div>


      {/* War rooms table */}
      <Card className="border-border/60 bg-[#141628]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h2 className="text-sm font-bold tracking-wide">Missions</h2>
            <p className="text-[11px] text-muted-foreground">Sorted by days to submission · click Enter to drop into any room</p>
          </div>
          <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
            <Link to="/admin/engagements">View all <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
        <div className="divide-y divide-border/30">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading war rooms…</div>
          ) : active.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No active war rooms yet.{" "}
              <Link to="/engagement/new" className="text-[var(--gold)] underline">Create one →</Link>
            </div>
          ) : (
            active.map((e) => {
              const d = daysUntil(e.submission_date);
              const temp = tempByEng[e.id] ?? null;
              const h = HEALTH_FROM_TEMP(temp);
              const sos = sosByEng[e.id] ?? 0;
              const writers = writerCountByEng[e.id] ?? 0;
              return (
                <div key={e.id} className="grid grid-cols-[6px_2.2fr_1fr_120px_140px_120px_120px] items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition">
                  <span className="h-9 w-[3px] rounded-full" style={{ background: h.color }} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{e.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{e.client}</div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmtCurrency(e.contract_value_estimate ?? 0)}
                  </div>
                  <div className="text-xs">
                    {d === null ? <span className="text-muted-foreground">No date</span> : (
                      <>
                        <span className={`font-bold ${d < 30 ? "text-red-400" : d < 60 ? "text-amber-300" : ""}`}>
                          {d < 0 ? `${Math.abs(d)}d past` : `T-${d}d`}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: h.color }} />
                    <span>{h.label}</span>
                    {temp !== null && <span className="text-muted-foreground">{temp}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {sos > 0 && (
                      <Badge variant="outline" className="border-red-500/40 text-red-300 bg-red-500/10 h-5 px-1.5">
                        <Siren className="h-2.5 w-2.5 mr-1" />{sos}
                      </Badge>
                    )}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />{writers}
                    </span>
                  </div>
                  <Button size="sm" className="h-8 gap-1" onClick={() => enterRoom(e.id)}>
                    Enter <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent global messages */}
        <Card className="border-border/60 bg-[#141628]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
            <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">Recent broadcasts</h3>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1 h-7">
              <Link to="/admin/messaging"><Megaphone className="h-3 w-3" /> Compose</Link>
            </Button>
          </div>
          <div className="divide-y divide-border/30">
            {recentBroadcasts.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">No broadcasts yet.</div>
            ) : recentBroadcasts.map((b) => {
              const eng = engagements.find((e) => e.id === b.engagement_id);
              return (
                <div key={b.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="text-[var(--gold)]">{eng?.name ?? "Unknown room"}</span>
                    <span>·</span>
                    <span>{relativeTime(b.created_at)}</span>
                  </div>
                  <div className="text-sm mt-1 line-clamp-2">{b.content}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Intelligence alerts feed */}
        <Card className="border-border/60 bg-[#141628]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
            <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">Intelligence alerts</h3>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1 h-7">
              <Link to="/admin/intelligence"><Brain className="h-3 w-3" /> View all</Link>
            </Button>
          </div>
          <div className="divide-y divide-border/30">
            {recentIntel.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">No unreviewed alerts.</div>
            ) : recentIntel.map((i) => {
              const eng = engagements.find((e) => e.id === i.engagement_id);
              return (
                <div key={i.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <SourceBadge type={i.insight_type} />
                    <span>·</span>
                    <span className="text-[var(--gold)]">{eng?.name ?? "Platform"}</span>
                    <span>·</span>
                    <span>{relativeTime(i.created_at)}</span>
                  </div>
                  <div className="text-sm mt-1 line-clamp-2">{i.body}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number | string; accent: string }) {
  return (
    <Card className="border-border/60 bg-[#141628] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </div>
      <div className="text-3xl font-bold mt-2" style={{ color: accent }}>{value}</div>
    </Card>
  );
}

function SourceBadge({ type }: { type: string }) {
  const t = (type || "").toLowerCase();
  let label = "Athena AI";
  let color = "#9b8cc7";
  if (t.includes("market") || t.includes("radar")) { label = "Radar™"; color = "#5fb8a8"; }
  else if (t.includes("compass")) { label = "Compass™"; color = "#C49A2A"; }
  else if (t.includes("win")) { label = "WinIQ"; color = "#e89556"; }
  return <span className="font-bold" style={{ color }}>{label}</span>;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
