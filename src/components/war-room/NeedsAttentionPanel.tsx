import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { HandHelping, Check } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { toast } from "sonner";

type StuckRow = {
  id: string;
  section_name: string;
  writer_name: string;
  created_at: string;
};

export function NeedsAttentionPanel() {
  const { engagement } = useEngagement();
  const [rows, setRows] = useState<StuckRow[]>([]);

  async function load(eid: string) {
    const { data } = await supabase
      .from("stuck_flags")
      .select("id, section_name, writer_name, created_at")
      .eq("engagement_id", eid)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);
    setRows((data as StuckRow[]) ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`stuck:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stuck_flags", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  async function resolve(id: string) {
    const { error } = await supabase.from("stuck_flags").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
  }

  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#eab308]/40 bg-[#eab308]/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#eab308]">
        <HandHelping className="h-3.5 w-3.5" /> Needs attention · {rows.length}
      </div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium">🙋 {r.writer_name}</span>
              <span className="text-muted-foreground"> is stuck on </span>
              <span className="font-medium">{r.section_name}</span>
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
        ))}
      </ul>
    </div>
  );
}
