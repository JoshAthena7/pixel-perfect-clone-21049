import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PenTool, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
 * Two classified cards side by side. Click → deep view.
 */
export function MissionRoomHero({ missionId }: { missionId: string }) {
  const { data: vault } = useQuery({
    queryKey: ["mr-hero-vault", missionId],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("mission_library")
        .select("file_name,created_at", { count: "exact" })
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(3);
      return { count: count ?? 0, latest: (data ?? []) as Array<{ file_name?: string; created_at?: string }> };
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

  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* VAULT */}
      <Link
        to="/missions/$missionId/library"
        params={{ missionId }}
        className="classified-corner group relative flex min-h-[280px] flex-col overflow-hidden rounded-[12px] p-7 transition-all duration-300 hover:-translate-y-1"
        style={{
          border: "1px solid rgba(245,158,11,0.25)",
          background: "radial-gradient(ellipse at 0% 0%, rgba(245,158,11,0.08) 0%, var(--classified-surface, #0a0e18) 60%)",
          boxShadow:
            "inset 0 0 50px var(--vault-glow, rgba(245,158,11,0.05)), 0 0 30px rgba(245,158,11,0.06), 0 16px 50px rgba(0,0,0,0.5)",
          color: "var(--vault-gold, #f59e0b)",
        }}
      >
        <span className="cc-bl" />
        <span className="cc-br" />
        <span
          className="absolute right-4 top-4 rounded-[3px] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{
            color: "var(--vault-gold-dim, #c08418)",
            border: "1px solid rgba(245,158,11,0.3)",
            background: "rgba(245,158,11,0.05)",
          }}
        >
          Confidential
        </span>

        <svg viewBox="0 0 48 48" className="h-14 w-14"
          style={{ filter: "drop-shadow(0 0 12px rgba(245,158,11,0.4))" }}
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18 L24 6 L44 18" />
          <path d="M7 18 V40 H41 V18" />
          <line x1="3" y1="40" x2="45" y2="40" />
          <line x1="13" y1="20" x2="13" y2="38" />
          <line x1="19" y1="20" x2="19" y2="38" />
          <line x1="29" y1="20" x2="29" y2="38" />
          <line x1="35" y1="20" x2="35" y2="38" />
          <circle cx="24" cy="29" r="3" fill="currentColor" opacity="0.4" />
        </svg>

        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--vault-gold-dim, #c08418)" }}>
          The Vault
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[48px] font-extrabold leading-none tabular-nums" style={{ color: "var(--vault-gold, #f59e0b)" }}>
            {vaultCount}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">documents</span>
        </div>

        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {(vault?.latest ?? []).slice(0, 3).map((d, i) => (
            <li key={i} className="truncate">↑ {d.file_name} <span className="opacity-60">· {timeAgo(d.created_at)}</span></li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          <div className="w-full rounded-md px-5 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.2em] transition-all"
            style={{
              color: "var(--vault-gold, #f59e0b)",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.3)",
            }}>
            Open Vault <ArrowRight className="ml-1 inline h-3 w-3" />
          </div>
        </div>
      </Link>

      {/* ORACLE */}
      <Link
        to="/missions/$missionId/briefing"
        params={{ missionId }}
        className="classified-corner group relative flex min-h-[280px] flex-col overflow-hidden rounded-[12px] p-7 transition-all duration-300 hover:-translate-y-1"
        style={{
          border: "1px solid rgba(8,145,178,0.30)",
          background: "radial-gradient(ellipse at 100% 0%, rgba(8,145,178,0.10) 0%, var(--classified-surface, #0a0e18) 60%)",
          boxShadow:
            "inset 0 0 50px rgba(8,145,178,0.05), 0 0 30px rgba(8,145,178,0.08), 0 16px 50px rgba(0,0,0,0.5)",
          color: "var(--oracle-active, #22d3ee)",
        }}
      >
        <span className="cc-bl" />
        <span className="cc-br" />
        <span className="badge-pulse absolute right-4 top-4 rounded-[3px] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{
            color: "var(--oracle-active, #22d3ee)",
            border: "1px solid rgba(8,145,178,0.4)",
            background: "rgba(8,145,178,0.08)",
          }}>
          Top Secret · IRIS
        </span>

        <svg viewBox="0 0 48 48" className="h-14 w-14"
          style={{ filter: "drop-shadow(0 0 16px rgba(34,211,238,0.4))" }}
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 24 C12 14, 36 14, 42 24 C36 34, 12 34, 6 24 Z" />
          <circle cx="24" cy="24" r="6" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" />
        </svg>

        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--oracle-active, #22d3ee)" }}>
          ● The Oracle
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[48px] font-extrabold leading-none tabular-nums text-white">
            {oracleCount}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">intelligence sections</span>
        </div>

        <div className="mt-2 inline-flex items-center gap-2 text-[11px] tracking-[0.08em]"
          style={{ color: "var(--oracle-active, #22d3ee)" }}>
          <span className="iris-pulse-dot" />
          IRIS Active{latestOracle ? ` · ${timeAgo(latestOracle)}` : ""}
        </div>

        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {oracleTop.map((s) => (
            <li key={s.section_key} className="truncate">
              · {s.section_key.replace(/_/g, " ")}
              {s.content && <span className="opacity-70"> — {s.content.slice(0, 60)}…</span>}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          <div className="w-full rounded-md px-5 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.2em] transition-all"
            style={{
              color: "var(--oracle-active, #22d3ee)",
              background: "rgba(8,145,178,0.08)",
              border: "1px solid rgba(8,145,178,0.3)",
            }}>
            Access Intelligence <ArrowRight className="ml-1 inline h-3 w-3" />
          </div>
        </div>
      </Link>
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
          <Plane size={20} className="text-[#3b7fff]" strokeWidth={1.8} />
        </span>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3b7fff]">Ready to fly?</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-foreground">Enter Cockpit</div>
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

