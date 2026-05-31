/**
 * StrategicIntelFeed
 * Shows IRIS-classified strategic intelligence for a mission.
 * Every item includes full source traceability.
 */
import { useEffect, useState } from "react";
import { getStoredStrategicSignals, readStrategicIntelligence, updateStrategicSignal } from "@/lib/iris/iris-strategic.functions";
import { IrisPulseIcon } from "./IrisPulseIcon";
import type { IrisState } from "@/lib/iris/iris-types";
import { RefreshCw, ExternalLink, ChevronDown, ChevronUp, X } from "lucide-react";

type Signal = {
  id: string;
  classification: string;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  iris_interpretation: string | null;
  recommended_action: string | null;
  source_name: string;
  source_url: string | null;
  published_at: string | null;
  detected_at: string;
  urgency_score: number | null;
  confidence_score: number | null;
  affected_workstream: string | null;
  affected_agency: string | null;
  affected_categories: string[] | null;
  status: string;
};

const CLASS_CONFIG: Record<string, { label: string; state: IrisState; color: string; bg: string }> = {
  escalation:     { label: "Escalation",     state: "intervention", color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
  alert:          { label: "Alert",           state: "intervention", color: "#ef4444", bg: "rgba(239,68,68,0.06)" },
  recommendation: { label: "Recommendation", state: "attention",    color: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
  insight:        { label: "Insight",         state: "attention",    color: "#C49A2A", bg: "rgba(196,154,42,0.06)" },
  signal:         { label: "Signal",          state: "stable",       color: "#60a5fa", bg: "rgba(96,165,250,0.05)" },
  monitor:        { label: "Monitor",         state: "neutral",      color: "#556070", bg: "transparent" },
};

function relTime(ts: string | null) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(ts: string | null) {
  if (!ts) return null;
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return null; }
}

interface Props {
  engagementId: string;
  canRegenerate?: boolean;
  compact?: boolean;
}

export function StrategicIntelFeed({ engagementId, canRegenerate = false, compact = false }: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const r = await getStoredStrategicSignals({
        data: { engagementId, minClassification: "signal" }
      });
      setSignals(r.signals as Signal[]);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function scan() {
    setScanning(true);
    try {
      const r = await readStrategicIntelligence({
        data: { engagementId, forceRefresh: false, limit: 20 }
      });
      setSignals(r.signals as Signal[]);
    } catch { /* silent */ }
    setScanning(false);
  }

  async function dismiss(id: string) {
    await updateStrategicSignal({ data: { signalId: id, status: "dismissed" } });
    setSignals(prev => prev.filter(s => s.id !== id));
  }

  async function acknowledge(id: string) {
    await updateStrategicSignal({ data: { signalId: id, status: "acknowledged" } });
    setSignals(prev => prev.map(s => s.id === id ? { ...s, status: "acknowledged" } : s));
  }

  useEffect(() => { load(); }, [engagementId]);

  const actionable = signals.filter(s => ["escalation","alert","recommendation"].includes(s.classification));
  const informational = signals.filter(s => ["insight","signal"].includes(s.classification));

  if (loading) return (
    <div style={{ padding: "12px 20px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <IrisPulseIcon state="neutral" size={14} />
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--muted-foreground)", opacity:0.5 }}>
          IRIS · Strategic Intelligence
        </span>
      </div>
      {[1,2].map(i => (
        <div key={i} style={{ height:10, borderRadius:4, background:"rgba(255,255,255,0.04)", marginBottom:6, width:`${70+i*15}%` }} />
      ))}
    </div>
  );

  if (!signals.length) return (
    <div style={{ padding:"10px 20px", borderBottom:"0.5px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", gap:8 }}>
      <IrisPulseIcon state="stable" size={14} />
      <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--muted-foreground)", opacity:0.5 }}>
        IRIS · Strategic Intelligence
      </span>
      <span style={{ fontSize:11, color:"var(--muted-foreground)", opacity:0.5 }}>No strategic signals detected</span>
      {canRegenerate && (
        <button onClick={scan} disabled={scanning} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted-foreground)", background:"none", border:"none", cursor:"pointer" }}>
          <RefreshCw style={{ width:11, height:11, animation: scanning ? "spin 1s linear infinite" : "none" }} />
          {scanning ? "Scanning…" : "Scan intel"}
        </button>
      )}
    </div>
  );

  const overallState: IrisState = actionable.length > 0 ? "intervention" : informational.length > 0 ? "attention" : "stable";

  return (
    <div style={{ borderBottom:"0.5px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 20px", background:"rgba(255,255,255,0.01)" }}>
        <IrisPulseIcon state={overallState} size={14} />
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--muted-foreground)", opacity:0.6 }}>
          IRIS · Strategic Intelligence
        </span>
        {actionable.length > 0 && (
          <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:3, background:"rgba(239,68,68,0.15)", color:"#ef4444" }}>
            {actionable.length} action{actionable.length>1?"s":""} needed
          </span>
        )}
        {canRegenerate && (
          <button onClick={scan} disabled={scanning} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted-foreground)", background:"none", border:"none", cursor:"pointer", opacity:0.7 }}>
            <RefreshCw style={{ width:11, height:11, animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        )}
      </div>

      {/* Signals */}
      {signals.map(sig => {
        const cfg = CLASS_CONFIG[sig.classification] ?? CLASS_CONFIG.signal;
        const isExpanded = expanded.has(sig.id);
        const isAcknowledged = sig.status === "acknowledged";

        return (
          <div key={sig.id} style={{
            borderTop: "0.5px solid rgba(255,255,255,0.04)",
            background: isAcknowledged ? "transparent" : cfg.bg,
            opacity: isAcknowledged ? 0.6 : 1,
          }}>
            {/* Signal row */}
            <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 20px", cursor:"pointer" }}
              onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(sig.id) ? n.delete(sig.id) : n.add(sig.id); return n; })}>
              <IrisPulseIcon state={cfg.state} size={13} className="mt-0.5" />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase",
                    color:cfg.color, padding:"1px 5px", borderRadius:3, background:`color-mix(in oklab, ${cfg.color} 12%, transparent)` }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize:9, color:"var(--muted-foreground)", opacity:0.4 }}>
                    {relTime(sig.detected_at)}
                  </span>
                  {sig.affected_workstream && (
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", opacity:0.5 }}>
                      · {sig.affected_workstream}
                    </span>
                  )}
                </div>
                <p style={{ fontSize:12, fontWeight:500, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {sig.title}
                </p>
                {sig.why_it_matters && !isExpanded && (
                  <p style={{ fontSize:11, color:"var(--muted-foreground)", margin:"2px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {sig.why_it_matters}
                  </p>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                {isExpanded ? <ChevronUp style={{ width:13, height:13, color:"var(--muted-foreground)", opacity:0.4 }} />
                  : <ChevronDown style={{ width:13, height:13, color:"var(--muted-foreground)", opacity:0.4 }} />}
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding:"0 20px 12px 43px", display:"flex", flexDirection:"column", gap:10 }}>

                {/* IRIS interpretation */}
                {sig.iris_interpretation && (
                  <p style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.6, margin:0 }}>
                    {sig.iris_interpretation}
                  </p>
                )}

                {/* Recommended action */}
                {sig.recommended_action && (
                  <div style={{ padding:"8px 12px", borderRadius:6, background:"rgba(245,158,11,0.08)", border:"0.5px solid rgba(245,158,11,0.2)" }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--yellow)", display:"block", marginBottom:3 }}>
                      Recommended Action
                    </span>
                    <p style={{ fontSize:12, margin:0, color:"var(--foreground)" }}>{sig.recommended_action}</p>
                  </div>
                )}

                {/* Source traceability */}
                <div style={{ padding:"8px 12px", borderRadius:6, background:"rgba(255,255,255,0.02)", border:"0.5px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted-foreground)", opacity:0.5, display:"block", marginBottom:4 }}>
                    Source Traceability
                  </span>
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <div style={{ display:"flex", gap:8, fontSize:11 }}>
                      <span style={{ color:"var(--muted-foreground)", opacity:0.5, width:80, flexShrink:0 }}>Source</span>
                      <span style={{ color:"var(--foreground)" }}>{sig.source_name}</span>
                    </div>
                    {sig.published_at && (
                      <div style={{ display:"flex", gap:8, fontSize:11 }}>
                        <span style={{ color:"var(--muted-foreground)", opacity:0.5, width:80, flexShrink:0 }}>Published</span>
                        <span style={{ color:"var(--muted-foreground)" }}>{fmtDate(sig.published_at)}</span>
                      </div>
                    )}
                    <div style={{ display:"flex", gap:8, fontSize:11 }}>
                      <span style={{ color:"var(--muted-foreground)", opacity:0.5, width:80, flexShrink:0 }}>Detected</span>
                      <span style={{ color:"var(--muted-foreground)" }}>{fmtDate(sig.detected_at)}</span>
                    </div>
                    {sig.confidence_score != null && (
                      <div style={{ display:"flex", gap:8, fontSize:11 }}>
                        <span style={{ color:"var(--muted-foreground)", opacity:0.5, width:80, flexShrink:0 }}>Confidence</span>
                        <span style={{ color:"var(--muted-foreground)" }}>{Math.round(sig.confidence_score * 100)}%</span>
                      </div>
                    )}
                    {sig.source_url && (
                      <a href={sig.source_url} target="_blank" rel="noopener noreferrer"
                        style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:"#60a5fa", marginTop:2 }}>
                        <ExternalLink style={{ width:11, height:11 }} /> View original source
                      </a>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:"flex", gap:6 }}>
                  {sig.status === "open" && (
                    <button onClick={() => acknowledge(sig.id)} style={{
                      fontSize:11, padding:"4px 10px", borderRadius:6,
                      border:"0.5px solid rgba(255,255,255,0.1)", background:"transparent",
                      color:"var(--muted-foreground)", cursor:"pointer",
                    }}>
                      Acknowledge
                    </button>
                  )}
                  <button onClick={() => dismiss(sig.id)} style={{
                    fontSize:11, padding:"4px 10px", borderRadius:6,
                    border:"0.5px solid rgba(255,255,255,0.08)", background:"transparent",
                    color:"var(--muted-foreground)", cursor:"pointer", opacity:0.6,
                  }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
