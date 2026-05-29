import { useEngagement } from "@/hooks/use-engagement";
import { CalendarClock } from "lucide-react";

export function TMinusStrip() {
  const { engagement } = useEngagement();
  if (!engagement?.submission_date) return null;
  const due = new Date(engagement.submission_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  const tone =
    days <= 3 ? "text-[color:var(--red)]" : days <= 14 ? "text-[var(--gold)]" : "text-foreground";
  return (
    <div className="w-full border-b border-border bg-surface-hover/40">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-xs">
        <CalendarClock className={`h-3.5 w-3.5 ${tone}`} />
        <span className="uppercase tracking-[0.18em] text-muted-foreground">Submission</span>
        <span className={`font-semibold ${tone}`}>
          T-minus {days < 0 ? `${Math.abs(days)} days past` : `${days} day${days === 1 ? "" : "s"}`}
        </span>
        <span className="text-muted-foreground">· {due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  );
}
