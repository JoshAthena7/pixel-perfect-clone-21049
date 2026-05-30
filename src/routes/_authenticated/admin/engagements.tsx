import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEngagement } from "@/hooks/use-engagement";
import { daysUntil, relativeTime } from "@/lib/time";
import { ArrowRight, Plus, Search, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SERVICE_CATEGORIES, type ServicesChecklist } from "@/lib/ai/sizing.functions";

const SERVICE_SHORT: Record<string, string> = {
  pre_writing: "Pre-Write",
  writing: "Write",
  sme: "SME",
  creative: "Creative",
  qa: "QA",
  post_submission: "Post",
};

export const Route = createFileRoute("/_authenticated/admin/engagements")({
  component: AdminEngagementsList,
});

type Eng = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  status: string;
  submission_date: string | null;
  contract_value_estimate: number | null;
  created_at: string | null;
  services?: ServicesChecklist | null;
};

const STATUS_TABS = ["Active", "Closed", "Archived", "All"] as const;
type Tab = (typeof STATUS_TABS)[number];

const STATUS_COLOR: Record<string, string> = {
  Active: "#5fb8a8",
  Closed: "#9b8cc7",
  Archived: "#6b7280",
};

function AdminEngagementsList() {
  const { switchEngagement } = useEngagement();
  const [engs, setEngs] = useState<Eng[]>([]);
  const [tab, setTab] = useState<Tab>("Active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("engagements")
        .select("id,name,client,state,status,submission_date,contract_value_estimate,created_at")
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as Eng[];
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const { data: cfgs } = await supabase
          .from("engagement_config")
          .select("engagement_id, services_checklist")
          .in("engagement_id", ids);
        const byId = new Map<string, ServicesChecklist | null>(
          ((cfgs ?? []) as any[]).map((c) => [c.engagement_id, (c.services_checklist as ServicesChecklist) ?? null]),
        );
        for (const r of rows) r.services = byId.get(r.id) ?? null;
      }
      setEngs(rows);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return engs.filter((e) => {
      if (tab !== "All" && e.status !== tab) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.client.toLowerCase().includes(q) ||
        (e.state ?? "").toLowerCase().includes(q)
      );
    });
  }, [engs, tab, query]);

  async function enterRoom(id: string) {
    await switchEngagement(id);
    window.location.href = "/command";
  }

  async function deleteEngagement(e: Eng) {
    const confirmed = window.confirm(
      `Permanently delete "${e.name}"?\n\nThis removes the engagement and all its data. This cannot be undone.`,
    );
    if (!confirmed) return;
    const typed = window.prompt(`Type the engagement name to confirm:\n${e.name}`);
    if (typed !== e.name) {
      toast.error("Name didn't match — delete cancelled.");
      return;
    }
    const { error } = await supabase.from("engagements").delete().eq("id", e.id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    setEngs((prev) => prev.filter((x) => x.id !== e.id));
    toast.success(`Deleted ${e.name}`);
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Engagements</h1>
          <p className="text-xs text-muted-foreground">Every war room across the platform.</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/engagement/new"><Plus className="h-3.5 w-3.5" /> New Command Center</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border/60 bg-[#141628] p-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-3 py-1 text-xs font-semibold rounded transition ${
                tab === s ? "bg-[var(--gold)] text-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s} {s !== "All" && <span className="opacity-70">({engs.filter((e) => e.status === s).length})</span>}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, client, state…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <Card className="border-border/60 bg-[#141628]">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No engagements match.{" "}
            <Link to="/engagement/new" className="text-[var(--gold)] underline">Create one →</Link>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((e) => {
              const d = daysUntil(e.submission_date);
              return (
                <div
                  key={e.id}
                  className="grid grid-cols-[2.2fr_1.2fr_90px_1.4fr_120px_130px_120px_160px] items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{e.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Created {relativeTime(e.created_at)}
                    </div>
                  </div>
                  <div className="text-xs truncate">{e.client}</div>
                  <div className="text-xs text-muted-foreground">{e.state ?? "—"}</div>
                  <ServicesChips services={e.services ?? null} />
                  <div className="text-xs">
                    {fmtCurrency(e.contract_value_estimate ?? 0)}
                  </div>
                  <div className="text-xs">
                    {d === null ? (
                      <span className="text-muted-foreground">No date</span>
                    ) : (
                      <span className={d < 30 ? "text-red-400 font-bold" : d < 60 ? "text-amber-300 font-bold" : ""}>
                        {d < 0 ? `${Math.abs(d)}d past` : `T-${d}d`}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="border-0 text-[10px] font-bold uppercase tracking-wider w-fit"
                    style={{ background: `${STATUS_COLOR[e.status] ?? "#6b7280"}20`, color: STATUS_COLOR[e.status] ?? "#6b7280" }}
                  >
                    {e.status}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="h-8 gap-1" onClick={() => enterRoom(e.id)}>
                      Enter <ArrowRight className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => deleteEngagement(e)}
                      title="Delete engagement"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return n > 0 ? `$${n.toFixed(0)}` : "—";
}

function ServicesChips({ services }: { services: ServicesChecklist | null }) {
  if (!services) {
    return <div className="text-[11px] italic text-muted-foreground">Not sized</div>;
  }
  const chips = SERVICE_CATEGORIES.map((cat) => {
    const items = services[cat.key]?.items ?? [];
    const checked = items.filter((i) => i.checked).length;
    return { key: cat.key, label: SERVICE_SHORT[cat.key] ?? cat.label, count: checked };
  }).filter((c) => c.count > 0);

  if (chips.length === 0) {
    return <div className="text-[11px] italic text-muted-foreground">None selected</div>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.key}
          title={`${c.label}: ${c.count} item${c.count === 1 ? "" : "s"}`}
          className="inline-flex items-center gap-1 rounded border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--gold)]"
        >
          {c.label}
          <span className="opacity-70">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
