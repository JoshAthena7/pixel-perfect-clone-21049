import { MessageCircle } from "lucide-react";
import { useComms } from "@/hooks/use-comms";

export function ChatNavButton() {
  const { unreadChats, unreadNudges, openChatWith, markNudgesRead } = useComms();
  const total = unreadChats + unreadNudges.length;
  const latestNudge = unreadNudges[0];

  function onClick() {
    if (latestNudge) {
      openChatWith(latestNudge.sender_id, latestNudge.sender_name);
      markNudgesRead();
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-hover text-muted-foreground hover:border-[var(--gold)]/60 hover:text-[var(--gold)] transition"
      aria-label="Messages"
      title={latestNudge ? `${latestNudge.sender_name} nudged you` : "Messages"}
    >
      <MessageCircle className="h-4 w-4" />
      {total > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--red)] px-1 text-[9px] font-bold text-white">
          {total > 9 ? "9+" : total}
        </span>
      )}
    </button>
  );
}
