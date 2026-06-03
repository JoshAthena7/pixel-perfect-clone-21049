import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intelligence")({
  component: IntelligencePage,
});

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const ORACLE_SECTIONS = [
  "Alignment Analysis", "Theme Analysis", "Question Clusters", "Reviewer Signals",
  "Emerging Risks", "Predictive Insights", "Political Landscape", "State Priorities",
  "Procurement Landscape", "Competitor Analysis", "Stakeholder Intelligence", "Policy & Regulatory Climate",
];

function IntelligencePage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery({
    queryKey: ["intel-mission-header", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name,client,state,program_type")
        .eq("id", missionId)
        .maybeSingle();
      return data as { name: string; client: string | null; state: string | null; program_type: string | null } | null;
    },
  });

  const { data: vault } = useQuery({
    queryKey: ["intel-vault", missionId],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("mission_library")
        .select("file_name,created_at", { count: "exact" })
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = data?.[0] as { file_name?: string; created_at?: string } | undefined;
      return { count: count ?? 0, latest };
    },
  });

  const { data: oracleSections = [] } = useQuery({
    queryKey: ["intel-oracle-sections", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_sections")
        .select("section_key,generated_at")
        .eq("mission_id", missionId)
        .order("generated_at", { ascending: false });
      return (data ?? []) as { section_key: string; generated_at: string | null }[];
    },
  });

  const latestOracle = oracleSections[0]?.generated_at ?? null;
  const vaultCount = vault?.count ?? 0;

  const tickerEvents = [
    vaultCount > 0 && `IRIS analyzed RFP — ${vaultCount} document${vaultCount === 1 ? "" : "s"} indexed`,
    oracleSections.length > 0 && `${oracleSections.length} Oracle intelligence sections live`,
    vault?.latest?.file_name && `New upload: ${vault.latest.file_name}`,
    latestOracle && `Oracle refresh ${timeAgo(latestOracle)}`,
    "Cross-mission signal cluster forming around CMS guidance",
    "Amendment monitor armed — watching for state Q&A",
  ].filter(Boolean) as string[];

  const tickerLine = tickerEvents.join("   ·   ");

  return (
    <div className="classified-stage min-h-full">
      <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-8">
        {/* Section header — classified treatment */}
        <header className="relative">
          <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.32em]">
            <span className="text-[color:var(--red)]/70">● Classified</span>
            <span className="h-px flex-1 bg-border/50" />
            <span className="text-[color:var(--red)]/60">Authorized Personnel Only</span>
          </div>
          <h1 className="mt-3 text-2xl font-light uppercase tracking-[0.18em] text-foreground">
            Briefing Room
          </h1>
          <div className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {[mission?.name, mission?.state, mission?.program_type].filter(Boolean).join("  ·  ")}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* THE VAULT */}
          <Link
            to="/missions/$missionId/library"
            params={{ missionId }}
            className="classified-corner group relative flex min-h-[300px] flex-col overflow-hidden rounded-[12px] p-8 transition-all duration-300 hover:-translate-y-1"
            style={{
              border: "1px solid rgba(245,158,11,0.25)",
              background: "radial-gradient(ellipse at 0% 0%, rgba(245,158,11,0.08) 0%, var(--classified-surface) 60%)",
              boxShadow:
                "inset 0 0 60px var(--vault-glow), inset 0 0 120px var(--vault-glow-edge), 0 0 40px var(--vault-glow-edge), 0 20px 60px rgba(0,0,0,0.5)",
              color: "var(--vault-gold)",
            }}
          >
            <span className="cc-bl" />
            <span className="cc-br" />

            {/* Classification badge */}
            <span
              className="absolute right-4 top-4 rounded-[3px] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{
                color: "var(--vault-gold-dim)",
                border: "1px solid rgba(245,158,11,0.3)",
                background: "rgba(245,158,11,0.05)",
              }}
            >
              Confidential
            </span>

            {/* Vault icon */}
            <svg
              viewBox="0 0 48 48"
              className="vault-breathe h-12 w-12"
              style={{ filter: "drop-shadow(0 0 12px var(--vault-glow-strong)) drop-shadow(0 0 24px var(--vault-glow))" }}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Temple / vault */}
              <path d="M4 18 L24 6 L44 18" />
              <path d="M7 18 V40 H41 V18" />
              <line x1="3" y1="40" x2="45" y2="40" />
              <line x1="13" y1="20" x2="13" y2="38" />
              <line x1="19" y1="20" x2="19" y2="38" />
              <line x1="29" y1="20" x2="29" y2="38" />
              <line x1="35" y1="20" x2="35" y2="38" />
              <circle cx="24" cy="29" r="3" fill="currentColor" opacity="0.4" />
            </svg>

            <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--vault-gold-dim)" }}>
              The Vault
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-[56px] font-extrabold leading-none tabular-nums"
                style={{
                  color: "var(--vault-gold)",
                  textShadow: "0 0 20px var(--vault-glow-strong), 0 0 40px var(--vault-glow)",
                }}
              >
                {vaultCount}
              </span>
              <span className="pb-2 text-base text-muted-foreground">documents</span>
            </div>

            <div className="mt-3 text-[12px] tracking-[0.05em] text-muted-foreground">
              RFP · Amendments · State Q&amp;A · Templates · Research
            </div>

            {vault?.latest?.file_name && (
              <div className="mt-2 truncate text-[11px]" style={{ color: "var(--vault-gold-dim)" }}>
                ↑ {vault.latest.file_name} added {timeAgo(vault.latest.created_at)}
              </div>
            )}

            <div className="mt-auto pt-6">
              <div
                className="w-full rounded-md px-5 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-200 group-hover:shadow-[0_0_20px_var(--vault-glow)]"
                style={{
                  color: "var(--vault-gold)",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                }}
              >
                Open Vault <ArrowRight className="ml-1 inline h-3 w-3" />
              </div>
            </div>
          </Link>

          {/* THE ORACLE */}
          <Link
            to="/missions/$missionId/briefing"
            params={{ missionId }}
            className="classified-corner group relative flex min-h-[300px] flex-col overflow-hidden rounded-[12px] p-8 transition-all duration-300 hover:-translate-y-1"
            style={{
              border: "1px solid rgba(8,145,178,0.30)",
              background: "radial-gradient(ellipse at 100% 0%, rgba(8,145,178,0.10) 0%, var(--classified-surface) 60%)",
              boxShadow:
                "inset 0 0 60px var(--oracle-glow), inset 0 0 120px var(--oracle-glow-edge), 0 0 40px var(--oracle-glow-edge), 0 20px 60px rgba(0,0,0,0.5)",
              color: "var(--oracle-active)",
            }}
          >
            <span className="cc-bl" />
            <span className="cc-br" />

            <span
              className="badge-pulse absolute right-4 top-4 rounded-[3px] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{
                color: "var(--oracle-active)",
                border: "1px solid rgba(8,145,178,0.4)",
                background: "rgba(8,145,178,0.08)",
              }}
            >
              Top Secret · IRIS
            </span>

            {/* Oracle eye icon */}
            <svg
              viewBox="0 0 48 48"
              className="h-12 w-12"
              style={{ filter: "drop-shadow(0 0 16px var(--oracle-glow-strong)) drop-shadow(0 0 32px var(--oracle-glow))" }}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <g className="oracle-rays" style={{ transformOrigin: "24px 24px" }}>
                <line x1="24" y1="2" x2="24" y2="6" opacity="0.6" />
                <line x1="24" y1="42" x2="24" y2="46" opacity="0.6" />
                <line x1="2" y1="24" x2="6" y2="24" opacity="0.6" />
                <line x1="42" y1="24" x2="46" y2="24" opacity="0.6" />
                <line x1="8" y1="8" x2="11" y2="11" opacity="0.4" />
                <line x1="37" y1="37" x2="40" y2="40" opacity="0.4" />
                <line x1="40" y1="8" x2="37" y2="11" opacity="0.4" />
                <line x1="11" y1="37" x2="8" y2="40" opacity="0.4" />
              </g>
              <path d="M6 24 C12 14, 36 14, 42 24 C36 34, 12 34, 6 24 Z" />
              <circle cx="24" cy="24" r="6" />
              <circle className="oracle-pupil" cx="24" cy="24" r="2.5" fill="currentColor" style={{ transformOrigin: "24px 24px" }} />
            </svg>

            <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--oracle-active)" }}>
              The Oracle
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-[56px] font-extrabold leading-none tabular-nums text-white"
                style={{ textShadow: "0 0 20px var(--oracle-glow-strong), 0 0 40px var(--oracle-glow)" }}
              >
                {oracleSections.length}
              </span>
              <span className="pb-2 text-base text-muted-foreground">intelligence sections</span>
            </div>

            <div
              className="mt-2 inline-flex items-center gap-2 text-[11px] tracking-[0.08em]"
              style={{ color: "var(--oracle-active)" }}
            >
              <span className="iris-pulse-dot" />
              IRIS Active{latestOracle ? ` · Updated ${timeAgo(latestOracle)}` : ""}
            </div>

            <div
              className="mt-3 text-[11px] text-muted-foreground"
              style={{ columnCount: 2, columnGap: "16px" }}
            >
              {ORACLE_SECTIONS.map((s) => (
                <div key={s} className="truncate">· {s}</div>
              ))}
            </div>

            <div className="mt-auto pt-6">
              <div
                className="w-full rounded-md px-5 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-200 group-hover:shadow-[0_0_20px_var(--oracle-glow)]"
                style={{
                  color: "var(--oracle-active)",
                  background: "rgba(8,145,178,0.08)",
                  border: "1px solid rgba(8,145,178,0.3)",
                }}
              >
                Access Intelligence <ArrowRight className="ml-1 inline h-3 w-3" />
              </div>
            </div>
          </Link>
        </div>

        {/* IRIS Feed ticker */}
        <div
          className="relative flex items-center overflow-hidden"
          style={{
            background: "rgba(8,145,178,0.05)",
            borderTop: "1px solid rgba(8,145,178,0.15)",
            borderBottom: "1px solid rgba(8,145,178,0.15)",
          }}
        >
          <div
            className="sticky left-0 z-10 flex items-center gap-2 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--oracle-active)", background: "var(--classified-bg)" }}
          >
            <span className="iris-pulse-dot" />
            IRIS Feed
          </div>
          <div className="ticker-track flex shrink-0 whitespace-nowrap py-2 text-[11px] tracking-[0.06em]" style={{ color: "var(--oracle-active)" }}>
            <span className="pr-12">● {tickerLine}</span>
            <span className="pr-12">● {tickerLine}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
