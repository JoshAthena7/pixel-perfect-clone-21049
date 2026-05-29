import { useComms } from "@/hooks/use-comms";

export function PresenceDot({ memberId, withLabel = false }: { memberId: string; withLabel?: boolean }) {
  const { isOnline } = useComms();
  const online = isOnline(memberId);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-label={online ? "Online" : "Offline"}
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: online ? "#22c55e" : "#475569" }}
      />
      {withLabel && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {online ? "Online" : "Offline"}
        </span>
      )}
    </span>
  );
}
