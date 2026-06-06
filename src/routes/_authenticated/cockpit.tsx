import { createFileRoute } from "@tanstack/react-router";
import { Plane } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cockpit")({
  component: CockpitPage,
});

/**
 * PR 2a stub.
 *
 * Cockpit is being promoted out of the mission interior into a user-level
 * "what's on my plate across every mission" view. PR 4 will replace this
 * placeholder with the real cross-mission assigned-sections list (grouped
 * per mission, row click → existing section workspace).
 *
 * Kept minimal so the new top-level route + nav entry can ship now without
 * blocking on PR 4.
 */
function CockpitPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center gap-3 mb-4">
        <Plane size={20} strokeWidth={1.5} className="text-[#3b7fff]" />
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Cockpit</h1>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your cross-mission cockpit — every section assigned to you, grouped by
        mission. Coming online with PR 4.
      </p>
      <div
        className="mt-8 rounded-lg border p-6 text-[13px] text-muted-foreground"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
      >
        Once activated, this view replaces the in-mission Cockpit tab. From here you'll
        see what's assigned to you across <em>all</em> active missions, with status,
        due dates, and one-click jump into the section workspace.
      </div>
    </div>
  );
}
