import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  number: string;
  title: string;
  studio_status: string | null;
  studio_progress_pct: number | null;
  internal_due_date: string | null;
  assigned_user_id: string | null;
};

export function MissionSectionsList({ missionId }: { missionId: string }) {
  const { data: sections = [] } = useQuery({
    queryKey: ["mission-sections", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_sections")
        .select("id, number, title, studio_status, studio_progress_pct, internal_due_date, assigned_user_id")
        .eq("mission_id", missionId)
        .order("number");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (sections.length === 0) return null;

  return (
    <section>
      <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>
        Sections
      </h2>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
        {sections.map((s) => {
          const pct = s.studio_progress_pct ?? 0;
          return (
            <Link
              key={s.id}
              to="/missions/$missionId/scaffold/$sectionId"
              params={{ missionId, sectionId: s.id }}
              className="group flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] transition"
            >
              <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{s.number}</span>
              <span className="flex-1 text-sm text-foreground truncate">{s.title}</span>
              {s.studio_status && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:inline">
                  {s.studio_status}
                </span>
              )}
              <div className="hidden md:flex items-center gap-2 w-32">
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6366F1] transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  {pct}%
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground transition" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
