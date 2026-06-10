import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Basics" },
  { n: 2, label: "RFP" },
  { n: 3, label: "Processing" },
  { n: 4, label: "Review" },
  { n: 5, label: "Strategy" },
  { n: 6, label: "Journey" },
  { n: 7, label: "Team" },
  { n: 8, label: "Territory" },
  { n: 9, label: "Intelligence" },
  { n: 10, label: "Monitoring" },
  { n: 11, label: "Competitive" },
  { n: 12, label: "Launch" },
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
  const navigate = useNavigate();
  // missionId only exists once we're past Step 1 (route: /olympus/missions/$missionId/wizard)
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params?.missionId;

  const goToStep = (n: number) => {
    if (!missionId) return;
    navigate({
      to: "/olympus/missions/$missionId/wizard",
      params: { missionId },
      search: { step: n },
    });
  };

  const canJump = !!missionId;
  const canSkip = canJump && step >= 2 && step < 8;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-5 flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Link to="/olympus/missions" className="font-semibold tracking-[0.22em] text-foreground text-sm">
            ATHENA
          </Link>
          <div className="flex items-center gap-3">
            {step > 1 && onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            {canSkip && (
              <button
                onClick={() => goToStep(step + 1)}
                title="Skip this step for now — you can return any time before Blast Off"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <ol className="flex items-center gap-3 sm:gap-5 flex-wrap justify-end">
          {STEPS.map((s) => {
            const done = s.n < step;
            const current = s.n === step;
            const clickable = canJump && !current;
            const Tag: any = clickable ? "button" : "div";
            return (
              <li key={s.n} className="flex flex-col items-center gap-1.5">
                <Tag
                  type={clickable ? "button" : undefined}
                  onClick={clickable ? () => goToStep(s.n) : undefined}
                  title={clickable ? `Go to ${s.label}` : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1.5",
                    clickable && "cursor-pointer hover:opacity-80 transition-opacity",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-full border transition-all block",
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
                </Tag>
              </li>
            );
          })}
        </ol>
      </header>
      <main className={cn("flex-1 flex justify-center px-6 py-8", !wide && "items-center")}>
        <div className={cn("w-full", wide ? "max-w-[1400px]" : "max-w-[720px]")}>{children}</div>
      </main>
    </div>
  );
}
