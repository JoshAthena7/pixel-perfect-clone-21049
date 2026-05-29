import { quoteOfTheDay } from "@/lib/quotes";

export function DailyQuote() {
  const { q, a } = quoteOfTheDay();
  return (
    <div className="w-full border-b border-border/40 bg-background">
      <div className="mx-auto max-w-3xl px-4 py-3 text-center">
        <p className="italic text-sm text-muted-foreground">"{q}"</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">— {a}</p>
      </div>
    </div>
  );
}
