import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function OlympusSecondaryNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: activeCount = 0 } = useQuery({
    queryKey: ["olympus-active-mission-count"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      return count ?? 0;
    },
  });

  const items = [
    { label: "Missions", to: "/olympus/missions", badge: activeCount, match: pathname === "/olympus/missions" || pathname.startsWith("/olympus/missions") },
    { label: "Flight Deck", to: "/olympus/flight-deck", badge: null as number | null, match: pathname.startsWith("/olympus/flight-deck") },
    ...(isAdmin
      ? [{ label: "Athena Team", to: "/admin/team", badge: null as number | null, match: pathname.startsWith("/admin") }]
      : []),
  ];

  return (
    <div className="border-b border-border bg-background/60 px-4 sm:px-6">
      <div className="mx-auto max-w-7xl flex items-center gap-6 h-10">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to as any}
            className={cn(
              "text-sm py-2 border-b-2 transition-colors -mb-px flex items-center gap-2",
              it.match
                ? "border-[var(--athena-gold)] text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {it.badge != null && it.badge > 0 && (
              <span className="rounded-full bg-[var(--athena-gold)]/20 text-[var(--athena-gold)] text-[10px] px-1.5 py-0.5">
                {it.badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
