import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { bulkAddFeedsFromText } from "@/lib/iris-bulk-feeds.functions";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type FeedTemplate = {
  feed_name: string;
  feed_type: string;
  feed_url: string | null;
  feed_description: string | null;
  preselection_reason: string | null;
};

function federalFeeds(programType: string | null): FeedTemplate[] {
  const base: FeedTemplate[] = [
    {
      feed_name: "CMS Guidance",
      feed_type: "cms_guidance",
      feed_url: "https://www.cms.gov/newsroom/rss",
      feed_description: "CMS news releases and guidance",
      preselection_reason: "CMS guidance affects all Medicaid procurements",
    },
    {
      feed_name: "Federal Register (Medicaid)",
      feed_type: "federal_register",
      feed_url: "https://www.federalregister.gov/documents/search.rss?conditions[agencies][]=centers-for-medicare-medicaid-services",
      feed_description: "Federal Register CMS rulemaking",
      preselection_reason: "Tracks Medicaid rulemaking that changes proposal requirements",
    },
  ];
  const more: FeedTemplate[] = [];
  if (programType === "childrens_behavioral_health" || programType === "adult_behavioral_health") {
    more.push({
      feed_name: "SAMHSA Bulletins",
      feed_type: "samhsa",
      feed_url: "https://store.samhsa.gov/rss.xml",
      feed_description: "SAMHSA guidance and publications",
      preselection_reason: "SAMHSA guidance is directly relevant to behavioral health procurements",
    });
  }
  if (programType === "childrens_behavioral_health" || programType === "child_welfare") {
    more.push({
      feed_name: "ACF Guidance",
      feed_type: "acf",
      feed_url: "https://www.acf.hhs.gov/rss.xml",
      feed_description: "Administration for Children & Families",
      preselection_reason: "ACF administers federal child welfare and family support programs",
    });
  }
  if (programType === "managed_care" || programType === "ltss" || programType === "dual_eligible") {
    more.push({
      feed_name: "CMMI Models",
      feed_type: "cmmi",
      feed_url: "https://innovation.cms.gov/rss",
      feed_description: "CMS Innovation Center models",
      preselection_reason: "CMMI models influence Medicaid managed care design",
    });
  }
  if (programType === "idd") {
    more.push({
      feed_name: "CMS IDD Guidance",
      feed_type: "cms_idd",
      feed_url: "https://www.cms.gov/newsroom/rss",
      feed_description: "CMS IDD waiver guidance",
      preselection_reason: "IDD waivers are governed by specific CMS guidance streams",
    });
  }
  return [...base, ...more];
}

const STATE_LEG: Record<string, string> = {
  NJ: "https://www.njleg.state.nj.us/rss",
  NY: "https://nyassembly.gov/rss/",
  OH: "https://www.legislature.ohio.gov/rss",
  PA: "https://www.legis.state.pa.us/rss",
  TX: "https://capitol.texas.gov/RSS/",
  CA: "https://leginfo.legislature.ca.gov/rss",
  FL: "https://www.flsenate.gov/rss",
  IL: "https://www.ilga.gov/rss",
  MI: "https://www.legislature.mi.gov/rss",
  WA: "https://leg.wa.gov/rss",
};
const STATE_GOV_RSS: Record<string, string> = {
  NJ: "https://www.nj.gov/governor/news/rss.xml",
};
const STATE_MED: Record<string, string> = {
  NJ: "https://www.nj.gov/humanservices/dmahs/news/rss.xml",
  NY: "https://www.health.ny.gov/rss/medicaid.xml",
};

function stateFeeds(stateCode: string | null, stateName: string | null): FeedTemplate[] {
  if (!stateCode) return [];
  return [
    {
      feed_name: `Governor's Office News (${stateName ?? stateCode})`,
      feed_type: "state_governor",
      feed_url: STATE_GOV_RSS[stateCode] ?? null,
      feed_description: "Governor's priorities and announcements",
      preselection_reason: "Governor's priorities influence agency direction and procurement outcomes",
    },
    {
      feed_name: `State Legislature (${stateCode})`,
      feed_type: "state_legislature",
      feed_url: STATE_LEG[stateCode] ?? null,
      feed_description: "Legislative tracking",
      preselection_reason: "Legislative actions can reshape program requirements mid-procurement",
    },
    {
      feed_name: `State Medicaid Agency (${stateCode})`,
      feed_type: "state_medicaid",
      feed_url: STATE_MED[stateCode] ?? null,
      feed_description: "State Medicaid agency announcements",
      preselection_reason: "Direct signals from the procuring agency's parent department",
    },
  ];
}

function researchFeeds(programType: string | null): FeedTemplate[] {
  const base: FeedTemplate[] = [
    { feed_name: "Urban Institute Health Policy", feed_type: "research", feed_url: "https://www.urban.org/rss.xml", feed_description: "Urban Institute health policy research", preselection_reason: "Frequently cited Medicaid policy analysis" },
    { feed_name: "Kaiser Family Foundation", feed_type: "research", feed_url: "https://kff.org/feed/", feed_description: "KFF Medicaid and health policy", preselection_reason: "Definitive Medicaid data and analysis" },
    { feed_name: "Health Affairs", feed_type: "research", feed_url: "https://www.healthaffairs.org/rss/journal", feed_description: "Health Affairs journal", preselection_reason: "Peer-reviewed health policy evidence" },
  ];
  const more: FeedTemplate[] = [];
  if (programType === "childrens_behavioral_health") {
    more.push(
      { feed_name: "SAMHSA Research", feed_type: "research", feed_url: "https://store.samhsa.gov/rss.xml", feed_description: "Behavioral health research", preselection_reason: "Behavioral health evidence base" },
      { feed_name: "Child Welfare Information Gateway", feed_type: "research", feed_url: "https://www.childwelfare.gov/rss/", feed_description: "Federal child welfare information", preselection_reason: "Authoritative child welfare evidence" },
      { feed_name: "Annie E. Casey Foundation", feed_type: "research", feed_url: "https://www.aecf.org/blog/rss", feed_description: "Casey Foundation publications", preselection_reason: "Leading children's policy research" },
    );
  }
  if (programType === "managed_care" || programType === "ltss" || programType === "dual_eligible") {
    more.push(
      { feed_name: "Commonwealth Fund", feed_type: "research", feed_url: "https://www.commonwealthfund.org/rss.xml", feed_description: "Health policy research", preselection_reason: "Managed care and integrated care evidence" },
      { feed_name: "MACPAC", feed_type: "research", feed_url: null, feed_description: "Medicaid and CHIP Payment and Access Commission", preselection_reason: "Federal advisory body on Medicaid policy" },
    );
  }
  if (programType === "idd") {
    more.push(
      { feed_name: "AAIDD", feed_type: "research", feed_url: null, feed_description: "American Association on IDD", preselection_reason: "Authoritative IDD field organization" },
      { feed_name: "The Arc", feed_type: "research", feed_url: "https://thearc.org/feed/", feed_description: "National IDD advocacy", preselection_reason: "Leading IDD voice" },
    );
  }
  if (programType === "child_welfare") {
    more.push(
      { feed_name: "Child Welfare League of America", feed_type: "research", feed_url: null, feed_description: "CWLA publications", preselection_reason: "Leading child welfare association" },
      { feed_name: "Casey Family Programs", feed_type: "research", feed_url: null, feed_description: "Casey Family Programs research", preselection_reason: "Leading child welfare research org" },
    );
  }
  return [...base, ...more];
}

export function Step9MonitoringFeeds({ missionId, onAdvance }: { missionId: string; onAdvance: () => void }) {
  const qc = useQueryClient();
  const { data: mission } = useQuery({
    queryKey: ["mission-monitor-ctx", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("state, state_code, program_type")
        .eq("id", missionId)
        .single();
      return data;
    },
  });
  const { data: configs } = useQuery({
    queryKey: ["feed-configs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("intelligence_feed_configs")
        .select("*")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  // Pre-seed missing pre-selected feeds
  useEffect(() => {
    if (!mission || !configs) return;
    const want = [
      ...federalFeeds(mission.program_type).map((f) => ({ ...f, category: "federal" })),
      ...stateFeeds(mission.state_code, mission.state).map((f) => ({ ...f, category: "state" })),
      ...researchFeeds(mission.program_type).map((f) => ({ ...f, category: "research" })),
    ];
    const have = new Set((configs ?? []).map((c) => `${c.feed_type}::${c.feed_name}`));
    const toInsert = want
      .filter((w) => !have.has(`${w.feed_type}::${w.feed_name}`))
      .map((w) => ({
        mission_id: missionId,
        feed_name: w.feed_name,
        feed_type: w.feed_type,
        feed_url: w.feed_url,
        feed_description: w.feed_description,
        preselection_reason: w.preselection_reason,
        is_preselected: true,
        is_active: true,
        monitoring_schedule: "daily",
      }));
    if (toInsert.length > 0) {
      supabase
        .from("intelligence_feed_configs")
        .insert(toInsert)
        .then(() => qc.invalidateQueries({ queryKey: ["feed-configs", missionId] }));
    }
  }, [mission, configs, missionId, qc]);

  if (!mission || !configs) return <Skeleton className="h-96 w-full" />;

  const fed = federalFeeds(mission.program_type).map((f) => f.feed_name);
  const stt = stateFeeds(mission.state_code, mission.state).map((f) => f.feed_name);
  const rsh = researchFeeds(mission.program_type).map((f) => f.feed_name);

  const federal = (configs ?? []).filter((c) => fed.includes(c.feed_name) || c.feed_type === "cms_guidance" || c.feed_type === "federal_register" || c.feed_type === "samhsa" || c.feed_type === "acf" || c.feed_type === "cmmi" || c.feed_type === "cms_idd");
  const stateF = (configs ?? []).filter((c) => stt.includes(c.feed_name) || c.feed_type?.startsWith("state_"));
  const research = (configs ?? []).filter((c) => rsh.includes(c.feed_name) || c.feed_type === "research");
  const custom = (configs ?? []).filter((c) => c.feed_type === "custom");

  const activeCount = (configs ?? []).filter((c) => c.is_active).length;
  const hourly = (configs ?? []).filter((c) => c.is_active && c.monitoring_schedule === "hourly").length;
  const daily = (configs ?? []).filter((c) => c.is_active && c.monitoring_schedule === "daily").length;
  const weekly = (configs ?? []).filter((c) => c.is_active && c.monitoring_schedule === "weekly").length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--athena-navy)]">Activate IRIS monitoring.</h1>
        <p className="text-muted-foreground">
          Select the intelligence feeds you want IRIS to watch continuously. She will alert you when something changes that affects your mission.
        </p>
      </header>

      <BulkAddPanel missionId={missionId} />


      <div className="grid md:grid-cols-3 gap-4">
        <Panel title="Federal Policy" missionId={missionId}>
          {federal.map((c) => <FeedRow key={c.id} config={c} />)}
          <CustomFeedAdd missionId={missionId} />
          {custom.map((c) => <FeedRow key={c.id} config={c} />)}
        </Panel>
        <Panel title={`State Intelligence — ${mission.state ?? "—"}`} missionId={missionId}>
          {stateF.length === 0 && <p className="text-xs text-muted-foreground">Set state in Step 8.</p>}
          {stateF.map((c) => <FeedRow key={c.id} config={c} />)}
        </Panel>
        <Panel title="Research & Knowledge" missionId={missionId}>
          {research.map((c) => <FeedRow key={c.id} config={c} />)}
        </Panel>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <p className="text-sm">
          IRIS will monitor <strong>{activeCount}</strong> feeds. {hourly} checking hourly · {daily} checking daily · {weekly} checking weekly.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          First intelligence check will run within 1 hour of BLAST OFF.
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <button onClick={() => window.history.back()} className="text-sm text-muted-foreground hover:text-foreground">
          Save and continue later
        </button>
        <Button
          onClick={async () => {
            await supabase.from("missions").update({ intelligence_loadout_step: 3 }).eq("id", missionId);
            onAdvance();
          }}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
        >
          Build Competitive Intelligence →
        </Button>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; missionId: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-[var(--athena-gold)] font-semibold">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FeedRow({ config }: { config: any }) {
  const qc = useQueryClient();
  async function toggle(v: boolean) {
    await supabase.from("intelligence_feed_configs").update({ is_active: v }).eq("id", config.id);
    qc.invalidateQueries({ queryKey: ["feed-configs", config.mission_id] });
  }
  async function setSchedule(v: string) {
    await supabase.from("intelligence_feed_configs").update({ monitoring_schedule: v }).eq("id", config.id);
    qc.invalidateQueries({ queryKey: ["feed-configs", config.mission_id] });
  }
  const disabled = !config.feed_url;
  return (
    <div className={cn("rounded border border-border p-2 space-y-1", disabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <Switch checked={config.is_active && !disabled} disabled={disabled} onCheckedChange={toggle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-medium text-sm truncate">{config.feed_name}</span>
            {config.is_preselected && (
              <span title={config.preselection_reason ?? ""} className="text-[9px] uppercase tracking-wider text-[var(--athena-gold)] bg-[var(--athena-gold)]/10 px-1.5 py-0.5 rounded">
                Pre-selected by IRIS
              </span>
            )}
          </div>
          {config.feed_description && <p className="text-xs text-muted-foreground">{config.feed_description}</p>}
          {disabled && <p className="text-[10px] text-amber-600">Feed URL not yet available — add a custom RSS feed.</p>}
        </div>
        <Select value={config.monitoring_schedule} onValueChange={setSchedule}>
          <SelectTrigger className="h-7 w-[90px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CustomFeedAdd({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  async function add() {
    if (!name.trim() || !url.trim()) return;
    await supabase.from("intelligence_feed_configs").insert({
      mission_id: missionId,
      feed_name: name.trim(),
      feed_url: url.trim(),
      feed_type: "custom",
      is_active: true,
      is_preselected: false,
      monitoring_schedule: "daily",
    });
    setName("");
    setUrl("");
    qc.invalidateQueries({ queryKey: ["feed-configs", missionId] });
  }
  return (
    <div className="rounded border border-dashed border-border p-2 space-y-1">
      <Label className="text-xs">Add a custom RSS feed</Label>
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
      <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="h-7 text-xs" />
      <Button size="sm" variant="outline" onClick={add} disabled={!name.trim() || !url.trim()} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Add Feed
      </Button>
    </div>
  );
}

function BulkAddPanel({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const bulkAdd = useServerFn(bulkAddFeedsFromText);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await bulkAdd({ data: { missionId, text } });
      const rss = res.feeds.filter((f) => f.isRss).length;
      const scrape = res.feeds.length - rss;
      toast.success(
        `IRIS added ${res.inserted} feeds (${rss} RSS · ${scrape} page-scrape)${
          res.skipped ? ` — ${res.skipped} duplicates skipped` : ""
        }.`,
      );
      setText("");
      qc.invalidateQueries({ queryKey: ["feed-configs", missionId] });
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS could not parse those sources.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--athena-gold)]/40 bg-[var(--athena-gold)]/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--athena-gold)]" />
        <p className="text-sm font-semibold text-[var(--athena-navy)]">
          Bulk add with IRIS
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste a list of websites — URLs, names, even messy notes. IRIS extracts each source, auto-detects RSS feeds where available, and falls back to page-scrape monitoring otherwise.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"e.g.\nhttps://www.medicaid.gov/about-us/news/index.html\nKFF Medicaid — kff.org/medicaid\nNASHP blog https://nashp.org/blog/"}
        rows={5}
        className="text-sm"
      />
      <div className="flex justify-end">
        <Button
          onClick={run}
          disabled={!text.trim() || busy}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
        >
          {busy ? "IRIS is wiring them up…" : "Add with IRIS"}
        </Button>
      </div>
    </div>
  );
}
