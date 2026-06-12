import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, EmptyState, SkeletonList, OlympusLink } from "./OracleShared";
import { runIrisSweep } from "@/lib/iris-sweep.functions";
import type { Database } from "@/integrations/supabase/types";

type FeedItem = Database["public"]["Tables"]["intelligence_feed_items"]["Row"];

const CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "federal_policy", label: "Federal Policy" },
  { id: "state_policy", label: "State Policy" },
  { id: "legislative", label: "Legislation" },
  { id: "stakeholder", label: "Stakeholder" },
  { id: "research", label: "Research" },
  { id: "competitive", label: "Competitor" },
  { id: "procurement", label: "Procurement" },
  { id: "regulatory", label: "Regulatory" },
  { id: "mission_risk", label: "Mission Risk" },
];

const CATEGORY_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  federal_policy: { bg: "rgba(224,74,74,0.12)", fg: "#f08080", border: "rgba(224,74,74,0.3)" },
  state_policy: { bg: "rgba(224,128,74,0.12)", fg: "#f0a070", border: "rgba(224,128,74,0.3)" },
  legislative: { bg: "rgba(125,207,125,0.12)", fg: "#7DCF7D", border: "rgba(125,207,125,0.3)" },
  stakeholder: { bg: "rgba(140,130,230,0.12)", fg: "#a39adf", border: "rgba(140,130,230,0.3)" },
  research: { bg: "rgba(123,167,212,0.12)", fg: "#7BA7D4", border: "rgba(123,167,212,0.3)" },
  competitive: { bg: "rgba(239,159,39,0.12)", fg: "#EF9F27", border: "rgba(239,159,39,0.3)" },
  procurement: { bg: "rgba(196,154,43,0.12)", fg: "#C49A2B", border: "rgba(196,154,43,0.3)" },
  regulatory: { bg: "rgba(239,191,39,0.12)", fg: "#EFBF27", border: "rgba(239,191,39,0.3)" },
  mission_risk: { bg: "rgba(224,74,74,0.15)", fg: "#f08080", border: "rgba(224,74,74,0.4)" },
};

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export function OracleFeed({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const sweepFn = useServerFn(runIrisSweep);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-feed", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intelligence_feed_items")
        .select("*")
        .eq("mission_id", missionId)
        .eq("is_dismissed", false)
        .order("iris_relevance_score", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
    staleTime: 60_000,
  });

  const sweep = useMutation({
    mutationFn: () => sweepFn({ data: { missionId } }),
    onSuccess: (r) => {
      toast.success(`IRIS sweep complete — ${r.inserted} items added`);
      if (r.failures.length) toast.warning(`${r.failures.length} category(ies) had issues`);
      qc.invalidateQueries({ queryKey: ["oracle-ro-feed", missionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "IRIS sweep failed"),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (q && !`${i.headline} ${i.iris_assessment ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, category, search]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search feed…"
        className="h-8 max-w-md"
        style={{ fontSize: 12 }}
      />
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {CATEGORIES.map((c) => {
          const isActive = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className="rounded-full transition-colors whitespace-nowrap"
              style={{
                padding: "3px 10px",
                fontSize: 11,
                color: isActive ? "#C49A2B" : "rgba(255,255,255,0.45)",
                background: isActive ? "rgba(196,154,43,0.12)" : "transparent",
                border: `0.5px solid ${isActive ? "rgba(196,154,43,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => sweep.mutate()}
            disabled={sweep.isPending}
            className="inline-flex items-center gap-1.5 rounded transition-colors disabled:opacity-50"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              color: "#C49A2B",
              background: "rgba(196,154,43,0.10)",
              border: "1px solid rgba(196,154,43,0.35)",
            }}
            title="Ask IRIS to research Legislation, Stakeholder, Competitor, Procurement, and Regulatory items for this mission"
          >
            {sweep.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {sweep.isPending ? "IRIS is researching…" : "Run IRIS Sweep"}
          </button>
          <OlympusLink>Manage sources in Olympus →</OlympusLink>
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <EmptyState>
          {data && data.length === 0
            ? "IRIS is monitoring sources. Intelligence items will appear here as they become relevant to this mission."
            : "No items match this filter."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <FeedCard key={i.id} item={i} />
          ))}
        </div>
      )}

      <div className="italic text-center pt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        IRIS monitors continuously. Sources and feeds configured in Olympus.
      </div>
    </div>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const rel = item.iris_relevance_score ?? 0;
  const cat = CATEGORY_COLOR[item.category] ?? { bg: "rgba(255,255,255,0.04)", fg: "rgba(255,255,255,0.6)", border: "rgba(255,255,255,0.1)" };
  const tone =
    rel >= 85
      ? { bg: "rgba(224,74,74,0.05)", border: "rgba(224,74,74,0.25)" }
      : rel >= 70
        ? { bg: "rgba(74,111,165,0.05)", border: "rgba(74,111,165,0.2)" }
        : { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.07)" };

  const onAsk = () => {
    window.dispatchEvent(
      new CustomEvent("atlas:iris:prefill", {
        detail: `Tell me more about: ${item.headline} — and how it affects this mission.`,
      }),
    );
  };

  return (
    <div className="rounded-lg p-3" style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded"
            style={{
              padding: "2px 8px",
              fontSize: 10,
              background: cat.bg,
              color: cat.fg,
              border: `0.5px solid ${cat.border}`,
            }}
          >
            {CAT_LABEL[item.category] ?? item.category}
          </span>
          {rel >= 60 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: cat.fg }}>{rel}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          {item.published_at ? formatDistanceToNow(new Date(item.published_at), { addSuffix: true }) : ""}
        </span>
      </div>

      <div className="mt-2 text-white" style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>
        {item.source_url ? (
          <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
            {item.headline}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        ) : (
          item.headline
        )}
      </div>

      {item.iris_assessment && (
        <p className="italic mt-1.5" style={{ fontSize: 10, lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>
          <span style={{ color: "rgba(140,130,230,0.9)", fontWeight: 500, fontStyle: "normal" }}>IRIS: </span>
          {item.iris_assessment}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {(item.affected_section_ids ?? []).slice(0, 4).map((s, idx) => (
            <span
              key={`${s}-${idx}`}
              style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.5)",
                border: "0.5px solid rgba(255,255,255,0.08)",
              }}
            >
              Affects Section {idx + 1}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onAsk}
          className="rounded"
          style={{
            padding: "3px 10px",
            fontSize: 10,
            color: "rgba(200,195,255,0.9)",
            background: "rgba(127,119,221,0.12)",
            border: "1px solid rgba(127,119,221,0.3)",
          }}
        >
          Ask IRIS →
        </button>
      </div>
    </div>
  );
}
