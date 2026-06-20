/**
 * Feed ATLAS — State Pack tab. Admin-only.
 *
 * Read-only summary of the state intelligence pack for this mission's state.
 * Links into /admin/state-intel (passing ?from_mission= so the admin page can
 * render a return banner).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C49A2B";

const STATE_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "DC",
};

export function StatePackTab({ missionId }: { missionId: string }) {
  const { data: mission } = useQuery({
    queryKey: ["feed-atlas-mission-state", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, state_code")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const stateCode = mission?.state_code ?? null;
  const stateName = stateCode ? STATE_NAME[stateCode.toUpperCase()] ?? stateCode : null;

  const { data, isLoading } = useQuery({
    queryKey: ["feed-atlas-state-pack", stateCode],
    enabled: !!stateCode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oracle_signals")
        .select("id, title, category, signal_type, relevance_score, updated_at")
        .eq("tier", "state")
        .eq("state_code", stateCode!)
        .order("relevance_score", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  if (!stateCode) {
    return (
      <div className="text-[12px] text-white/50 py-6 text-center">
        This mission has no state code assigned.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-[12px] text-white/40 py-6 text-center">Loading state pack…</div>;
  }

  const items = data ?? [];
  const lastReviewed = items
    .map((i) => i.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-[12px] text-white/65">
          No state intelligence pack for <span style={{ color: GOLD }}>{stateName}</span> yet.
        </div>
        <a
          href={`/admin/state-intel?from_mission=${missionId}&state=${stateCode}`}
          className="inline-flex items-center gap-2 rounded"
          style={{
            background: GOLD,
            color: "#000",
            fontWeight: 600,
            fontSize: 11,
            padding: "8px 16px",
            borderRadius: 4,
          }}
        >
          Create State Pack <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[12px] text-white">
            <span style={{ color: GOLD, fontWeight: 600 }}>{stateName}</span> Intelligence Pack
          </div>
          <div className="text-[11px] text-white/45 mt-0.5">
            {items.length} item{items.length === 1 ? "" : "s"}
            {lastReviewed ? ` · Last reviewed ${new Date(lastReviewed).toLocaleDateString()}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            // Trigger an admin re-scrape in the next step; for now invalidate the cache.
            window.location.reload();
          }}
          className="inline-flex items-center gap-1.5 rounded"
          style={{
            background: "rgba(196,154,43,0.1)",
            color: GOLD,
            border: "0.5px solid rgba(196,154,43,0.3)",
            fontSize: 10,
            padding: "5px 10px",
          }}
          title="Refresh state pack"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
        {items.map((it) => (
          <div
            key={it.id}
            className="rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-white/90 truncate" title={it.title}>{it.title}</div>
              <div className="text-[11px] text-white/40">
                {(it.category ?? it.signal_type ?? "—").toString().replace(/_/g, " ")}
              </div>
            </div>
            <div className="shrink-0 text-[11px]" style={{ color: GOLD }}>
              {it.relevance_score ?? 0}
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/admin/state-intel"
        search={{ from_mission: missionId } as any}
        className="inline-flex items-center gap-1 text-[12px] hover:underline"
        style={{ color: GOLD }}
      >
        Manage all state packs <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
