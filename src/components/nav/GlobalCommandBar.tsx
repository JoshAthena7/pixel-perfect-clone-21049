import { Link } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MissionSwitcher } from "./MissionSwitcher";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";

export function GlobalCommandBar({ email }: { email?: string | null }) {
  return (
    <div className="sticky top-0 z-50 h-11 bg-[#0D1B3E] border-b border-white/10 text-white px-4 sm:px-6">
      <div className="mx-auto max-w-7xl h-full grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link
          to="/olympus/missions"
          className="font-bold tracking-[0.2em] text-[var(--athena-gold)] text-sm"
        >
          ATLAS
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
