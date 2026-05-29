import { cn } from "@/lib/utils";

type Health = "Green" | "Yellow" | "Red" | "Unknown";

const ringMap: Record<Health, string> = {
  Green:   "bg-[color:color-mix(in_oklab,var(--green)_22%,transparent)] text-[color:var(--green)] glow-green",
  Yellow:  "bg-[color:color-mix(in_oklab,var(--yellow)_22%,transparent)] text-[color:var(--yellow)] glow-yellow",
  Red:     "bg-[color:color-mix(in_oklab,var(--red)_22%,transparent)] text-[color:var(--red)] glow-red",
  Unknown: "bg-surface-hover text-muted-foreground",
};

export function HealthCircle({
  health,
  size = "lg",
  className,
}: {
  health: Health;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "sm" ? "h-10 w-10 text-base" :
    size === "md" ? "h-14 w-14 text-xl"  :
                    "h-20 w-20 text-3xl";
  const letter = health === "Unknown" ? "—" : health.charAt(0);
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-bold ring-1 ring-inset ring-white/10",
        dims,
        ringMap[health],
        className,
      )}
      aria-label={`Health: ${health}`}
    >
      {letter}
    </div>
  );
}
