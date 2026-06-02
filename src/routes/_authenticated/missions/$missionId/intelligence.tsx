import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VaultIcon, OracleIcon } from "@/components/v2/icons/AtlasIcons";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intelligence")({
  component: IntelligencePage,
});


function IntelligencePage() {
  const { missionId } = Route.useParams();

  const { data: vaultCount = 0 } = useQuery({
    queryKey: ["intel-vault-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_library")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      return count ?? 0;
    },
  });

  const { data: oracleSections = [] } = useQuery({
    queryKey: ["intel-oracle-sections", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_sections")
        .select("section_key,generated_at")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-8">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Mission Intelligence
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Intelligence</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Source documents and IRIS-generated intelligence for this mission.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* THE VAULT */}
        <Link
          to="/missions/$missionId/library"
          params={{ missionId }}
          className="group rounded-[12px] border border-border bg-surface p-6 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <VaultIcon size={16} /> The Vault · Documents

          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{vaultCount}</span>
            <span className="text-sm text-muted-foreground">document{vaultCount === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            RFP, amendments, state Q&amp;A, past responses, templates, reference materials.
          </p>
          <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
            Open Documents <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        {/* THE ORACLE */}
        <Link
          to="/missions/$missionId/briefing"
          params={{ missionId }}
          className="group iris-panel rounded-[12px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] p-6 hover:border-[color:var(--iris,#22d3ee)]/60 transition-colors"
        >
          <div className="iris-label flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">
            <OracleIcon size={16} active />
            The Oracle · Intelligence
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{oracleSections.length}</span>
            <span className="text-sm text-muted-foreground">section{oracleSections.length === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            IRIS analysis: alignment, themes, clusters, signals, risks, predictive insights,
            landscape, priorities, competitor and stakeholder intelligence.
          </p>
          <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--iris,#22d3ee)] group-hover:gap-2 transition-all">
            Open Intelligence <ArrowRight className="h-3.5 w-3.5" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            {[
              "Alignment Analysis", "Theme Analysis", "Question Clusters", "Reviewer Signals",
              "Emerging Risks", "Predictive Insights", "Political Landscape", "State Priorities",
              "Procurement Landscape", "Competitor Analysis", "Stakeholder Intelligence", "Policy & Regulatory Climate",
            ].map((s) => (
              <div key={s} className="truncate">· {s}</div>
            ))}
          </div>
        </Link>
      </div>

      <Link
        to="/missions/$missionId/activity"
        params={{ missionId }}
        className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-5 py-3 text-sm hover:border-primary/40 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Mission Activity — Recent uploads and intelligence updates
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>

      <p className="text-xs text-muted-foreground">
        The Vault and The Oracle pages will be embedded inline here in the next phase. For now they open as full pages.
      </p>
    </div>
  );
}
