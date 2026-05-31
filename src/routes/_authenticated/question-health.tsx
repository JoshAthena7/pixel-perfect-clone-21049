import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { PageGate } from "@/components/war-room/PageGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/question-health")({
  head: () => ({ meta: [{ title: "Question Health — Mission" }] }),
  component: () => <PageGate page="missionControl"><QuestionHealthPage /></PageGate>,
});

// ── Types ─────────────────────────────────────────────────────────
type Question = {
  id: string;
  question_number: string | null;
  title: string | null;
  body: string;
  section_id: string | null;
  evaluation_weight_pct: number | null;
  page_limit: number | null;
  health: string | null;
  health_score: number | null;
  status: string | null;
  assigned_writer: string | null;
  assigned_sme: string | null;
  owner: string | null;
  due_date: string | null;
  writer_confidence: number | null;
  sme_confirmed: boolean | null;
  open_issues: number | null;
  latest_review_score: number | null;
};

type Section = { id: string; section_name: string; status: string; evaluation_weight_pct: number | null };

// ── Health config ─────────────────────────────────────────────────
const HEALTH_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  Green:    { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)" },
  Yellow:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)" },
  Red:      { color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)" },
  Critical: { color: "#dc2626", bg: "rgba(220,38,38,0.12)",   border: "rgba(220,38,38,0.4)" },
};

const CONF_LABEL: Record<number, string> = { 1:"Not started", 2:"Outline only", 3:"Draft", 4:"Nearly final", 5:"Complete" };
const CONF_COLOR = (c: number | null) => !c ? "#556070" : c <= 2 ? "#ef4444" : c === 3 ? "#f59e0b" : "#22c55e";

type SortKey = "weight" | "health" | "confidence" | "due_date";

// ── Main component ────────────────────────────────────────────────
function QuestionHealthPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("health");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [selectedQ, setSelectedQ] = useState<Question | null>(null);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  async function load() {
    if (!engagement) return;
    setLoading(true);
    const [qs, ss] = await Promise.all([
      supabase.from("rfp_questions")
        .select("id,question_number,title,body,section_id,evaluation_weight_pct,page_limit,health,health_score,status,assigned_writer,assigned_sme,owner,due_date,writer_confidence,sme_confirmed,open_issues,latest_review_score")
        .eq("engagement_id", engagement.id)
        .order("sort_order"),
      supabase.from("heatmap_sections")
        .select("id,section_name,status,evaluation_weight_pct")
        .eq("engagement_id", engagement.id)
        .order("sort_order"),
    ]);
    setQuestions((qs.data ?? []) as Question[]);
    setSections((ss.data ?? []) as Section[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [engagement?.id]);

  const sectionMap = useMemo(() => {
    const m: Record<string, string> = {};
    sections.forEach(s => { m[s.id] = s.section_name; });
    return m;
  }, [sections]);

  const HEALTH_ORDER: Record<string, number> = { Critical: 0, Red: 1, Yellow: 2, Green: 3 };

  const sorted = useMemo(() => {
    let q = [...questions];
    if (filterSection !== "all") q = q.filter(x => x.section_id === filterSection);
    if (sortBy === "weight") q.sort((a, b) => (b.evaluation_weight_pct ?? 0) - (a.evaluation_weight_pct ?? 0));
    else if (sortBy === "health") q.sort((a, b) => (HEALTH_ORDER[a.health ?? "Green"] ?? 3) - (HEALTH_ORDER[b.health ?? "Green"] ?? 3));
    else if (sortBy === "confidence") q.sort((a, b) => (a.writer_confidence ?? 0) - (b.writer_confidence ?? 0));
    else if (sortBy === "due_date") q.sort((a, b) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1);
    return q;
  }, [questions, sortBy, filterSection]);

  const stats = useMemo(() => ({
    total: questions.length,
    critical: questions.filter(q => q.health === "Critical").length,
    red: questions.filter(q => q.health === "Red").length,
    yellow: questions.filter(q => q.health === "Yellow").length,
    green: questions.filter(q => q.health === "Green").length,
    unassigned: questions.filter(q => !q.assigned_writer).length,
  }), [questions]);

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Question Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {engagement.name} · {stats.total} questions · health drives section and mission health
          </p>
        </div>
      </div>

      {/* Health summary strip */}
      {stats.total > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Critical", value: stats.critical, cfg: HEALTH_CONFIG.Critical },
            { label: "Red",      value: stats.red,      cfg: HEALTH_CONFIG.Red },
            { label: "Yellow",   value: stats.yellow,   cfg: HEALTH_CONFIG.Yellow },
            { label: "Green",    value: stats.green,    cfg: HEALTH_CONFIG.Green },
            { label: "Unassigned", value: stats.unassigned, cfg: { color: "#556070", bg: "rgba(85,96,112,0.08)", border: "rgba(85,96,112,0.2)" } },
          ].map(({ label, value, cfg }) => (
            <div key={label} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: cfg.color, opacity: 0.8, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(["health","weight","confidence","due_date"] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSortBy(k)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${sortBy===k ? "border-primary text-primary bg-primary/8" : "border-border/40 text-muted-foreground hover:text-foreground"}`}>
              {k === "due_date" ? "Due Date" : k === "confidence" ? "Confidence" : k.charAt(0).toUpperCase()+k.slice(1)}
            </button>
          ))}
        </div>
        <select className="text-xs rounded-md border border-border bg-background px-2 py-1 ml-auto"
          value={filterSection} onChange={e => setFilterSection(e.target.value)}>
          <option value="all">All sections</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.section_name}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {!loading && stats.total === 0 && (
        <div className="rounded-lg border border-dashed border-border/40 p-12 text-center text-muted-foreground">
          <p className="text-lg font-semibold mb-2">No questions yet</p>
          <p className="text-sm">Upload your RFP in Mission Control → Documents. IRIS will extract and structure all questions automatically.</p>
        </div>
      )}

      {/* Question table */}
      {sorted.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {["#","Section","Question","Weight","Writer","SME","Confidence","Health","Status",""].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(q => {
                const hcfg = HEALTH_CONFIG[q.health ?? "Green"] ?? HEALTH_CONFIG.Green;
                const confColor = CONF_COLOR(q.writer_confidence);
                return (
                  <tr key={q.id} className="border-b border-border/30 hover:bg-muted/10 cursor-pointer transition-colors"
                    onClick={() => { setSelectedQ(q); }}>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{q.question_number ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground max-w-[100px] truncate">{q.section_id ? sectionMap[q.section_id] : "—"}</td>
                    <td className="px-3 py-3 max-w-[260px]">
                      <div className="font-medium text-xs truncate">{q.title ?? q.body.slice(0,60)}</div>
                      {q.open_issues ? <span className="text-[10px] text-red-400">{q.open_issues} open issue{q.open_issues>1?"s":""}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {q.evaluation_weight_pct != null ? (
                        <span className="text-xs font-bold">{q.evaluation_weight_pct}%</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{q.assigned_writer ?? <span className="text-red-400 text-[10px]">Unassigned</span>}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{q.assigned_sme ?? "—"}</td>
                    <td className="px-3 py-3">
                      {q.writer_confidence ? (
                        <div>
                          <span style={{ color: confColor, fontWeight: 700, fontSize: 13 }}>{q.writer_confidence}/5</span>
                          <div style={{ fontSize: 9, color: confColor, opacity: 0.8 }}>{CONF_LABEL[q.writer_confidence]}</div>
                        </div>
                      ) : <span className="text-[10px] text-muted-foreground opacity-50">None</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        background: hcfg.bg, color: hcfg.color, border: `1px solid ${hcfg.border}` }}>
                        {q.health ?? "Green"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{q.status ?? "Not Started"}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {isLeadership && (
                          <button onClick={() => { setSelectedQ(q); setShowCheckModal(true); }}
                            className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40">
                            Check
                          </button>
                        )}
                        <button onClick={() => { setSelectedQ(q); setShowUpdateModal(true); }}
                          className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40">
                          Update
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCheckModal && selectedQ && (
        <ConfidenceCheckModal question={selectedQ} engagementId={engagement.id}
          memberName={member?.display_name ?? ""}
          onClose={() => { setShowCheckModal(false); load(); }} />
      )}
      {showUpdateModal && selectedQ && (
        <QuestionUpdateModal question={selectedQ} engagementId={engagement.id}
          onClose={() => { setShowUpdateModal(false); load(); }} />
      )}
      {showReviewModal && selectedQ && (
        <ReviewModal question={selectedQ} engagementId={engagement.id}
          memberName={member?.display_name ?? ""}
          onClose={() => { setShowReviewModal(false); load(); }} />
      )}
    </div>
  );
}

// ── Confidence Check Modal (Leadership) ──────────────────────────
function ConfidenceCheckModal({ question, engagementId, memberName, onClose }: any) {
  const [health, setHealth] = useState("Green");
  const [score, setScore] = useState(3);
  const [observations, setObservations] = useState("");
  const [concerns, setConcerns] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("question_confidence_checks").insert({
      question_id: question.id, engagement_id: engagementId,
      reviewer: memberName || "Leadership",
      health_status: health, confidence_score: score,
      observations, concerns, recommendations,
    });
    if (error) { toast.error("Failed to save"); setSaving(false); return; }
    // Log to timeline
    await supabase.from("question_timeline").insert({
      question_id: question.id, engagement_id: engagementId,
      event_type: "confidence_check",
      description: `Confidence check: ${health} (${score}/5)`,
      actor: memberName || "Leadership",
      metadata: { health, score },
    });
    toast.success("Confidence check submitted");
    onClose();
  }

  const HLABELS = ["Green","Yellow","Red","Critical"];
  const HCOLORS: Record<string,string> = { Green:"#22c55e", Yellow:"#f59e0b", Red:"#ef4444", Critical:"#dc2626" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold">Confidence Check</h2>
          <p className="text-xs text-muted-foreground mt-1">{question.question_number} — {(question.title ?? question.body).slice(0,80)}</p>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Health Assessment</Label>
          <div className="flex gap-2 mt-1">
            {HLABELS.map(h => (
              <button key={h} type="button" onClick={() => setHealth(h)}
                className="flex-1 rounded-md py-1.5 text-xs font-semibold border transition-colors"
                style={{ background: health===h ? `${HCOLORS[h]}18` : "transparent",
                  borderColor: health===h ? HCOLORS[h] : "rgba(255,255,255,0.1)",
                  color: health===h ? HCOLORS[h] : "var(--muted-foreground)" }}>
                {h}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Confidence Score: {score}/5
          </Label>
          <input type="range" min={1} max={5} value={score} onChange={e => setScore(+e.target.value)} className="w-full mt-1" />
          <div className="flex justify-between text-[10px] text-muted-foreground opacity-50">
            <span>1 — Not confident</span><span>5 — Highly confident</span>
          </div>
        </div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observations</Label>
          <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} placeholder="What did you observe about this question's current state?" /></div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Concerns</Label>
          <Textarea value={concerns} onChange={e => setConcerns(e.target.value)} rows={2} placeholder="Any concerns about quality, direction, or risk?" /></div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recommendations</Label>
          <Textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} rows={2} placeholder="What should happen next?" /></div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Submit Check"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Writer/SME Progress Update Modal ─────────────────────────────
function QuestionUpdateModal({ question, engagementId, onClose }: any) {
  const [conf, setConf] = useState<number>(question.writer_confidence ?? 3);
  const [smeConfirmed, setSmeConfirmed] = useState<boolean>(question.sme_confirmed ?? false);
  const [status, setStatus] = useState<string>(question.status ?? "In Progress");
  const [saving, setSaving] = useState(false);
  const STATUSES = ["Not Started","In Progress","Draft Complete","In Review","Final","At Risk","Critical"];

  async function save() {
    setSaving(true);
    await supabase.from("rfp_questions").update({
      writer_confidence: conf, sme_confirmed: smeConfirmed, status, updated_at: new Date().toISOString()
    }).eq("id", question.id);
    // Log timeline
    await supabase.from("question_timeline").insert({
      question_id: question.id, engagement_id: engagementId,
      event_type: "progress_update",
      description: `Progress updated: ${status}, confidence ${conf}/5`,
      metadata: { status, conf, sme_confirmed: smeConfirmed },
    });
    toast.success("Question updated");
    onClose();
  }

  const CONF_LABELS: Record<number,string> = { 1:"Not started", 2:"Outline only", 3:"Draft in progress", 4:"Nearly final", 5:"Complete" };
  const confColor = conf <= 2 ? "#ef4444" : conf === 3 ? "#f59e0b" : "#22c55e";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold">Update Progress</h2>
          <p className="text-xs text-muted-foreground mt-1">{question.question_number} — {(question.title ?? question.body).slice(0,80)}</p>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Writer Confidence: <span style={{color:confColor}}>{conf}/5 — {CONF_LABELS[conf]}</span>
          </Label>
          <input type="range" min={1} max={5} value={conf} onChange={e=>setConf(+e.target.value)} className="w-full mt-1"/>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
          <select className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={status} onChange={e=>setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={smeConfirmed} onChange={e=>setSmeConfirmed(e.target.checked)} className="rounded"/>
          <span className="text-sm">SME has reviewed and confirmed this question</span>
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving?"Saving…":"Update"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Red/Gold Team Review Modal ────────────────────────────────────
function ReviewModal({ question, engagementId, memberName, onClose }: any) {
  const [type, setType] = useState<"red_team"|"gold_team">("red_team");
  const [score, setScore] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [risks, setRisks] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from("question_reviews").insert({
      question_id: question.id, engagement_id: engagementId,
      review_type: type, reviewer_name: memberName || "Reviewer",
      score: score ? parseFloat(score) : null, max_score: 100,
      notes, risks, recommendations, review_date: new Date().toISOString().split("T")[0],
    });
    toast.success(`${type === "red_team" ? "Red Team" : "Gold Team"} review submitted`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold">Submit Review</h2>
          <p className="text-xs text-muted-foreground mt-1">{question.question_number} — {(question.title ?? question.body).slice(0,80)}</p>
        </div>
        <div className="flex gap-2">
          {[["red_team","🔴 Red Team"],["gold_team","🟡 Gold Team"]].map(([v,l]) => (
            <button key={v} type="button" onClick={()=>setType(v as any)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold border ${type===v?"border-primary text-primary bg-primary/8":"border-border/40 text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Score (out of 100)</Label>
          <Input value={score} onChange={e=>setScore(e.target.value)} placeholder="e.g. 78" type="number" min="0" max="100"/>
        </div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Review Notes</Label>
          <Textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Overall assessment of this question response..."/></div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Risks Identified</Label>
          <Textarea value={risks} onChange={e=>setRisks(e.target.value)} rows={2} placeholder="Any risks in the current response..."/></div>
        <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recommendations</Label>
          <Textarea value={recommendations} onChange={e=>setRecommendations(e.target.value)} rows={2} placeholder="What should be improved..."/></div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving?"Saving…":"Submit Review"}</Button>
        </div>
      </div>
    </div>
  );
}
