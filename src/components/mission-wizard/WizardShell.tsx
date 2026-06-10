import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Basics" },
  { n: 2, label: "RFP" },
  { n: 3, label: "Review" },
  { n: 4, label: "Strategy" },
  { n: 5, label: "Journey" },
  { n: 6, label: "Team+Launch" },
];

export function WizardShell({
  step,
  onBack,
  children,
  wide,
}: {
  step: number;
  onBack?: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-5 flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Link to="/olympus/missions" className="font-semibold tracking-[0.22em] text-foreground text-sm">
            ATHENA
          </Link>
          {step > 1 && onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
        </div>
        <ol className="flex items-center gap-3 sm:gap-5 flex-wrap justify-end">
          {STEPS.map((s) => {
            const done = s.n < step;
            const current = s.n === step;
            return (
              <li key={s.n} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border transition-all",
                    current
                      ? "h-4 w-4 bg-[var(--athena-gold)] border-[var(--athena-gold)] shadow-[0_0_0_4px_var(--athena-gold-subtle)]"
                      : done
                      ? "h-3 w-3 bg-[var(--athena-gold)] border-[var(--athena-gold)]"
                      : "h-3 w-3 bg-transparent border-[var(--athena-gold)]/60",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    current ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[720px]">{children}</div>
      </main>
    </div>
  );
}
