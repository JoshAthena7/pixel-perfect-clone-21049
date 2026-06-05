import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Compact Vault + Oracle cards for Studio — always visible, one click away.
 * Smaller than Mission Room hero. Writer never loses their place.
 */
export function StudioVaultOraclePeek({ missionId }: { missionId: string }) {
  const { data: counts } = useQuery({
    queryKey: ["studio-peek-counts", missionId],
    queryFn: async () => {
      const [v, o] = await Promise.all([
        supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("briefing_book_sections").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      return { vault: v.count ?? 0, oracle: o.count ?? 0 };
    },
  });

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Link
        to="/missions/$missionId/vault"
        params={{ missionId }}
        className="group flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors"
        style={{
          background: "rgba(245,158,11,0.04)",
          borderColor: "rgba(245,158,11,0.20)",
        }}
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" style={{ color: "var(--vault-gold, #f59e0b)" }}
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18 L24 6 L44 18" />
          <path d="M7 18 V40 H41 V18" />
          <line x1="3" y1="40" x2="45" y2="40" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-dim, #c08418)" }}>Vault</div>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">· Archive</span>
          </div>
          <div className="text-xs text-muted-foreground">{counts?.vault ?? 0} document{counts?.vault === 1 ? "" : "s"} on file</div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      <Link
        to="/missions/$missionId/briefing"
        params={{ missionId }}
        className="group flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors"
        style={{
          background: "rgba(8,145,178,0.04)",
          borderColor: "rgba(8,145,178,0.25)",
        }}
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" style={{ color: "var(--oracle-active, #22d3ee)" }}
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 24 C12 14, 36 14, 42 24 C36 34, 12 34, 6 24 Z" />
          <circle cx="24" cy="24" r="6" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--oracle-active, #22d3ee)" }}>
              <span className="iris-pulse-dot" /> Oracle
            </div>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">· Live Intelligence</span>
          </div>
          <div className="text-xs text-muted-foreground">{counts?.oracle ?? 0} insight{counts?.oracle === 1 ? "" : "s"} from IRIS</div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
