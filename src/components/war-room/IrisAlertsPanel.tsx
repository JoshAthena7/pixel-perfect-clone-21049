import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Zap, RefreshCw, AlertTriangle, Info, LifeBuoy } from "lucide-react";
import { generateIrisAlerts, type IrisAlert } from "@/lib/iris-alerts.functions";
import { AlertsSkeleton, IrisHealthyCard, IrisOrientingCard } from "./AtcEmptyStates";
import { supabase } from "@/integrations/supabase/client";
import { AssignSmeModal } from "./AssignSmeModal";
import { UnansweredNotesSection } from "./UnansweredNotesSection";

function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const GOLD = "#c9a84c";

export function IrisAlertsPanel({ missionId, bare = false, onCountChange, missionTooNew = false }: { missionId: string; bare?: boolean; onCountChange?: (n: number) => void; missionTooNew?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fn = useServerFn(generateIrisAlerts);
  const [assignFor, setAssignFor] = useState<{ qid: string; qNum: string } | null>(null);

  const q = useQuery({
    queryKey: ["iris-alerts", missionId],
    queryFn: () => fn({ data: { missionId } }),
    refetchInterval: 15 * 60_000,
    staleTime: 60_000,
  });

  // Deterministic SOS alerts — anything with sos_raised and no later sos_acknowledged
  const sosQ = useQuery({
    queryKey: ["war-room-sos", missionId],
    queryFn: async () => {
      const [{ data: events }, { data: questions }] = await Promise.all([
        supabase
          .from("mission_assist_events")
          .select("question_id, event_type, user_id, created_at, metadata")
          .eq("mission_id", missionId)
          .in("event_type", ["sos_raised", "sos_acknowledged"])
          .order("created_at", { ascending: true }),
        supabase
          .from("mission_questions")
          .select("id, question_number, question_text")
          .eq("mission_id", missionId),
      ]);
      const lastByQid = new Map<string, any>();
      for (const ev of (events ?? []) as any[]) {
        if (!ev.question_id) continue;
        lastByQid.set(ev.question_id, ev);
      }
      const qMap = new Map<string, any>((questions ?? []).map((qq: any) => [qq.id, qq]));
      const writerIds = Array.from(new Set(
        Array.from(lastByQid.values())
          .filter((ev) => ev.event_type === "sos_raised")
          .map((ev) => ev.user_id)
          .filter(Boolean),
      ));
      const { data: profs } = writerIds.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", writerIds as string[])
        : { data: [] as any[] };
      const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
      const out: { qid: string; qNum: string; qText: string; writerName: string }[] = [];
      lastByQid.forEach((ev, qid) => {
        if (ev.event_type !== "sos_raised") return;
        const qq = qMap.get(qid);
        if (!qq) return;
        const p = profMap.get(ev.user_id);
        out.push({
          qid,
          qNum: String(qq.question_number ?? "?"),
          qText: String(qq.question_text ?? "").slice(0, 50),
          writerName: p?.display_name || p?.email?.split("@")[0] || "A writer",
        });
      });
      return out;
    },
    refetchInterval: 60_000,
  });

  const handleAction = (target: string) => {
    if (target === "flight_deck" || target === "checkin") {
      navigate({ to: "/missions/$missionId/flight-deck", params: { missionId } });
      return;
    }
    if (target.startsWith("question:")) {
      const id = target.slice("question:".length);
      navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: id });
      return;
    }
    if (target.startsWith("writer:")) {
      const id = target.slice("writer:".length);
      // Dispatch a custom event the Team Pulse panel listens to (lightweight,
      // avoids prop-drilling refs across the WarRoomPage layout).
      window.dispatchEvent(new CustomEvent("atc:highlight-writer", { detail: { writerId: id } }));
      return;
    }
    navigate({ to: "/missions/$missionId/flight-deck", params: { missionId } });
  };

  const isRefreshing = q.isFetching;
  const alerts = q.data?.alerts ?? [];
  const sosAlerts = sosQ.data ?? [];
  const errMsg = q.data?.error ?? (q.error ? (q.error as Error).message : null);

  if (onCountChange) {
    // best-effort: notify parent of alert count for header chip
    queueMicrotask(() => onCountChange(alerts.length + sosAlerts.length));
  }

  const body = (
    <>
      <UnansweredNotesSection missionId={missionId} />
      {sosAlerts.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {sosAlerts.map((s) => (
            <li
              key={s.qid}
              className={bare ? "py-2.5 px-3 hover:bg-white/[0.02]" : "rounded border border-white/10 bg-red-500/[0.05] p-3"}
              style={{ borderLeft: "3px solid #ef4444" }}
            >
              <div className="flex items-start gap-2">
                <LifeBuoy className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-white/90 leading-snug">
                    <span className="font-semibold">{s.writerName}</span> needs an SME on{" "}
                    <span style={{ color: GOLD }}>Q{s.qNum}</span> — {s.qText}
                  </div>
                  <div className="mt-1.5">
                    <button
                      onClick={() => setAssignFor({ qid: s.qid, qNum: s.qNum })}
                      className="text-[11px] font-medium hover:underline text-red-400"
                    >
                      Assign SME →
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.isLoading ? (
        <AlertsSkeleton count={3} />
      ) : errMsg && alerts.length === 0 ? (
        <div className="rounded bg-white/[0.02] p-3 text-xs text-white/55 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
          <span>IRIS could not generate alerts right now. Check back shortly.</span>
        </div>
      ) : alerts.length === 0 && sosAlerts.length === 0 && missionTooNew ? (
        <IrisOrientingCard />
      ) : alerts.length === 0 && sosAlerts.length === 0 ? (
        <IrisHealthyCard generatedAt={q.data?.generatedAt} />
      ) : alerts.length === 0 ? null : (
        <ul className="space-y-1.5">
          {alerts.map((a: IrisAlert, i: number) => (
            <AlertCard
              key={i}
              alert={a}
              onAction={() => handleAction(a.action_target)}
              generatedAt={q.data?.generatedAt}
              bare={bare}
            />
          ))}
        </ul>
      )}
      {assignFor && (
        <AssignSmeModal
          missionId={missionId}
          questionId={assignFor.qid}
          questionNumber={assignFor.qNum}
          onClose={() => setAssignFor(null)}
        />
      )}
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.04] bg-[#050d18] sticky top-0 z-[1]">
          <span className="text-[10px] text-white/35">
            {q.data?.generatedAt ? `Updated ${relTime(q.data.generatedAt)}` : "—"}
          </span>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["iris-alerts", missionId] })}
            disabled={isRefreshing}
            className="p-1 rounded hover:bg-white/5 disabled:opacity-40"
            title="Refresh alerts"
          >
            <RefreshCw className={`w-3 h-3 text-white/55 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{body}</div>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.015] p-4">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-[13px] font-semibold text-white">IRIS Alerts</h2>
          {isRefreshing && q.isFetched && (
            <span className="text-[10px] text-white/45">Refreshing…</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-white/35">
            {q.data?.generatedAt ? `Updated ${relTime(q.data.generatedAt)}` : "—"}
          </span>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["iris-alerts", missionId] })}
            disabled={isRefreshing}
            className="p-1 rounded hover:bg-white/5 disabled:opacity-40"
            title="Refresh alerts"
          >
            <RefreshCw className={`w-3 h-3 text-white/55 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>
      {body}
    </section>
  );
}


function AlertCard({
  alert, onAction, generatedAt, bare = false,
}: { alert: IrisAlert; onAction: () => void; generatedAt?: string; bare?: boolean }) {
  const urg = alert.urgency;
  const color =
    urg === "critical" ? "#ef4444" :
    urg === "warning" ? "#f59e0b" : "#3b82f6";
  const Icon =
    urg === "critical" ? AlertTriangle :
    urg === "warning" ? AlertTriangle : Info;

  return (
    <li
      className={bare ? "py-2.5 px-3 hover:bg-white/[0.02]" : "rounded border border-white/10 bg-white/[0.02] p-3 pl-3"}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-white/90 leading-snug">{alert.text}</div>
          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={onAction}
              className="text-[11px] font-medium hover:underline"
              style={{ color }}
            >
              {alert.action_label} →
            </button>
            <span className="text-[10px] text-white/35 ml-auto">{relTime(generatedAt)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
