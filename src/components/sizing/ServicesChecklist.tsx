import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import {
  SERVICE_CATEGORIES,
  defaultServicesChecklist,
  saveServicesChecklist,
  type ServicesChecklist as ServicesChecklistType,
} from "@/lib/ai/sizing.functions";

type Props = { engagementId: string };

export function ServicesChecklist({ engagementId }: Props) {
  const saveFn = useServerFn(saveServicesChecklist);
  const [state, setState] = useState<ServicesChecklistType>(() => defaultServicesChecklist());
  const [open, setOpen] = useState<Set<string>>(new Set(SERVICE_CATEGORIES.map((c) => c.key)));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("engagement_config")
        .select("services_checklist")
        .eq("engagement_id", engagementId)
        .maybeSingle();
      const existing = data?.services_checklist as ServicesChecklistType | null;
      if (existing) {
        // Merge with defaults to ensure new categories appear
        const merged = defaultServicesChecklist();
        for (const cat of SERVICE_CATEGORIES) {
          const existingCat = existing[cat.key];
          if (!existingCat) continue;
          merged[cat.key].items = merged[cat.key].items.map((item) => {
            const match = existingCat.items?.find((i) => i.label === item.label);
            return match ? { ...item, ...match } : item;
          });
        }
        setState(merged);
      }
      setLoaded(true);
    })();
  }, [engagementId]);

  // Debounced save
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveFn({ data: { engagementId, checklist: state as any } }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [state, loaded, engagementId, saveFn]);

  function updateItem(catKey: string, idx: number, patch: Partial<ServicesChecklistType[string]["items"][number]>) {
    setState((prev) => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        items: prev[catKey].items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
      },
    }));
  }

  function toggleCat(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function catHours(catKey: string): number {
    return (state[catKey]?.items ?? []).reduce((s, it) => s + (it.checked ? Number(it.estimated_hours) || 0 : 0), 0);
  }

  const totalHours = SERVICE_CATEGORIES.reduce((s, c) => s + catHours(c.key), 0);
  const totalChecked = SERVICE_CATEGORIES.reduce(
    (s, c) => s + (state[c.key]?.items?.filter((i) => i.checked).length ?? 0),
    0,
  );

  return (
    <Card className="border-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Full Engagement Services
          </h3>
          <p className="text-xs text-muted-foreground">Check what this engagement requires. Saved automatically.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">{totalChecked} services</div>
          <div className="text-lg font-bold tabular-nums">{totalHours}h</div>
        </div>
      </div>

      <div className="space-y-2">
        {SERVICE_CATEGORIES.map((cat) => {
          const isOpen = open.has(cat.key);
          const catH = catHours(cat.key);
          const checked = state[cat.key]?.items?.filter((i) => i.checked).length ?? 0;
          return (
            <div key={cat.key} className="rounded-md border border-border bg-background/30">
              <button
                type="button"
                onClick={() => toggleCat(cat.key)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.02]"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="flex-1 text-left text-sm font-semibold">{cat.label}</span>
                <span className="text-[11px] text-muted-foreground">{checked} · {catH}h</span>
              </button>
              {isOpen && (
                <div className="border-t border-border p-3 space-y-2">
                  {(state[cat.key]?.items ?? []).map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[auto_2fr_1fr_70px] items-start gap-2">
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(v) => updateItem(cat.key, idx, { checked: !!v })}
                        className="mt-1.5"
                      />
                      <div className="text-xs pt-1.5 font-medium">{item.label}</div>
                      <Textarea
                        rows={1}
                        value={item.notes}
                        onChange={(e) => updateItem(cat.key, idx, { notes: e.target.value })}
                        placeholder="Notes…"
                        className="text-xs min-h-[32px] py-1.5"
                        disabled={!item.checked}
                      />
                      <Input
                        type="number"
                        value={item.estimated_hours || ""}
                        onChange={(e) => updateItem(cat.key, idx, { estimated_hours: Number(e.target.value) || 0 })}
                        placeholder="hrs"
                        className="h-8 text-xs"
                        disabled={!item.checked}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold">Total estimated engagement hours</span>
        <span className="text-xl font-bold tabular-nums">{totalHours}h</span>
      </div>
    </Card>
  );
}
