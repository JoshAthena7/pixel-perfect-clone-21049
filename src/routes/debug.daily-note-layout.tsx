import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { IrisDailyNote } from "@/components/v2/IrisDailyNote";

const Search = z.object({
  /** Optional YYYY-MM-DD override; lets tests pin the rotation deterministically. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/debug/daily-note-layout")({
  validateSearch: (s) => Search.parse(s),
  component: DailyNoteLayoutDebug,
});

function parseLocalDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/**
 * Public debug route that mirrors the Atrium's vertical stack:
 *   greeting header  →  IrisDailyNote banner  →  mission cards grid
 *
 * Optional ?date=YYYY-MM-DD pins the daily-note rotation for tests.
 */
function DailyNoteLayoutDebug() {
  const { date } = Route.useSearch();
  const now = date ? parseLocalDate(date) : undefined;

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

      <IrisDailyNote now={now} />

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
