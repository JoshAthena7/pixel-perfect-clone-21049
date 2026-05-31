import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertOctagon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useMember } from "@/hooks/use-member";
import { relativeTime } from "@/lib/time";

type SosAlert = {
  id: string;
  category: string;
  severity: string;
  description: string;
  submitter_name: string;
  status: string;
  request_type: string;
  created_at: string;
};

const BORDER = "rgba(255,255,255,0.08)";

/**
 * SOS banner — surfaces open `request_type='sos'` alerts at the top of
 * Mission Control. Leadership can acknowledge (mark In Progress) inline.
 */
export function SosBanner() {
  const { engagement, can } = useEngagement();
  const { member } = useMember();
  const [alerts, setAlerts] = useState<SosAlert[]>([]);

  useEffect(() => {
    if (!engagement) return;
    let cancelled = false;

    async function load(eid: string) {
      const { data } = await supabase
        .from("sos_alerts")
        .select("id,category,severity,description,submitter_name,status,request_type,created_at")
        .eq("engagement_id", eid)
        .eq("request_type", "sos")
        .neq("status", "Resolved")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setAlerts((data as SosAlert[]) ?? []);
    }
    load(engagement.id);

    const ch = supabase
      .channel(`sos-banner:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [engagement?.id]);

  if (!engagement || alerts.length === 0) return null;

  const canManage = can("missionControl") && !!member;

  async function dismiss(id: string) {
    await supabase.from("sos_alerts").update({ status: "In Progress" }).eq("id", id);
  }

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="rounded-lg overflow-hidden"
      style={{
        border: "1px solid rgba(239,68,68,0.6)",
        background: "linear-gradient(180deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
      }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "rgba(239,68,68,0.4)" }}>
        <AlertOctagon className="h-4 w-4 text-[#ef4444]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ef4444]">
          SOS — {alerts.length} active
        </span>
        <Link to="/issues" className="ml-auto text-[11px] text-[#fca5a5] hover:underline">View all →</Link>
      </div>
      <ul className="divide-y" style={{ borderColor: BORDER }}>
        {alerts.slice(0, 3).map((a) => (
          <li key={a.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className="mt-1 inline-block h-2 w-2 rounded-full"
              style={{ background: a.severity === "Critical" || a.severity === "Red" ? "#ef4444" : a.severity === "High" || a.severity === "Orange" ? "#f97316" : "#eab308" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold text-white truncate">{a.category}</span>
                <span className="text-[11px] text-muted-foreground">· {a.submitter_name} · {relativeTime(a.created_at)}</span>
              </div>
              <div className="text-[12px] text-white/85 line-clamp-2">{a.description}</div>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
                title="Mark as in progress"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
        {alerts.length > 3 && (
          <li className="px-4 py-2 text-[11px] text-muted-foreground">+{alerts.length - 3} more SOS open</li>
        )}
      </ul>
    </section>
  );
}
