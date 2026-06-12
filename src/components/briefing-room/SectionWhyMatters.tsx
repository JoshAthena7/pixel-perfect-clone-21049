import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { getWhyMatters } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";

function preview(s: string | null | undefined, n = 110): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

function Row({ label, body }: { label: string; body: string | null }) {
  const [open, setOpen] = useState(false);
  const text = (body ?? "").trim();
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-3 py-2.5 text-left hover:bg-white/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{label}</div>
        </div>
        <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
          <div className="truncate" style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
            {text ? preview(text) : <span style={{ fontStyle: "italic" }}>Not yet set</span>}
          </div>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform"
            style={{ color: "#C49A2B", transform: open ? "rotate(90deg)" : "none" }}
          />
        </div>
      </button>
      {open && (
        <div
          className="px-3 pb-3 pt-1 whitespace-pre-line"
          style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.6 }}
        >
          {text || (
            <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
              Will be added in Olympus.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function SectionWhyMatters({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getWhyMatters);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "why", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  return (
    <SectionCard
      title="Why This Mission Matters"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=3`}
    >
      <div className="space-y-2">
        <Row label="Why the client is pursuing it" body={data.whyClientPursuing} />
        <Row label="Why it matters to Athena" body={data.whyMattersToAthena} />
        <Row label="What is at stake" body={data.whatIsAtStake} />
        <Row label="Key market dynamics" body={data.keyMarketDynamics} />
      </div>
    </SectionCard>
  );
}
