import { format } from "date-fns";

export type DueState = {
  text: string;
  color: string; // tailwind text- color
  bold: boolean;
  pulse: boolean;
};

export function dueState(dueDate: string | null | undefined): DueState | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  // Strip time — compare calendar days in local time
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`, color: "#ef4444", bold: true, pulse: false };
  }
  if (diffDays === 0) return { text: "Due today", color: "#ef4444", bold: true, pulse: false };
  if (diffDays === 1) return { text: "Due tomorrow", color: "#ef4444", bold: false, pulse: true };
  if (diffDays <= 3) return { text: `Due in ${diffDays} days`, color: "#f97316", bold: false, pulse: false };
  if (diffDays <= 7) return { text: `Due in ${diffDays} days`, color: "#eab308", bold: false, pulse: false };
  return { text: `Due ${format(due, "MMM d")}`, color: "var(--muted-foreground)", bold: false, pulse: false };
}
