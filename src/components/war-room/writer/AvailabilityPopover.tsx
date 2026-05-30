import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useComms, type AvailabilityStatus } from "@/hooks/use-comms";
import { type ReactNode } from "react";

const OPTIONS: { value: AvailabilityStatus; emoji: string; label: string; desc: string }[] = [
  { value: "available", emoji: "🟢", label: "Available", desc: "Open to nudges and quick chats" },
  { value: "deep_work", emoji: "🔵", label: "Deep Work", desc: "Heads down, please don't nudge" },
  { value: "away", emoji: "🟡", label: "Away", desc: "Not at desk" },
];

export function AvailabilityPopover({ children }: { children: ReactNode }) {
  const { ownAvailability, setOwnAvailability } = useComms();
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Set your status</div>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOwnAvailability(o.value)}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-hover ${
              ownAvailability === o.value ? "bg-surface-hover" : ""
            }`}
          >
            <span className="text-base leading-none">{o.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{o.label}</div>
              <div className="text-[11px] text-muted-foreground">{o.desc}</div>
            </div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function statusEmoji(s: AvailabilityStatus | undefined): string {
  if (s === "deep_work") return "🔵";
  if (s === "away") return "🟡";
  return "🟢";
}

export function statusLabel(s: AvailabilityStatus | undefined): string {
  if (s === "deep_work") return "Deep Work";
  if (s === "away") return "Away";
  return "Available";
}
