import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GOLD } from "./coverage";

const DOMAIN_PRIORITY: Record<string, number> = {
  competitive_landscape: 0,
  regulatory_state: 1,
  regulatory_federal: 2,
  field_intelligence: 3,
  evidence_base: 4,
};

export function IntelligenceGaps({ missionId }: { missionId: string }) {



  const { data } = useQuery({
    queryKey: ["intel-gaps", missionId],
    queryFn: async () => {
      const sb = supabase as any;
      const [{ data: nodes }, { data: signals }] = await Promise.all([
        sb
          .from("oracle_taxonomy")
          .select("id, domain, node_name, node_code, is_leaf")
          .eq("is_leaf", true),
        sb
          .from("oracle_signals")
          .select("taxonomy_node_ids")
          .in("status", ["needs_review", "approved", "pushed"]),
      ]);
      const tagged = new Set<string>();
      for (const s of signals ?? []) {
        for (const id of (s as any).taxonomy_node_ids ?? []) tagged.add(id);
      }
      return (nodes ?? []).filter((n: any) => !tagged.has(n.id));
    },
    staleTime: 60_000,
  });

  const top = useMemo(() => {
    const rows = (data ?? []) as any[];
    rows.sort((a, b) => {
      const da = DOMAIN_PRIORITY[a.domain] ?? 99;
      const db = DOMAIN_PRIORITY[b.domain] ?? 99;
      if (da !== db) return da - db;
      return String(a.node_name).localeCompare(String(b.node_name));
    });
    return rows.slice(0, 12);
  }, [data]);

  return (
    <section id="section-gaps" style={{ marginBottom: 32 }}>
      <h2
        style={{
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "#f59e0b" }}>⚠</span> INTELLIGENCE GAPS
      </h2>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
        Where we need to learn more
      </div>

      {top.length === 0 ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          No prioritized gaps. Coverage looks healthy.
        </div>
      ) : (
        <div className="space-y-1.5">
          {top.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <span
                style={{
                  display: "inline-block",
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: "#ef4444",
                }}
              />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{g.node_name}</span>
              <span
                style={{
                  fontSize: 8,
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                {g.domain.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/missions/$missionId/olympus"
        params={{ missionId }}
        className="inline-flex items-center gap-1 hover:underline"
        style={{
          marginTop: 12,
          fontSize: 11,
          color: GOLD,
        }}
      >
        Fill a gap → Manage intelligence <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
