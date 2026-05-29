import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { daysUntil } from "@/lib/time";

type Milestone = {
  id: string;
  label: string;
  due_date: string;
  completed_at: string | null;
  sort_order: number;
};

const DEFAULT_MILESTONES = [
  { label: "Outline approved", offsetDays: -28 },
  { label: "Draft due", offsetDays: -21 },
  { label: "Red team review", offsetDays: -14 },
  { label: "Gold team review", offsetDays: -7 },
  { label: "Production-ready", offsetDays: -3 },
  { label: "Submitted", offsetDays: 0 },
];

export function MilestonesCard() {
  const { engagement, isLeadership } = useEngagement();
  const [items, setItems] = useState<Milestone[]>([]);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase
      .from("engagement_milestones")
      .select("*")
      .eq("engagement_id", eid)
      .order("due_date");
    setItems((data as Milestone[]) ?? []);
  }

  useEffect(() => {
    if (engagement) load(engagement.id);
  }, [engagement?.id]);

  if (!engagement) return null;

  async function add() {
    if (!engagement || !label.trim() || !date) return;
    setBusy(true);
    const { error } = await supabase.from("engagement_milestones").insert({
      engagement_id: engagement.id,
      label: label.trim(),
      due_date: format(date, "yyyy-MM-dd"),
      sort_order: items.length,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setLabel(""); setDate(undefined);
    load(engagement.id);
  }

  async function toggle(m: Milestone) {
    const { error } = await supabase
      .from("engagement_milestones")
      .update({ completed_at: m.completed_at ? null : new Date().toISOString() })
      .eq("id", m.id);
    if (error) toast.error(error.message);
    else load(engagement!.id);
  }

  async function remove(m: Milestone) {
    const { error } = await supabase.from("engagement_milestones").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else load(engagement!.id);
  }

  async function seedDefaults() {
    if (!engagement?.submission_date) {
      return toast.error("Set a submission date first.");
    }
    setBusy(true);
    const base = new Date(engagement.submission_date);
    const rows = DEFAULT_MILESTONES.map((m, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + m.offsetDays);
      return {
        engagement_id: engagement.id,
        label: m.label,
        due_date: format(d, "yyyy-MM-dd"),
        sort_order: i,
      };
    });
    const { error } = await supabase.from("engagement_milestones").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Default milestones added");
    load(engagement.id);
  }

  return (
    <Card className="border-border bg-surface p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Submission milestones</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Show up in the top banner across every page so the whole team feels the clock.
          </p>
        </div>
        {isLeadership && items.length === 0 && (
          <Button size="sm" variant="outline" onClick={seedDefaults} disabled={busy}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Seed defaults
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No milestones yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => {
            const done = !!m.completed_at;
            const dleft = daysUntil(m.due_date);
            const overdue = !done && dleft !== null && dleft < 0;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border bg-surface-hover/40 px-3 py-2",
                  done && "opacity-60",
                )}
              >
                <button
                  onClick={() => isLeadership && toggle(m)}
                  disabled={!isLeadership}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--green)]" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <span className={cn("flex-1 text-sm", done && "line-through")}>{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.due_date}</span>
                {!done && dleft !== null && (
                  <span
                    className={cn(
                      "text-xs",
                      overdue ? "text-[color:var(--red)] font-medium" : "text-muted-foreground",
                    )}
                  >
                    {dleft > 0 ? `T-${dleft}d` : dleft === 0 ? "Today" : `${Math.abs(dleft)}d late`}
                  </span>
                )}
                {isLeadership && (
                  <button onClick={() => remove(m)} className="text-muted-foreground hover:text-[color:var(--red)]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isLeadership && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="ms-label">New milestone</Label>
            <Input id="ms-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pricing locked" />
          </div>
          <div>
            <Label>Due</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={add} disabled={busy || !label.trim() || !date}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </Card>
  );
}
