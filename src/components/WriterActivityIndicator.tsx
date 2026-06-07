// UX-5: Muted "last active" line below the assigned writer on each Flight Deck card.

type Props = {
  writerName: string | null | undefined;
  lastActiveAt: string | Date | null | undefined;
};

function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return "Not started";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  if (isNaN(t)) return "Not started";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (hours < 1) return `${Math.max(1, mins)} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days <= 6) return `${days} days ago`;
  return "Not started";
}

export function WriterActivityIndicator({ writerName, lastActiveAt }: Props) {
  const rel = relativeTime(lastActiveAt);
  const first = (writerName ?? "").trim().split(/\s+/)[0];
  const text = first ? `${first} — ${rel}` : rel;
  return (
    <div className="text-[10px] font-normal text-muted-foreground">{text}</div>
  );
}
