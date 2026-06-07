// UX-1: Inline urgency badge for question cards on the Flight Deck.
// Renders nothing for distant (8+ days) or missing pens-down dates.

type Props = { pensDownDate: string | Date | null | undefined };

function daysUntil(d: string | Date): number {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  if (isNaN(t)) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function PensDownBadge({ pensDownDate }: Props) {
  if (!pensDownDate) return null;
  const days = daysUntil(pensDownDate);
  if (isNaN(days)) return null;
  if (days >= 8) return null;

  let bg = "#F59E0B";
  let label = `${days} days`;

  if (days <= 0) {
    bg = "#EF4444";
    label = days === 0 ? "Due today" : "Overdue";
  } else if (days <= 3) {
    bg = "#EF4444";
    label = days === 1 ? "1 day" : `${days} days`;
  } else {
    // 4–7 days → amber
    bg = "#F59E0B";
    label = `${days} days`;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: bg }}
      title={`Pens down: ${new Date(pensDownDate).toLocaleDateString()}`}
    >
      {label}
    </span>
  );
}
