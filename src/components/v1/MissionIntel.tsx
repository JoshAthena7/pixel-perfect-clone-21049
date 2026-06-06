import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listIntel } from "@/lib/v1/mission.functions";
import { generateMissionBrief } from "@/lib/iris-mission-brief.functions";
import { NJ_CSOC_MISSION_ID } from "@/lib/v1/mission";
import { IrisBadge } from "./IrisBadge";

const TABS = ["IRIS Brief", "All Intelligence", "By Category"] as const;
type Tab = (typeof TABS)[number];

export function MissionIntel() {
  const [tab, setTab] = useState<Tab>("IRIS Brief");
  const fetchIntel = useServerFn(listIntel);
  const generate = useServerFn(generateMissionBrief);

  const { data: intel = [], isLoading } = useQuery({
    queryKey: ["v1-intel"],
    queryFn: () => fetchIntel(),
  });

  const { data: brief, isLoading: briefLoading } = useQuery({
    queryKey: ["v1-iris-brief"],
    queryFn: async () => {
      try {
        return await generate({ data: { missionId: NJ_CSOC_MISSION_ID, force: false } });
      } catch {
        return {
          brief: "Mission brief is unavailable. You may not have access to this mission, or it no longer exists.",
          generated_at: new Date().toISOString(),
          cached: false,
          error: "mission_not_found" as const,
        };
      }
    },
    staleTime: 15 * 60 * 1000,
  });

  const byCategory = intel.reduce<Record<string, typeof intel>>((acc, item) => {
    const k = item.category ?? "Uncategorized";
    (acc[k] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="px-8 py-8 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">Mission Intel</h1>
      <p className="mt-2 text-sm text-[color:var(--v1-muted)]">NJ CSOC intelligence library</p>

      <div className="mt-6 flex gap-1 border-b border-[color:var(--v1-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[color:var(--v1-primary)] text-[color:var(--v1-text)]"
                : "border-transparent text-[color:var(--v1-muted)] hover:text-[color:var(--v1-text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "IRIS Brief" && (
          <div className="v1-card p-6">
            <div className="flex items-center justify-between mb-4">
              <IrisBadge>IRIS Brief</IrisBadge>
              {brief?.generated_at && (
                <span className="text-xs text-[color:var(--v1-muted)]">
                  Last updated {new Date(brief.generated_at).toLocaleString()}
                </span>
              )}
            </div>
            {briefLoading ? (
              <div className="text-[color:var(--v1-muted)] italic">IRIS is reading the mission…</div>
            ) : (
              <p className="text-sm leading-relaxed text-[color:var(--v1-text)]/90 whitespace-pre-wrap">
                {brief?.brief ?? "No brief available yet."}
              </p>
            )}
          </div>
        )}

        {tab === "All Intelligence" && (
          <div className="space-y-2">
            {isLoading && <div className="text-[color:var(--v1-muted)]">Loading…</div>}
            {!isLoading && intel.length === 0 && (
              <div className="v1-card p-6 text-center text-[color:var(--v1-muted)]">
                No intelligence items tagged to this mission yet.
              </div>
            )}
            {intel.map((item) => (
              <a
                key={item.id}
                href={item.url ?? "#"}
                target={item.url ? "_blank" : undefined}
                rel="noreferrer"
                className="v1-card block p-4 hover:bg-[color:var(--v1-surface-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-[color:var(--v1-text)]">{item.title}</div>
                    {item.summary && (
                      <p className="mt-1 text-xs text-[color:var(--v1-muted)] line-clamp-2">{item.summary}</p>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--v1-muted)] shrink-0">
                    {item.source}
                    {item.published_at && <> · {new Date(item.published_at).toLocaleDateString()}</>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {tab === "By Category" && (
          <div className="space-y-6">
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--v1-muted)] mb-2">
                  {cat} ({items.length})
                </h3>
                <div className="space-y-1.5">
                  {items.map((i) => (
                    <div key={i.id} className="v1-card p-3 text-sm text-[color:var(--v1-text)]">
                      {i.title}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
