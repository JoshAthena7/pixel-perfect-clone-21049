import { Link } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MissionSwitcher } from "./MissionSwitcher";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";
import athenaMark from "@/assets/athena-mark-v3.png.asset.json";
import atlasWordmark from "@/assets/atlas-wordmark-optical.png";

export function GlobalCommandBar({ email }: { email?: string | null }) {
  return (
    <div className="sticky top-0 z-50 h-12 bg-[#0D1B3E] border-b border-[#C49A2B]/40 text-white px-4 sm:px-6">
      <div className="mx-auto max-w-7xl h-full grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link
          to="/olympus/missions"
          className="flex items-center gap-2.5 group select-none"
          aria-label="ATLAS — Athena Strategy Group"
        >
          <img
            src={athenaMark.url}
            alt=""
            aria-hidden
            draggable={false}
            className="h-7 w-7 object-contain shrink-0 transition-transform group-hover:scale-105"
          />
          <img
            src={atlasWordmark}
            alt="ATLAS"
            draggable={false}
            className="h-5 w-auto object-contain"
            style={{ filter: "brightness(1.1) drop-shadow(0 0 6px rgba(196,154,43,0.25))" }}
          />
        </Link>
        <div className="flex justify-center min-w-0">
          <MissionSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <IntelAlertCount />
          <NotificationBell />
          <UserMenu email={email} />
        </div>
      </div>
    </div>
  );
}
