import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import BriefRoomPage from "@/routes/_authenticated/brief-room";

// Reuse the same page; sidebar lives in the Olympus shell, and admins see
// Compose + Delivery tabs automatically because they hold the admin role.
export const Route = createFileRoute("/_authenticated/olympus/brief-room")({
  component: OlympusBriefRoom,
});

function OlympusBriefRoom() {
  return (
    <div>
      <div className="px-6 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground flex items-center gap-2">
          <Megaphone size={12} /> Olympus · Leadership Messaging
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">
          Compose Global or Direct Briefings and view delivery reports. Users see their inbox at{" "}
          <Link to="/brief-room" className="underline hover:text-foreground">
            /brief-room
          </Link>
          .
        </div>
      </div>
      {/* The shared page already renders Inbox / Compose / Delivery tabs for admins. */}
      <BriefRoomPage />
    </div>
  );
}
