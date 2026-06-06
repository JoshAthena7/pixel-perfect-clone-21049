import { createFileRoute } from "@tanstack/react-router";
import { IrisDailyNote } from "@/components/v2/IrisDailyNote";

export const Route = createFileRoute("/debug/daily-note-layout")({
  component: DailyNoteLayoutDebug,
});

/**
 * Public debug route that mirrors the Atrium's vertical stack:
 *   greeting header  →  IrisDailyNote banner  →  mission cards grid
 *
 * Used by tests/iris-daily-note-layout.spec.ts to verify the daily-note
 * banner is full width, sits between greeting and mission cards, and renders
 * its three-zone layout (left date / center note / right label).
 */
function DailyNoteLayoutDebug() {
  return (
    <div className="min-h-screen bg-background">
      <header
        data-testid="greeting-header"
        className="border-b border-border bg-surface"
      >
        <div className="mx-auto max-w-[1400px] px-8 py-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            The Atrium
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Good morning, Commander.</h1>
        </div>
      </header>

      <IrisDailyNote />

      <section
        data-testid="mission-cards"
        className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-8 py-10 md:grid-cols-3"
      >
        <div className="rounded-lg border border-border bg-surface p-6">Mission Card A</div>
        <div className="rounded-lg border border-border bg-surface p-6">Mission Card B</div>
        <div className="rounded-lg border border-border bg-surface p-6">Mission Card C</div>
      </section>
    </div>
  );
}
