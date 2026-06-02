import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/operations")({
  component: OperationsPage,
});

const TABS = ["Risks", "Issues", "Decisions", "Assumptions", "Signals", "Health Checks"] as const;
type Tab = (typeof TABS)[number];

function OperationsPage() {
  const [tab, setTab] = useState<Tab>("Risks");

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-6">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Mission Operations
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Track risks, issues, decisions, assumptions, signals, and health across the mission.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <section className="rounded-[12px] border border-border bg-surface p-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          {tab}
        </div>
        <p className="text-sm text-muted-foreground">
          The {tab} surface will be wired in here in the next phase. No functionality is lost — this section
          consolidates existing components.
        </p>
      </section>
    </div>
  );
}
