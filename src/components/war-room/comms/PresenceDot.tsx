import { useComms } from "@/hooks/use-comms";
import { useEngagement } from "@/hooks/use-engagement";
import { AvailabilityPopover, statusLabel } from "@/components/war-room/writer/AvailabilityPopover";

function dotColor(availability: string, online: boolean): string {
  if (availability === "away") return "#eab308";
  if (availability === "deep_work") return "#3b82f6";
  return online ? "#22c55e" : "#475569";
}

export function PresenceDot({ memberId, withLabel = false }: { memberId: string; withLabel?: boolean }) {
  const { isOnline, getAvailability } = useComms();
  const { member } = useEngagement();
  const availability = getAvailability(memberId);
  const online = isOnline(memberId);
  const isSelf = member?.id === memberId;
  const color = dotColor(availability, online);

  const dot = (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-label={statusLabel(availability)}
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {withLabel && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {statusLabel(availability)}
        </span>
      )}
    </span>
  );

  if (isSelf) {
    return (
      <AvailabilityPopover>
        <button type="button" className="cursor-pointer" title="Set your status">{dot}</button>
      </AvailabilityPopover>
    );
  }
  return dot;
}
