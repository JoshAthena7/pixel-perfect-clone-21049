import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addManualIntelEvent } from "@/lib/intel-events-manual.functions";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";
import { OracleIntakeModal } from "@/components/oracle/OracleIntakeModal";
import { listOracleSignalsForMission } from "@/lib/oracle-intel.functions";

const GOLD = "#C49A2B";
const PURPLE = "#a855f7";

type FilterId =
  | "all"
  | "signals"
  | "risks"
  | "research"
  | "competitive"
  | "stakeholder"
  | "lessons"
  | "regulatory";

const EVENT_FILTERS: { id: FilterId; label: string; color?: string }[] = [
  { id: "all", label: "All" },
  { id: "signals", label: "Signals" },
  { id: "risks", label: "Risks" },
  { id: "research", label: "Research" },
  { id: "competitive", label: "Competitive" },
  { id: "stakeholder", label: "Stakeholder" },
  { id: "lessons", label: "Lessons" },
  { id: "regulatory", label: "Regulatory", color: PURPLE },
];

const TYPE_COLORS: Record<string, string> = {
  signal: "#3b82f6",
  insight: "#8b5cf6",
  lesson: "#10b981",
  alert: "#f59e0b",
  risk: "#ef4444",
  risk_candidate: "#ef4444",
  opportunity: "#22c55e",
  intel_card_candidate: "#94a3b8",
  oracle_memory_candidate: "#10b981",
  extraction: "#64748b",
  amendment_change: "#f97316",
  competitive_update: "#ec4899",
  stakeholder_update: "#06b6d4",
  research_finding: "#a3e635",
  iris_seed: "#C49A2B",
};

function tabMatches(filter: FilterId, e: any): boolean {
  const ot = e.output_type as string | null;
  const cat = e.signal_category as string | null;
  const et = e.event_type as string | null;
  switch (filter) {
    case "all":
      return true;
    case "signals":
      return ot === "signal" || ot === "opportunity" || et === "signal";
    case "risks":
      return ot === "risk_candidate" || et === "risk";
    case "research":
      return (
        ot === "intel_card_candidate" ||
        (cat ? ["federal_policy", "state_policy", "waiver"].includes(cat) : false) ||
        et === "research_finding"
      );
    case "competitive":
      return (cat ? ["competitor", "market_movement"].includes(cat) : false) ||
        et === "competitive_update";
    case "stakeholder":
      return (cat
        ? ["stakeholder", "relationship_intelligence", "decision_intelligence"].includes(cat)
        : false) || et === "stakeholder_update";
    case "lessons":
      return ot === "oracle_memory_candidate" || et === "lesson";
    case "regulatory":
      return (
        (cat
          ? ["federal_policy", "state_policy", "waiver", "rates", "behavioral_health"].includes(cat)
          : false) || e.source_type === "atrium"
      );
    default:
      return false;
  }
}

/** Filter pills against oracle_signals shape. */
function oracleMatches(filter: FilterId, e: any): boolean {
  const cat = e.signal_category as string | null;
  const urgency = e.urgency as string | null;
  const ingestion = e.ingestion_source as string | null;
  const tags = (e.topic_tags ?? []) as string[];
  switch (filter) {
    case "all":
      return true;
    case "signals":
      return cat === "field_intelligence" || cat === "policy_innovation";
    case "risks":
      return urgency === "immediate" || urgency === "high" || cat === "competitive_landscape";
    case "research":
      return cat === "evidence_base";
    case "competitive":
      return cat === "competitive_landscape";
    case "stakeholder":
      return tags.includes("stakeholder") || cat === "field_intelligence";
    case "regulatory":
      return cat === "regulatory_federal" || cat === "regulatory_state";
    case "lessons":
      return ingestion === "rfp_extraction" || ingestion === "document_processing";
    default:
      return false;
  }
}

/** Format an oracle category enum as a readable pill label. */
function formatCategory(cat?: string | null): string | null {
  if (!cat) return null;
  const map: Record<string, string> = {
    regulatory_state: "Regulatory · State",
    regulatory_federal: "Regulatory · Federal",
    evidence_base: "Evidence Base",
    field_intelligence: "Field Intelligence",
    policy_innovation: "Policy Innovation",
    competitive_landscape: "Competitive",
    quality_performance: "Quality",
    health_outcomes_sdoh: "SDOH",
    client_content_map: "Client Content",
    stakeholder_communication: "Stakeholder",
  };
  return map[cat] ?? cat.replace(/_/g, " ");
}

export function IntelFeed({ missionId }: { missionId: string }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const seedTriedRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMissionIntelligence);

  const listOracleFn = useServerFn(listOracleSignalsForMission);

  const { data, isLoading } = useQuery({
    queryKey: ["intel-events", missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("intel_events")
        .select("*")
        .eq("mission_id", missionId)
        .neq("routing_status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: oracleData } = useQuery({
    queryKey: ["oracle-signals", missionId],
    queryFn: () => listOracleFn({ data: { missionId } }),
    staleTime: 30_000,
  });

  const events = useMemo(() => {
    const base = (data ?? []) as any[];
    const oracleRows = (oracleData ?? []) as any[];
    const mapped = oracleRows.map((s) => ({
      id: `oracle:${s.id}`,
      mission_id: s.mission_id ?? missionId,
      event_type: s.signal_type ?? "signal",
      title: s.title,
      content: s.what_happened ?? s.summary ?? "",
      generated_by: ["manual", "athena_bulk_upload", "athena_upload"].includes(s.ingestion_source)
        ? "human"
        : "iris",
      source_type: "oracle",
      source_name: s.source_name,
      source_url: (s.metadata as any)?.source_url ?? null,
      signal_category: s.category ?? null,
      urgency: s.urgency,
      relevance_score: s.relevance_score,
      ingestion_source: s.ingestion_source,
      status: s.status,
      topic_tags: s.topic_tags ?? [],
      created_at: s.created_at,
      __oracle: true,
      __tier: s.tier,
    }));
    const seen = new Set(base.map((e) => e.id));
    const merged = [...base, ...mapped.filter((m) => !seen.has(m.id))];
    // Dedupe by title similarity (simple equality on normalized title)
    const titleSeen = new Map<string, any>();
    for (const item of merged) {
      const key = String(item.title ?? "").trim().toLowerCase();
      if (!titleSeen.has(key)) titleSeen.set(key, item);
      else if (item.__oracle && !titleSeen.get(key).__oracle) titleSeen.set(key, item);
    }
    const deduped = Array.from(titleSeen.values());
    deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return deduped;
  }, [data, oracleData, missionId]);

  const oracleEmpty = (oracleData ?? []).length === 0;

  // Fire-and-forget first-pass IRIS seed when the feed is empty.
  useEffect(() => {
    if (isLoading) return;
    if (events.length > 0) return;
    if (seedTriedRef.current.has(missionId)) return;
    seedTriedRef.current.add(missionId);
    setSeeding(true);
    (async () => {
      try {
        const res = await seedFn({ data: { missionId } });
        if (res?.inserted && res.inserted > 0) {
          qc.invalidateQueries({ queryKey: ["intel-events", missionId] });
          qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
        } else if (!res?.ok) {
          console.log("[intel-feed] iris seed skipped", res);
        }
      } catch (e) {
        console.log("[intel-feed] iris seed failed", e);
      } finally {
        setSeeding(false);
      }
    })();
  }, [isLoading, events.length, missionId, seedFn, qc]);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    // When a non-all filter is active, hide legacy items per spec.
    return events.filter((e) => e.__oracle && oracleMatches(filter, e));
  }, [events, filter]);

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400 * 1000;
    const recent = events.filter((e) => new Date(e.created_at).getTime() > week).length;
    const irisSources = new Set(["automated_feed", "rfp_extraction", "document_processing", "iris_generated"]);
    const humanSources = new Set(["manual", "athena_bulk_upload", "athena_upload"]);
    const iris = events.filter((e) =>
      e.__oracle ? irisSources.has(e.ingestion_source) : e.generated_by === "iris",
    ).length;
    const human = events.filter((e) =>
      e.__oracle ? humanSources.has(e.ingestion_source) : e.generated_by === "human",
    ).length;
    return { total: events.length, recent, iris, human };
  }, [events]);


  return (
    <div className="space-y-4">
      {oracleEmpty && !isLoading && (
        <div
          className="rounded-lg px-4 py-2 text-xs flex items-center justify-between gap-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
        >
          <span>
            Showing legacy intelligence. Load mission documents in the Setup Wizard to activate ORACLE briefings.
          </span>
          <a
            href={`/missions/${missionId}/setup?step=1`}
            className="shrink-0 underline"
            style={{ color: GOLD }}
          >
            Open Setup Wizard →
          </a>
        </div>
      )}
      {seeding && (
        <div
          className="rounded-lg px-4 py-3 flex items-center gap-3"
          style={{
            background: "rgba(196,154,43,0.06)",
            border: "1px solid rgba(196,154,43,0.25)",
          }}
        >
          <Eye className="h-4 w-4" style={{ color: GOLD }} />
          <div className="flex-1">
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>IRIS</div>
            <div className="text-xs text-white/70 mt-0.5">
              Running first-pass intelligence analysis on this mission…
            </div>
            <div
              className="mt-2 h-0.5 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(196,154,43,0.12)" }}
            >
              <div
                className="h-full"
                style={{
                  width: "40%",
                  background: GOLD,
                  animation: "iris-seed-progress 1.6s ease-in-out infinite",
                }}
              />
            </div>
          </div>
          <style>{`@keyframes iris-seed-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}</style>
        </div>
      )}

      <div
        className="rounded-lg px-4 py-3 flex flex-wrap gap-6 items-center"
        style={{ background: "rgba(5,13,24,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Stat label="Total Events" value={stats.total} />
        <Stat label="This Week" value={stats.recent} />
        <Stat label="IRIS Generated" value={stats.iris} />
        <Stat label="Human Added" value={stats.human} />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={async () => {
              if (seeding) return;
              setSeeding(true);
              try {
                const res = await seedFn({ data: { missionId, force: true } });
                if (res?.inserted || (res as any)?.cascadeInserted) {
                  toast.success(
                    `IRIS generated ${res?.inserted ?? 0} + ${(res as any)?.cascadeInserted ?? 0} cascade events`,
                  );
                } else {
                  toast.message("IRIS refresh complete");
                }
                qc.invalidateQueries({ queryKey: ["intel-events", missionId] });
                qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
              } catch (e) {
                console.log("[intel-feed] refresh failed", e);
                toast.error("IRIS refresh failed");
              } finally {
                setSeeding(false);
              }
            }}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-full transition-colors disabled:opacity-50"
            style={{
              padding: "5px 12px",
              fontSize: 11,
              color: GOLD,
              background: "rgba(196,154,43,0.1)",
              border: "0.5px solid rgba(196,154,43,0.3)",
            }}
          >
            {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh IRIS
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full transition-colors"
            style={{
              padding: "5px 12px",
              fontSize: 11,
              color: GOLD,
              background: "rgba(196,154,43,0.1)",
              border: "0.5px solid rgba(196,154,43,0.3)",
            }}
          >
            <Plus className="h-3 w-3" /> Add Single Item
          </button>
        </div>

      </div>

      <div className="flex flex-wrap gap-2">
        {EVENT_FILTERS.map((t) => {
          const active = filter === t.id;
          const accent = t.color ?? GOLD;
          return (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className="rounded-full transition-colors"
              style={{
                padding: "4px 12px",
                fontSize: 11,
                color: active ? accent : t.color ?? "rgba(255,255,255,0.5)",
                background: active
                  ? `${accent}22`
                  : t.color
                    ? `${accent}10`
                    : "transparent",
                border: `0.5px solid ${active ? `${accent}55` : t.color ? `${accent}30` : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      <OracleIntakeModal
        missionId={missionId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  const color = TYPE_COLORS[event.event_type] || "#64748b";
  const isAtrium = event.source_type === "atrium";
  const isOracle = event.source_type === "oracle" || event.__oracle === true;
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(5,13,24,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start gap-3">
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "2px 8px",
            borderRadius: 4,
            background: `${color}22`,
            color,
            border: `1px solid ${color}55`,
            whiteSpace: "nowrap",
          }}
        >
          {String(event.event_type).replace(/_/g, " ")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white font-medium">{event.title}</div>
          <div className="text-xs text-white/60 mt-1 line-clamp-3">{event.content}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isOracle && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${GOLD}22`,
                  color: GOLD,
                  border: `1px solid ${GOLD}66`,
                }}
              >
                ORACLE{event.__tier ? ` · ${String(event.__tier).toUpperCase()}` : ""}
              </span>
            )}
            {isAtrium && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${PURPLE}22`,
                  color: PURPLE,
                  border: `1px solid ${PURPLE}55`,
                }}
              >
                Regulatory
              </span>
            )}
            {event.confidence && (
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {String(event.confidence).toUpperCase()}
              </span>
            )}
            {event.generated_by === "iris" && (
              <span style={{ fontSize: 9, color: GOLD }}>● IRIS</span>
            )}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              {new Date(event.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg py-12 text-center"
      style={{ background: "rgba(5,13,24,0.4)", border: "1px dashed rgba(255,255,255,0.1)" }}
    >
      <div className="text-sm text-white/60">No intelligence events yet.</div>
      <div className="text-xs text-white/35 mt-1">
        Run Full IRIS Analysis to generate events from RFP, threads, and sources.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: GOLD, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

type SourceOpt = {
  value: "atrium" | "manual" | "document" | "external";
  label: string;
};

const SOURCE_OPTIONS: SourceOpt[] = [
  { value: "manual", label: "Manual Note" },
  { value: "atrium", label: "Regulatory / Policy" },
  { value: "document", label: "Document" },
  { value: "external", label: "External Source" },
];

const EVENT_TYPE_OPTIONS = [
  "signal",
  "risk",
  "research_finding",
  "competitive_update",
  "stakeholder_update",
  "lesson",
  "manual",
];

function AddIntelDialog({
  missionId,
  open,
  onOpenChange,
}: {
  missionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addManualIntelEvent);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<SourceOpt["value"]>("manual");
  const [eventType, setEventType] = useState<string>("manual");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | "">("");

  const reset = () => {
    setTitle("");
    setContent("");
    setSourceType("manual");
    setEventType("manual");
    setConfidence("");
  };

  const mutation = useMutation({
    mutationFn: async () =>
      addFn({
        data: {
          mission_id: missionId,
          title: title.trim(),
          content: content.trim(),
          source_type: sourceType,
          event_type: eventType,
          confidence: confidence || null,
        },
      }),
    onSuccess: () => {
      toast.success("Intel added to Feed");
      qc.invalidateQueries({ queryKey: ["intel-events", missionId] });
      qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => {
      console.error("[intel-feed] add failed", e);
      toast.error("Could not add intel");
    },
  });

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Single Item</DialogTitle>
          <DialogDescription>
            Add an entry to the Intelligence Feed for this mission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="intel-title">Title</Label>
            <Input
              id="intel-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intel-content">Content</Label>
            <Textarea
              id="intel-content"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's the intel?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceOpt["value"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Confidence (optional)</Label>
            <Select value={confidence || "none"} onValueChange={(v) => setConfidence(v === "none" ? "" : (v as any))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Add to Feed"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
