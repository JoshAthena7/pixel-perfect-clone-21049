import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { HandHelping, Check } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/war-room/LoadState";

type StuckRow = {
  id: string;
  section_name: string;
  section_id: string | null;
  writer_name: string;
  created_at: string;
};

export function NeedsAttentionPanel() {
  const { engagement } = useEngagement();
  const [rows, setRows] = useState<StuckRow[]>([]);
  const [unassignedSectionIds, setUnassignedSectionIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(eid: string) {
    setLoadError(null);
    const [stuckRes, assignRes] = await Promise.all([
      supabase
        .from("stuck_flags")
        .select("id, section_name, section_id, writer_name, created_at")
        .eq("engagement_id", eid)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("section_assignments")
        .select("section_id, user_id")
        .eq("engagement_id", eid)
        .is("user_id", null),
    ]);
    if (stuckRes.error || assignRes.error) {
      setLoadError(stuckRes.error?.message ?? assignRes.error?.message ?? "Failed to load");
      return;
    }
    setRows((stuckRes.data as StuckRow[]) ?? []);
    setUnassignedSectionIds(
      new Set(((assignRes.data as { section_id: string }[]) ?? []).map((a) => a.section_id)),
    );
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`stuck:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stuck_flags", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "section_assignments", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  async function resolve(id: string) {
    const { error } = await supabase.from("stuck_flags").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
  }

  if (loadError) {
    return <ErrorBanner error={loadError} onRetry={() => engagement && load(engagement.id)} label="Couldn't load needs-attention items." />;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-emerald-400">
          <Check className="h-4 w-4" /> All clear — nothing needs your attention right now.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[#eab308]/40 bg-[#eab308]/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#eab308]">
        <HandHelping className="h-3.5 w-3.5" /> Needs attention · {rows.length}
      </div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const isUnassigned = r.section_id ? unassignedSectionIds.has(r.section_id) : false;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="font-medium">🙋 {r.writer_name}</span>
                <span className="text-muted-foreground"> is stuck on </span>
                <span className="font-medium">{r.section_name}</span>
                {isUnassigned && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-orange-500/50 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                    Unassigned Section
                  </span>
                )}
                <span className="ml-2 text-[11px] text-muted-foreground">{relativeTime(r.created_at)}</span>
              </div>
              <button
                type="button"
                onClick={() => resolve(r.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3 w-3" /> Resolve
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
