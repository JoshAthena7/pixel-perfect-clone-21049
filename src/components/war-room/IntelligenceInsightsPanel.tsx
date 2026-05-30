import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Sparkles, X, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { toast } from "sonner";

type Insight = {
  id: string;
  insight_type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  confidence_score: number;
  created_at: string;
  actioned: boolean;
};

const SEVERITY: Record<Insight["severity"], { color: string; bg: string; icon: typeof Info; label: string }> = {
  info: { color: "#60a5fa", bg: "rgba(59,130,246,0.10)", icon: Info, label: "Info" },
  warning: { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", icon: AlertTriangle, label: "Warning" },
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.10)", icon: AlertOctagon, label: "Critical" },
};

export function IntelligenceInsightsPanel() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!engagement) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("intelligence_insights")
      .select("id, insight_type, title, body, severity, confidence_score, created_at, actioned")
      .or(`engagement_id.eq.${engagement.id},engagement_id.is.null`)
      .eq("actioned", false)
      .order("severity", { ascending: false })
      .order("confidence_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3);
    setLoading(false);
    if (error) return;
    setItems((data as Insight[]) ?? []);
  }, [engagement?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates
  useEffect(() => {
    if (!engagement) return;
    const ch = supabase
      .channel(`insights:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "intelligence_insights" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id, load]);

  async function dismiss(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase
      .from("intelligence_insights")
      .update({ actioned: true, actioned_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  if (!engagement) return null;
  if (!loading && items.length === 0) return null;

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ border: "0.5px solid rgba(255,255,255,0.08)", background: "#1a2333" }}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
        <Sparkles className="h-3.5 w-3.5 text-violet-300" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Intelligence Insights
        </span>
        <span className="ml-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
          {items.length}
        </span>
      </div>
      <ul className="divide-y divide-white/5">
        {items.map((i) => {
          const sev = SEVERITY[i.severity] ?? SEVERITY.info;
          const Icon = sev.icon;
          return (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3" style={{ background: sev.bg }}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: sev.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-white">{i.title}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: sev.color, background: `color-mix(in oklab, ${sev.color} 18%, transparent)` }}
                  >
                    {sev.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round((i.confidence_score ?? 0) * 100)}% confidence · {relativeTime(i.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{i.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(i.id)}
                aria-label="Dismiss insight"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
