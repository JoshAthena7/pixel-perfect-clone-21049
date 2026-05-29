export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  const w = Math.round(days / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.round(days / 365);
  return `${y}y ago`;
}

export function hoursSince(input: string | Date | null | undefined): number {
  if (!input) return Infinity;
  const d = typeof input === "string" ? new Date(input) : input;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
