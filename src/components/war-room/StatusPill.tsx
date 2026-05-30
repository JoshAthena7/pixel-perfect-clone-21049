import { cn } from "@/lib/utils";

export type StatusColor = "Green" | "Yellow" | "Orange" | "Red" | "N/A";

const styles: Record<StatusColor, string> = {
  Green:  "bg-[color:color-mix(in_oklab,var(--green)_18%,transparent)] text-[color:var(--green)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--green)_40%,transparent)]",
  Yellow: "bg-[color:color-mix(in_oklab,var(--yellow)_18%,transparent)] text-[color:var(--yellow)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--yellow)_40%,transparent)]",
  Orange: "bg-[color:color-mix(in_oklab,var(--orange)_18%,transparent)] text-[color:var(--orange)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--orange)_40%,transparent)]",
  Red:    "bg-[color:color-mix(in_oklab,var(--red)_18%,transparent)] text-[color:var(--red)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--red)_40%,transparent)]",
  "N/A":  "bg-muted/40 text-muted-foreground ring-1 ring-inset ring-border",
};

const dotColor: Record<StatusColor, string> = {
  Green:  "bg-[color:var(--green)]",
  Yellow: "bg-[color:var(--yellow)]",
  Orange: "bg-[color:var(--orange)]",
  Red:    "bg-[color:var(--red)]",
  "N/A":  "bg-muted-foreground",
};

export function StatusPill({
  status,
  label,
  className,
}: {
  status: StatusColor;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
        styles[status],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[status])} />
      {label ?? status}
    </span>
  );
}
