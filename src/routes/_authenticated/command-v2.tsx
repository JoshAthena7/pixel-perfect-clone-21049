import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BroadcastForm,
  HuddleForm,
  PulseForm,
  DecisionForm,
  RiskForm,
  SosForm,
  type FormProps,
} from "@/components/war-room/ActionLauncher";
import { toast } from "sonner";

type ModalKey = "broadcast" | "signal" | "risk" | "sos" | "decision" | "pulse";
const MODAL_TITLES: Record<ModalKey, string> = {
  broadcast: "Send Broadcast",
  signal: "Submit Team Signal",
  risk: "Log Risk",
  sos: "Raise Support Request",
  decision: "Record Decision",
  pulse: "Record Client Signal",
};

export const Route = createFileRoute("/_authenticated/command-v2")({
  head: () => ({ meta: [{ title: "Mission Control — Athena Command" }] }),
  component: CommandV2Gate,
});

type Health = "Green" | "Yellow" | "Orange" | "Red";
type Broadcast = { id: string; content: string; author_name: string; created_at: string; pinned: boolean };
type Huddle = { id: string; health: string; priority: string; submitter_name: string; created_at: string; needs_leadership: boolean };
type Risk = { id: string; title: string; severity: string; status: string; owner_name: string | null };
type Sos = { id: string; description: string; severity: string; status: string; category: string; submitter_name: string; created_at: string };
type Decision = { id: string; title: string; status: string; owner_name: string | null; decision_date: string };
type Pulse = { id: string; sentiment: string; summary: string; recorder_name: string; interaction_date: string };

function CommandV2Gate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <CommandV2 />;
}

const styles = `
  .ac-root { --ac-bg:#0a0e1a; --ac-surface:#111827; --ac-surface2:#1a2235; --ac-surface3:#222d42;
    --ac-border:#2a3a55; --ac-text:#e8edf5; --ac-text2:#8b9ab5; --ac-text3:#556070;
    --ac-accent:#3b7fff; --ac-green:#22c55e; --ac-yellow:#f59e0b; --ac-orange:#f97316; --ac-red:#ef4444;
    background:var(--ac-bg); color:var(--ac-text); min-height:100vh;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; font-size:14px;
  }
  .ac-root .panel { background:var(--ac-surface); border:1px solid var(--ac-border); border-radius:10px; }
  .ac-root .panel-head { padding:12px 16px; border-bottom:1px solid var(--ac-border); display:flex; align-items:center; justify-content:space-between; }
  .ac-root .panel-title { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ac-text2); }
  .ac-root .panel-body { padding:14px 16px; }
  .ac-root .pill { display:inline-flex; align-items:center; gap:6px; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; }
  .ac-root .pill::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .ac-root .pill-g { color:var(--ac-green); background:rgba(34,197,94,.12); }
  .ac-root .pill-y { color:var(--ac-yellow); background:rgba(245,158,11,.12); }
  .ac-root .pill-o { color:var(--ac-orange); background:rgba(249,115,22,.12); }
  .ac-root .pill-r { color:var(--ac-red); background:rgba(239,68,68,.12); }
  .ac-root .pill-b { color:var(--ac-accent); background:rgba(59,127,255,.12); }
  .ac-root .ring { width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; border:2px solid currentColor; flex-shrink:0; }
  .ac-root .btn { background:var(--ac-surface2); border:1px solid var(--ac-border); color:var(--ac-text); padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; }
  .ac-root .btn:hover { background:var(--ac-surface3); border-color:var(--ac-accent); }
  .ac-root .btn-primary { background:var(--ac-accent); border-color:var(--ac-accent); color:#fff; }
  .ac-root .metric { background:var(--ac-surface); border:1px solid var(--ac-border); border-radius:10px; padding:16px 18px; }
  .ac-root .metric-label { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--ac-text3); }
  .ac-root .metric-value { font-size:28px; font-weight:700; margin-top:6px; line-height:1; }
  .ac-root .row-item { padding:10px 0; border-bottom:1px solid var(--ac-border); }
  .ac-root .row-item:last-child { border-bottom:none; }
  .ac-root .muted { color:var(--ac-text2); font-size:12px; }
  .ac-root .micro { color:var(--ac-text3); font-size:11px; }
  .ac-root a.linklike { color:var(--ac-accent); text-decoration:none; }
  .ac-root a.linklike:hover { text-decoration:underline; }
  .ac-root .iris { background:linear-gradient(135deg, rgba(59,127,255,.08), rgba(168,85,247,.06)); border:1px solid rgba(59,127,255,.25); border-radius:10px; padding:18px; }
`;

function healthColor(h: string): "g" | "y" | "o" | "r" {
  if (h === "Green") return "g";
  if (h === "Yellow") return "y";
  if (h === "Orange") return "o";
  return "r";
}
function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function daysTo(date: string | null | undefined): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function CommandV2() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [huddles, setHuddles] = useState<Huddle[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [sos, setSos] = useState<Sos[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [roster, setRoster] = useState<{ display_name: string; role: string }[]>([]);

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("engagement_members")
      .select("display_name,role")
      .eq("engagement_id", engagement.id)
      .order("display_name")
      .then(({ data }) => setRoster((data as { display_name: string; role: string }[]) ?? []));
  }, [engagement?.id]);

  async function loadAll(eid: string) {
    setErr(null);
    const [bc, hu, rk, ss, dc, pl] = await Promise.all([
      supabase.from("broadcasts").select("id,content,author_name,created_at,pinned").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(2),
      supabase.from("huddles").select("id,health,priority,submitter_name,created_at,needs_leadership").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(3),
      supabase.from("risks").select("id,title,severity,status,owner_name").eq("engagement_id", eid).in("status", ["Open", "Monitoring"]).order("created_at", { ascending: false }).limit(3),
      supabase.from("sos_alerts").select("id,description,severity,status,category,submitter_name,created_at").eq("engagement_id", eid).neq("status", "Resolved").order("created_at", { ascending: false }).limit(3),
      supabase.from("decisions").select("id,title,status,owner_name,decision_date").eq("engagement_id", eid).eq("status", "Pending Confirmation").order("decision_date", { ascending: false }).limit(3),
      supabase.from("client_pulses").select("id,sentiment,summary,recorder_name,interaction_date").eq("engagement_id", eid).order("interaction_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const e = bc.error ?? hu.error ?? rk.error ?? ss.error ?? dc.error ?? pl.error;
    if (e) { setErr(e.message); return; }
    setBroadcasts((bc.data as Broadcast[]) ?? []);
    setHuddles((hu.data as Huddle[]) ?? []);
    setRisks((rk.data as Risk[]) ?? []);
    setSos((ss.data as Sos[]) ?? []);
    setDecisions((dc.data as Decision[]) ?? []);
    setPulse((pl.data as Pulse | null) ?? null);
  }

  useEffect(() => {
    if (!engagement) return;
    loadAll(engagement.id);
    const ch = supabase
      .channel(`cmdv2:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `engagement_id=eq.${engagement.id}` }, () => loadAll(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  const dts = useMemo(() => daysTo(engagement?.submission_date as string | undefined), [engagement?.submission_date]);
  const dtsClass = dts == null ? "" : dts < 7 ? "pill-r" : dts < 14 ? "pill-y" : "pill-b";

  // Derive mission health from latest huddle if any, else Green.
  const missionHealth = (huddles[0]?.health as Health) ?? ("Green" as Health);
  const hc = healthColor(missionHealth);

  if (!engagement) return null;

  return (
    <div className="ac-root">
      <style>{styles}</style>
      <div className="w-full px-8 py-7" style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`ring pill-${hc}`} style={{ color: hc === "g" ? "#22c55e" : hc === "y" ? "#f59e0b" : hc === "o" ? "#f97316" : "#ef4444" }}>
              {missionHealth[0]}
            </div>
            <div>
              <div className="micro">MISSION CONTROL</div>
              <h1 className="text-2xl font-bold mt-0.5">{engagement.name}</h1>
              <div className="muted mt-0.5">{engagement.client}{dts != null && <> · <span className={`pill ${dtsClass}`}>{dts}d to submission</span></>}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setModal("signal")}>📡 Signal</button>
            <button className="btn" onClick={() => setModal("sos")}>🆘 Support</button>
            <Link to="/command" className="micro" style={{ marginLeft: 12 }}>← v1</Link>
          </div>
        </header>

        {err && (
          <div className="rounded-md mb-4 px-3 py-2 text-[12px]" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)" }}>{err}</div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="metric">
            <div className="metric-label">Days to Submission</div>
            <div className="metric-value" style={{ color: dts == null ? "var(--ac-text)" : dts < 7 ? "var(--ac-red)" : dts < 14 ? "var(--ac-yellow)" : "var(--ac-accent)" }}>{dts ?? "—"}</div>
          </div>
          <div className="metric"><div className="metric-label">Open Risks</div><div className="metric-value">{risks.length}</div></div>
          <div className="metric"><div className="metric-label">Support Requests</div><div className="metric-value">{sos.length}</div></div>
          <div className="metric"><div className="metric-label">Pending Decisions</div><div className="metric-value">{decisions.length}</div></div>
        </div>

        {/* 2x2 panel grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Leadership Focus */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Leadership Focus</span><button className="btn" onClick={() => setModal("broadcast")}>+ Broadcast</button></div>
            <div className="panel-body">
              {broadcasts.length === 0 && <div className="muted">No broadcasts yet.</div>}
              {broadcasts.map(b => (
                <div key={b.id} className="row-item">
                  <div style={{ color: "var(--ac-text)" }}>{b.content}</div>
                  <div className="micro mt-1">{b.author_name} · {relTime(b.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Recent Changes */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Recent Changes</span><Link to="/huddle" className="micro linklike">View all →</Link></div>
            <div className="panel-body">
              {huddles.length === 0 && <div className="muted">No signals submitted yet.</div>}
              {huddles.map(h => (
                <div key={h.id} className="row-item flex items-start gap-3">
                  <span className={`pill pill-${healthColor(h.health)}`}>{h.health}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{h.priority || <span className="muted">(no priority)</span>}</div>
                    <div className="micro">{h.submitter_name} · {relTime(h.created_at)}{h.needs_leadership && <> · <span style={{ color: "var(--ac-red)" }}>leadership needed</span></>}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Open Risks */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Open Risks</span><button className="btn" onClick={() => setModal("risk")}>+ Add</button></div>
            <div className="panel-body">
              {risks.length === 0 && <div className="muted">No open risks. ✅</div>}
              {risks.map(r => (
                <div key={r.id} className="row-item flex items-start gap-3">
                  <span className={`pill ${r.severity === "High" ? "pill-r" : r.severity === "Medium" ? "pill-o" : "pill-y"}`}>{r.severity}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{r.title}</div>
                    <div className="micro">{r.owner_name ?? "Unassigned"} · {r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Support Requests */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Support Requests</span><button className="btn" onClick={() => setModal("sos")}>+ Request</button></div>
            <div className="panel-body">
              {sos.length === 0 && <div className="muted">No open requests.</div>}
              {sos.map(s => (
                <div key={s.id} className="row-item flex items-start gap-3">
                  <span className={`pill ${s.severity === "Red" ? "pill-r" : s.severity === "Orange" ? "pill-o" : "pill-y"}`}>{s.severity}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{s.description}</div>
                    <div className="micro">{s.category} · {s.submitter_name} · {relTime(s.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Pending Decisions</span><button className="btn" onClick={() => setModal("decision")}>+ Log</button></div>
            <div className="panel-body">
              {decisions.length === 0 && <div className="muted">Nothing pending confirmation.</div>}
              {decisions.map(d => (
                <div key={d.id} className="row-item">
                  <div>{d.title}</div>
                  <div className="micro">{d.owner_name ?? "Unassigned"} · {d.decision_date}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Client Signal</span><button className="btn" onClick={() => setModal("pulse")}>+ Record</button></div>
            <div className="panel-body">
              {!pulse && <div className="muted">No client signal recorded yet.</div>}
              {pulse && (
                <>
                  <span className={`pill ${pulse.sentiment === "Happy" ? "pill-g" : pulse.sentiment === "Neutral" ? "pill-y" : "pill-r"}`}>{pulse.sentiment}</span>
                  <div className="mt-2">{pulse.summary}</div>
                  <div className="micro mt-1">{pulse.recorder_name} · {pulse.interaction_date}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* IRIS Mission Brief */}
        <div className="iris">
          <div className="flex items-center justify-between mb-2">
            <div className="panel-title" style={{ color: "var(--ac-accent)" }}>🔮 IRIS Mission Brief</div>
            <button className="btn btn-primary">Regenerate</button>
          </div>
          <div className="muted" style={{ lineHeight: 1.6 }}>
            {huddles.length === 0 && risks.length === 0 && sos.length === 0
              ? "No live signals yet. Submit a Team Signal or log a Risk to seed the brief."
              : `${engagement.name} is currently ${missionHealth}. ${risks.length} open risk${risks.length === 1 ? "" : "s"}, ${sos.length} active support request${sos.length === 1 ? "" : "s"}, ${decisions.length} decision${decisions.length === 1 ? "" : "s"} awaiting confirmation${dts != null ? `, ${dts} days to submission` : ""}. Latest team signal: ${huddles[0]?.priority ?? "—"} (${huddles[0]?.submitter_name ?? "—"}).`}
          </div>
        </div>
      </div>
    </div>
  );
}
