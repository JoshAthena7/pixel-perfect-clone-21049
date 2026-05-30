import { Hand } from "lucide-react";
import { useComms } from "@/hooks/use-comms";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function NudgeButton({ memberId, displayName }: { memberId: string; displayName: string }) {
  const { isOnline, sendNudge, getAvailability } = useComms();
  const availability = getAvailability(memberId);
  if (availability === "deep_work") {
    return <span className="text-[10px] uppercase tracking-wider text-muted-foreground">In deep work</span>;
  }
  if (!isOnline(memberId)) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => sendNudge(memberId, displayName)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-hover text-muted-foreground hover:border-[var(--gold)]/60 hover:text-[var(--gold)] transition"
            aria-label={`Nudge ${displayName}`}
          >
            <Hand className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Got a minute?</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
