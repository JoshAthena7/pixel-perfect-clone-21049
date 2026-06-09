import { createFileRoute } from "@tanstack/react-router";
import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";
import { AthenaTeamRoster } from "@/components/admin/AthenaTeamRoster";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[12px] font-extrabold uppercase tracking-[0.32em]">
            Olympus · <span className="text-foreground/70">Athena Team</span>
          </h1>
        </div>
        <FastReportsMenu />
      </header>

      <div className="p-5">
        <AthenaTeamRoster />
      </div>
    </div>
  );
}
