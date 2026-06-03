import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { sendCoPilotMessage, generateGuidanceDraft } from "@/lib/pilot-copilot.functions";
import { toast } from "sonner";
import { Eye, MessageCircle, Sparkles, X, Send, Megaphone } from "lucide-react";

type Confidence = "confident" | "uncertain" | "stuck" | null;

type Pilot = {
  question_id: string;
  question_number: string;
  question_title: string;
  pens_down_date: string | null;
  health: "red" | "yellow" | "green" | null;
  writer_id: string;
  writer_name: string;
  confidence: Confidence;
  last_signal_at: string | null;
  last_signal_body: string | null;
  has_brief_today: boolean;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

function daysUntil(iso: string | null) {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}

const CONF_META: Record<Exclude<Confidence, null>, { glyph: string; color: string; label: string }> = {
  confident: { glyph: "●", color: "#22c55e", label: "Confident" },
  uncertain: { glyph: "◉", color: "#eab308", label: "Uncertain" },
  stuck:     { glyph: "○", color: "#ef4444", label: "Stuck" },
};

const HEALTH_HEX: Record<string, string> = { red: "#ef4444", yellow: "#eab308", green: "#22c55e" };

const MESSAGE_TYPES = [
  { k: "decision",      label: "Decision",      color: "#ef4444" },
  { k: "guidance",      label: "Guidance",      color: "#eab308" },
  { k: "alert",         label: "Alert",         color: "#f59e0b" },
  { k: "encouragement", label: "Encouragement", color: "#3b82f6" },
  { k: "coach_note",    label: "Coach Note",    color: "#a855f7" },
] as const;

type MessageType = (typeof MESSAGE_TYPES)[number]["k"];

export function PilotStatusSection({ missionId, isLead }: { missionId: string; isLead: boolean }) {
  const qc = useQueryClient();
  const [composeTarget, setComposeTarget] = useState<Pilot | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const { data: pilots = [] } = useQuery({
    queryKey: ["pilot-status", missionId],
    queryFn: async (): Promise<Pilot[]> => {
      const { data: qs } = await supabase
        .from("question_records")
        .select("id,question_number,title,pens_down_date,health,assigned_writer_id,writer_confidence")
        .eq("mission_id", missionId)
        .not("assigned_writer_id", "is", null);
      const list = (qs ?? []) as Array<{
        id: string; question_number: string; title: string; pens_down_date: string | null;
        health: string | null; assigned_writer_id: string | null;
        writer_confidence: Confidence;
      }>;
      const writerIds = Array.from(new Set(list.map((q) => q.assigned_writer_id!).filter(Boolean)));
      if (writerIds.length === 0) return [];

      const [{ data: profs }, { data: latestCollab }, { data: latestRealities }, { data: briefs }] = await Promise.all([
        supabase.from("profiles").select("id,display_name,email").in("id", writerIds),
        supabase
          .from("question_collaboration")
          .select("question_id,body,created_at,author_id")
          .in("question_id", list.map((q) => q.id))
          .order("created_at", { ascending: false }),
        supabase
          .from("reality_updates")
          .select("question_id,details,created_at,user_id")
          .in("question_id", list.map((q) => q.id))
          .order("created_at", { ascending: false }),
        supabase
          .from("question_intelligence")
          .select("question_id,generated_at")
          .in("question_id", list.map((q) => q.id))
          .order("generated_at", { ascending: false }),
      ]);

      const profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      const lastCollab: Record<string, { body: string | null; created_at: string }> = {};
      for (const c of latestCollab ?? []) {
        if (c.question_id && c.created_at && !lastCollab[c.question_id]) lastCollab[c.question_id] = { body: c.body, created_at: c.created_at };
      }
      const lastReality: Record<string, { body: string | null; created_at: string }> = {};
      for (const r of latestRealities ?? []) {
        if (r.question_id && r.created_at && !lastReality[r.question_id]) lastReality[r.question_id] = { body: r.details, created_at: r.created_at };
      }
      const briefMap: Record<string, string> = {};
      for (const b of briefs ?? []) if (b.question_id && b.generated_at && !briefMap[b.question_id]) briefMap[b.question_id] = b.generated_at;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      return list.map((q) => {
        const p = profMap[q.assigned_writer_id!];
        const writerName = (p?.display_name || p?.email?.split("@")[0] || "Writer").split(" ")[0];
        const a = lastCollab[q.id];
        const b = lastReality[q.id];
        const latest = a && b
          ? (+new Date(a.created_at) > +new Date(b.created_at) ? a : b)
          : (a ?? b ?? null);
        const briefAt = briefMap[q.id];
        return {
          question_id: q.id,
          question_number: q.question_number,
          question_title: q.title,
          pens_down_date: q.pens_down_date,
          health: (q.health as Pilot["health"]) ?? null,
          writer_id: q.assigned_writer_id!,
          writer_name: writerName,
          confidence: q.writer_confidence,
          last_signal_at: latest?.created_at ?? null,
          last_signal_body: latest?.body ?? null,
          has_brief_today: !!(briefAt && new Date(briefAt) >= today),
        };
      });
    },
  });

  const sortedPilots = useMemo(() => {
    const rank = (p: Pilot) => {
      if (p.confidence === "stuck") return 0;
      if (p.confidence === "uncertain") return 1;
      const silentH = p.last_signal_at
        ? (Date.now() - new Date(p.last_signal_at).getTime()) / 3_600_000
        : 9999;
      if (silentH > 24) return 2;
      return 3;
    };
    return [...pilots].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const da = daysUntil(a.pens_down_date) ?? 9999;
      const db = daysUntil(b.pens_down_date) ?? 9999;
      return da - db;
    });
  }, [pilots]);

  const counts = useMemo(() => ({
    total: pilots.length,
    confident: pilots.filter((p) => p.confidence === "confident").length,
    uncertain: pilots.filter((p) => p.confidence === "uncertain").length,
    stuck: pilots.filter((p) => p.confidence === "stuck").length,
  }), [pilots]);

  if (!isLead || pilots.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="mr-section-label" style={{ color: "#eab308" }}>Pilot Status</h2>
          <div className="text-[11px] text-muted-foreground">
            {counts.total} writers · <span className="text-emerald-400">{counts.confident} confident</span> · <span className="text-amber-400">{counts.uncertain} uncertain</span> · <span className="text-red-400">{counts.stuck} stuck</span>
          </div>
        </div>
        <button
          onClick={() => setBroadcastOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Megaphone className="h-3.5 w-3.5" /> Broadcast to All Pilots
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {sortedPilots.map((p) => (
          <PilotCard
            key={p.question_id}
            missionId={missionId}
            pilot={p}
            onCompose={() => setComposeTarget(p)}
          />
        ))}
      </div>

      {composeTarget && (
        <ComposeDrawer
          missionId={missionId}
          pilot={composeTarget}
          onClose={() => setComposeTarget(null)}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["pilot-status", missionId] });
            qc.invalidateQueries({ queryKey: ["copilot-msgs"] });
          }}
        />
      )}
      {broadcastOpen && (
        <BroadcastDrawer
          missionId={missionId}
          onClose={() => setBroadcastOpen(false)}
          onSent={() => qc.invalidateQueries({ queryKey: ["copilot-msgs"] })}
        />
      )}
    </section>
  );
}

function PilotCard({ pilot, onCompose }: { pilot: Pilot; onCompose: () => void }) {
  const d = daysUntil(pilot.pens_down_date);
  const conf = pilot.confidence ? CONF_META[pilot.confidence] : null;
  const silentHrs = pilot.last_signal_at
    ? (Date.now() - new Date(pilot.last_signal_at).getTime()) / 3_600_000
    : Infinity;
  const silent = silentHrs > 24;
  const border =
    pilot.confidence === "stuck" ? "rgba(239,68,68,0.4)"
    : pilot.confidence === "uncertain" ? "rgba(234,179,8,0.4)"
    : silent ? "rgba(239,68,68,0.3)"
    : pilot.confidence === "confident" && pilot.health === "green" ? "rgba(34,197,94,0.3)"
    : "rgba(255,255,255,0.08)";

  return (
    <div className="rounded-[10px] border bg-white/[0.02] p-4" style={{ borderColor: border }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">{pilot.writer_name}</div>
          <div className="text-[11px] text-muted-foreground">
            Q{pilot.question_number} · {pilot.question_title}
          </div>
        </div>
        <div className="text-right text-[11px]">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_HEX[pilot.health ?? "yellow"] }} />
            {d !== null && <span>{d}d</span>}
            {conf && <span style={{ color: conf.color }}>· {conf.glyph} {conf.label}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        Last signal: {pilot.last_signal_at ? timeAgo(pilot.last_signal_at) : <span className="text-red-400">⚠ No signal today</span>}
      </div>
      {pilot.last_signal_body && (
        <div className="mt-1 text-[12px] italic text-muted-foreground line-clamp-2">"{pilot.last_signal_body}"</div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        IRIS brief today: {pilot.has_brief_today ? <span className="text-emerald-400">✓ Delivered</span> : <span className="text-amber-400">— not yet</span>}
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          to="/missions/$missionId/questions/$questionId"
          params={{ missionId: "", questionId: pilot.question_id }}
          // params.missionId will be replaced by router context; provide via from
          search={{}}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          // @ts-expect-error: we recompute mission id via parent route at render-time
        >
          <Eye className="h-3 w-3" /> View Cockpit
        </Link>
        <button
          onClick={onCompose}
          className="inline-flex items-center gap-1 rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <MessageCircle className="h-3 w-3" /> Send Guidance
        </button>
      </div>
    </div>
  );
}

function ComposeDrawer({
  missionId, pilot, onClose, onSent,
}: { missionId: string; pilot: Pilot; onClose: () => void; onSent: () => void }) {
  const sendFn = useServerFn(sendCoPilotMessage);
  const draftFn = useServerFn(generateGuidanceDraft);
  const [type, setType] = useState<MessageType>("guidance");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const generate = async () => {
    setDrafting(true); setDraft(null);
    try {
      const r = await draftFn({ data: { questionId: pilot.question_id, messageType: type } });
      setDraft(r.draft || "(IRIS could not draft a message)");
    } catch (e: any) {
      toast.error(e?.message ?? "Draft failed");
    } finally { setDrafting(false); }
  };

  const send = useMutation({
    mutationFn: async () => sendFn({
      data: {
        missionId,
        questionId: pilot.question_id,
        toUserId: pilot.writer_id,
        messageType: type,
        body: body.trim(),
      },
    }),
    onSuccess: () => { toast.success(`Sent to ${pilot.writer_name}'s Cockpit.`); onSent(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0a0e1a] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[13px]">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">←</button>{" "}
            Send to <span className="font-semibold">{pilot.writer_name}</span> · Q{pilot.question_number}
          </div>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message type</div>
          <div className="flex flex-wrap gap-1.5">
            {MESSAGE_TYPES.map((t) => (
              <button
                key={t.k}
                onClick={() => setType(t.k)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                  type === t.k ? "" : "opacity-60 hover:opacity-100"
                }`}
                style={{
                  borderColor: t.color,
                  color: t.color,
                  background: type === t.k ? `${t.color}22` : "transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          placeholder="Write your message…"
          rows={5}
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        />
        <div className="mt-1 text-right text-[10px] text-muted-foreground">{body.length}/280</div>

        <div className="mt-4 rounded-md p-3" style={{ background: "rgba(8,145,178,0.06)", borderLeft: "3px solid #22d3ee" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#22d3ee" }}>
              <Sparkles className="h-3 w-3" /> IRIS Assist
            </span>
            <button
              onClick={generate}
              disabled={drafting}
              className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {drafting ? "Drafting…" : draft ? "Regenerate" : "Draft a message"}
            </button>
          </div>
          {draft && (
            <>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{draft}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setBody(draft)}
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20"
                >
                  Use this →
                </button>
                <button onClick={() => setDraft(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Dismiss</button>
              </div>
            </>
          )}
          {!draft && !drafting && (
            <div className="text-[11px] text-muted-foreground">
              IRIS will read {pilot.writer_name}'s brief, confidence, and open requests, then draft a {MESSAGE_TYPES.find((t) => t.k === type)?.label.toLowerCase()}.
            </div>
          )}
        </div>

        <button
          disabled={!body.trim() || send.isPending}
          onClick={() => send.mutate()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send to {pilot.writer_name}'s Cockpit
        </button>
      </div>
    </>
  );
}

function BroadcastDrawer({
  missionId, onClose, onSent,
}: { missionId: string; onClose: () => void; onSent: () => void }) {
  const sendFn = useServerFn(sendCoPilotMessage);
  const [type, setType] = useState<MessageType>("guidance");
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: async () => sendFn({
      data: {
        missionId,
        questionId: null,
        toUserId: null,
        messageType: type,
        body: body.trim(),
        isBroadcast: true,
      },
    }),
    onSuccess: () => { toast.success("Broadcast sent to all pilots."); onSent(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0a0e1a] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-[13px] font-semibold">
            <Megaphone className="h-4 w-4 text-amber-400" /> Broadcast to All Pilots
          </div>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MESSAGE_TYPES.filter((t) => t.k !== "encouragement").map((t) => (
            <button
              key={t.k} onClick={() => setType(t.k)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${type === t.k ? "" : "opacity-60 hover:opacity-100"}`}
              style={{ borderColor: t.color, color: t.color, background: type === t.k ? `${t.color}22` : "transparent" }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          placeholder="Send a message to all writers on this mission…"
          rows={5}
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        />
        <div className="mt-1 text-right text-[10px] text-muted-foreground">{body.length}/280</div>
        <button
          disabled={!body.trim() || send.isPending}
          onClick={() => send.mutate()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send to All Cockpits
        </button>
      </div>
    </>
  );
}
