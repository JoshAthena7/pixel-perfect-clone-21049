import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyLegacyRecord } from "@/lib/legacy.functions";
import { Trophy, DollarSign, MapPin, Users, Flame } from "lucide-react";

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtPeople(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function LegacyRecord() {
  const fn = useServerFn(getMyLegacyRecord);
  const { data } = useQuery({
    queryKey: ["my-legacy-record"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });

  const stats = [
    { label: "Wins on record", value: data?.wins ?? 0, icon: Trophy, tone: "text-emerald-400" },
    { label: "Awarded contracts", value: data ? fmtUsd(data.awardedUsd) : "$0", icon: DollarSign, tone: "text-amber-400" },
    { label: "States", value: data?.states ?? 0, icon: MapPin, tone: "text-sky-400" },
    { label: "People served", value: data ? fmtPeople(data.peopleServed) : "0", icon: Users, tone: "text-violet-400" },
    { label: "Day streak", value: data?.streakDays ?? 0, icon: Flame, tone: "text-orange-400" },
  ];

  return (
    <section
      className="rounded-[12px] border border-border bg-gradient-to-r from-surface via-surface/80 to-surface px-6 py-5"
      aria-label="Your legacy record"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your Legacy
          </div>
          <p className="mt-1 text-sm text-foreground/80">
            Yours. Always. Grows with every engagement.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-[8px] border border-border/60 bg-background/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${s.tone}`} strokeWidth={2} />
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <div className={`mt-2 text-xl font-medium tracking-tight ${s.tone}`}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
