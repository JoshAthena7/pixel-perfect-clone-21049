import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisCorrectable } from "@/components/v2/IrisCorrectable";
import { VaultIcon, OracleIcon } from "@/components/v2/icons/AtlasIcons";

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

/**
 * Vault + Oracle hero — the centerpiece of the Mission Room.
 * Clean, premium dark cards. No military dressing. Just depth, glow, and craft.
 */
export function MissionRoomHero({ missionId }: { missionId: string }) {
  const { data: vault } = useQuery({
    queryKey: ["mr-hero-vault", missionId],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("mission_library")
        .select("name,created_at", { count: "exact" })
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(3);
      return { count: count ?? 0, latest: (data ?? []) as Array<{ name?: string; created_at?: string }> };
    },
  });

  const { data: oracle } = useQuery({
    queryKey: ["mr-hero-oracle", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_sections")
        .select("section_key,generated_at,content")
        .eq("mission_id", missionId)
        .order("generated_at", { ascending: false });
      return (data ?? []) as Array<{ section_key: string; generated_at: string | null; content?: string | null }>;
    },
  });

  const vaultCount = vault?.count ?? 0;
  const oracleCount = oracle?.length ?? 0;
  const latestOracle = oracle?.[0]?.generated_at ?? null;
  const oracleTop = (oracle ?? []).slice(0, 2);
  const latestSection = oracle?.[0]?.section_key?.replace(/_/g, " ");

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* VAULT */}
        <Link
          to="/missions/$missionId/library"
          params={{ missionId }}
          className="group relative flex min-h-[280px] flex-col overflow-hidden rounded-[16px] p-8 transition-all duration-300 hover:-translate-y-1"
          style={{
            border: "1px solid rgba(245,158,11,0.20)",
            background: "linear-gradient(145deg, #0f1520 0%, #0a0e1a 60%)",
            boxShadow: "inset 0 0 60px rgba(245,158,11,0.06), 0 20px 60px rgba(0,0,0,0.4)",
            color: "var(--vault-gold, #f59e0b)",
          }}
        >
          {/* Top-right: clean label, no box */}
          <span
            className="absolute right-7 top-7 text-[10px] font-semibold uppercase"
            style={{ letterSpacing: "0.2em", color: "rgba(245,158,11,0.5)" }}
          >
            Documents
          </span>

          <VaultIcon size={48} active className="h-12 w-12" />

          <div className="mt-4 text-[10px] font-bold uppercase" style={{ letterSpacing: "0.25em", color: "var(--vault-gold-dim, #c08418)" }}>
            The Vault
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num-tabular text-[48px] leading-none" style={{ color: "var(--vault-gold, #f59e0b)", fontWeight: 700 }}>
              {vaultCount}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">document{vaultCount === 1 ? "" : "s"}</span>
          </div>

          <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            {(vault?.latest ?? []).slice(0, 3).map((d, i) => (
              <li key={i} className="truncate">↑ {d.file_name} <span className="opacity-60">· {timeAgo(d.created_at)}</span></li>
            ))}
          </ul>

          <div className="mt-auto pt-5">
            <div
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold transition-all"
              style={{
                color: "var(--vault-gold, #f59e0b)",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              Open Vault <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </Link>

        {/* ORACLE */}
        <Link
          to="/missions/$missionId/briefing"
          params={{ missionId }}
          className="group relative flex min-h-[280px] flex-col overflow-hidden rounded-[16px] p-8 transition-all duration-300 hover:-translate-y-1"
          style={{
            border: "1px solid rgba(8,145,178,0.20)",
            background: "linear-gradient(145deg, #081420 0%, #0a0e1a 60%)",
            boxShadow: "inset 0 0 60px rgba(8,145,178,0.06), 0 20px 60px rgba(0,0,0,0.4)",
            color: "var(--oracle-active, #22d3ee)",
          }}
        >
          {/* Top-right: pulse-dot + label, no box */}
          <span
            className="absolute right-7 top-7 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase"
            style={{ letterSpacing: "0.2em", color: "rgba(34,211,238,0.6)" }}
          >
            <span className="iris-pulse-dot" /> Intelligence
          </span>

          <OracleIcon size={48} active className="h-12 w-12" />

          <div className="mt-4 text-[10px] font-bold uppercase" style={{ letterSpacing: "0.25em", color: "var(--oracle-active, #22d3ee)" }}>
            The Oracle
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num-tabular text-[48px] leading-none text-white" style={{ fontWeight: 700 }}>
              {oracleCount}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">intelligence section{oracleCount === 1 ? "" : "s"}</span>
          </div>

          {latestOracle && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Last updated {timeAgo(latestOracle)}
            </div>
          )}

          <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            {oracleTop.map((s) => (
              <li key={s.section_key} className="truncate">
                · {s.section_key.replace(/_/g, " ")}
                {s.content && <span className="opacity-70"> — {s.content.slice(0, 60)}…</span>}
              </li>
            ))}
          </ul>

          {oracleTop.length > 0 && (
            <div className="mt-2" onClick={(e) => e.preventDefault()}>
              <IrisCorrectable
                contentType="oracle_section"
                contentBlock={oracleTop.map((s) => `${s.section_key}: ${(s.content ?? "").slice(0, 400)}`).join("\n\n")}
                missionId={missionId}
                wrap={false}
                flagPosition="inline"
              />
              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">Flag error</span>
            </div>
          )}

          <div className="mt-auto pt-5">
            <div
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold transition-all"
              style={{
                color: "var(--oracle-active, #22d3ee)",
                background: "rgba(8,145,178,0.08)",
                border: "1px solid rgba(8,145,178,0.3)",
              }}
            >
              Open Oracle <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </Link>
      </div>

      {/* Static IRIS status line — replaces scrolling ticker */}
      <div
        className="flex items-center gap-2 px-5 py-3 text-[12px]"
        style={{
          color: "#e8edf5",
          borderTop: "1px solid rgba(8,145,178,0.12)",
        }}
      >
        <span className="iris-pulse-dot" />
        <span style={{ color: "var(--iris, #0891b2)", fontWeight: 600 }}>IRIS</span>
        <span className="text-muted-foreground">
          {latestSection
            ? <>Latest briefing section: <span style={{ color: "#e8edf5" }}>{latestSection}</span> · updated {timeAgo(latestOracle)}</>
            : oracleCount === 0
              ? "Standing by — generate the briefing book to see intelligence here."
              : "Monitoring this mission for new intelligence."}
        </span>
      </div>
    </section>
  );
}

/**
 * Enter Cockpit CTA — sticky-feeling banner at the bottom of Mission Room.
 */
export function EnterStudioCTA({
  missionId,
  assignedCount,
  attentionCount,
}: { missionId: string; assignedCount: number; attentionCount: number }) {
  return (
    <Link
      to="/missions/$missionId/questions"
      params={{ missionId }}
      className="group relative flex items-center justify-between gap-4 rounded-[12px] px-7 py-6 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(135deg, rgba(59,127,255,0.10), rgba(59,127,255,0.04))",
        border: "1px solid rgba(59,127,255,0.30)",
        boxShadow: "0 8px 30px rgba(59,127,255,0.08)",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(59,127,255,0.15)", border: "1px solid rgba(59,127,255,0.35)" }}>
          <Plane size={20} className="text-[#3b7fff]" strokeWidth={1.5} />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3b7fff]">Ready to fly?</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-foreground display-tight">Enter Cockpit</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {assignedCount > 0
              ? <>{assignedCount} question{assignedCount === 1 ? "" : "s"} assigned to you{attentionCount > 0 ? ` · ${attentionCount} need attention today` : ""}</>
              : <>Open your workspace</>}
          </div>
        </div>
      </div>
      <ArrowRight className="h-5 w-5 text-[#3b7fff] transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
