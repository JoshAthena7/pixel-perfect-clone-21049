import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Users, ListChecks, Clock, ArrowRight } from "lucide-react";
import type { SizingData, SizingAssumptions, ServicesChecklist as ServicesChecklistType } from "@/lib/ai/sizing.functions";
import { capacityFor, SERVICE_CATEGORIES } from "@/lib/ai/sizing.functions";

type Props = { engagementId: string };

export function SizingSummaryStrip({ engagementId }: Props) {
  const [data, setData] = useState<{
    sizing: SizingData | null;
    assumptions: SizingAssumptions | null;
    services: ServicesChecklistType | null;
    days: number | null;
  } | null>(null);

  useEffect(() => {
    supabase
      .from("engagement_config")
      .select("sizing_data, sizing_assumptions, services_checklist, submission_days_remaining")
      .eq("engagement_id", engagementId)
      .maybeSingle()
      .then(({ data }) => {
        setData({
          sizing: (data?.sizing_data as SizingData) ?? null,
          assumptions: (data?.sizing_assumptions as SizingAssumptions) ?? null,
          services: (data?.services_checklist as ServicesChecklistType) ?? null,
          days: data?.submission_days_remaining ?? null,
        });
      });
  }, [engagementId]);

  if (!data || (!data.sizing && !data.services)) return null;

  const capacity = capacityFor(data.assumptions, data.days);
  const totalPages =
    data.sizing?.total_page_limit ?? (data.sizing?.sections ?? []).reduce((s, x) => s + (x.page_limit ?? 0), 0);
  const writersNeeded = capacity > 0 && totalPages > 0 ? Math.ceil(totalPages / capacity) : 0;
  let servicesChecked = 0;
  let totalHours = 0;
  if (data.services) {
    for (const cat of SERVICE_CATEGORIES) {
      const items = data.services[cat.key]?.items ?? [];
      for (const it of items) {
        if (it.checked) {
          servicesChecked++;
          totalHours += Number(it.estimated_hours) || 0;
        }
      }
    }
  }

  return (
    <Link
      to="/engagement/$id/sizing"
      params={{ id: engagementId }}
      className="flex items-center gap-4 rounded-md border border-border bg-surface/60 px-4 py-2 text-xs hover:bg-surface transition"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scope</span>
      <span className="inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-[var(--gold)]" />
        <strong className="tabular-nums">{writersNeeded || "—"}</strong> writers
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5 text-[var(--gold)]" />
        <strong className="tabular-nums">{servicesChecked}</strong> services
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-[var(--gold)]" />
        <strong className="tabular-nums">{totalHours}h</strong> est.
      </span>
      <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
        Open sizing <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
