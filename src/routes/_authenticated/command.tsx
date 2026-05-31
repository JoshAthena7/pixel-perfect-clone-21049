/**
 * MISSION — /command
 *
 * The single operational home for all mission work.
 * 8 tabs: Overview · Library · Briefing Book · Assignments ·
 *         Team Updates · Decision Log · Signals · SOS
 *
 * Tab state driven by ?tab= search param for bookmarkable URLs.
 */
import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { PageGate } from "@/components/war-room/PageGate";
import { SosBanner } from "@/components/war-room/SosBanner";
import { StrategicIntelFeed } from "@/components/iris/StrategicIntelFeed";
import { HolyGrailPanel } from "@/components/war-room/HolyGrailPanel";
import { RfpStructuredPanel } from "@/components/war-room/RfpStructuredPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { relativeTime, daysUntil } from "@/lib/time";
import { logActivity } from "@/lib/activity-log";
import {
  analyzeOpportunity, analyzeCategory,
  startHolyGrailRun, finishHolyGrailRun,
} from "@/lib/ai/holy-grail.functions";
import {
  BookOpen, Library, Brain, ClipboardList, MessageSquare,
  GitBranch, AlertTriangle, Siren, Upload, FileText,
  ExternalLink, Loader2, Download, Sparkles, CheckCircle,
  Clock, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/command")({
  head: () => ({ meta: [{ title: "Mission — Athena Command" }] }),
  component: MissionGate,
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s.tab as string) || "overview" }),
});

function MissionGate() {
  const { loading, can } = useEngagement();
  if (loading) return null;
  return (
    <PageGate page="missionControl">
      <MissionShell />
    </PageGate>
  );
}

// ── Design tokens ──────────────────────────────────────────────────
const BG2 = "#111827", SURFACE = "#1a2235", BORDER = "rgba(255,255,255,0.07)";
const GOLD = "#C49A2A", MUTED = "rgba(255,255,255,0.4)", TEXT = "#e8edf5";
const HEALTH: Record<string, string> = { Green:"#22c55e", Yellow:"#f59e0b", Orange:"#f97316", Red:"#ef4444" };

// ── Tab definitions ────────────────────────────────────────────────
const TABS = [
  { key: "overview",      label: "Overview",      icon: BookOpen },
  { key: "library",       label: "Library",       icon: Library },
  { key: "briefing",      label: "Briefing Book", icon: Brain },
  { key: "assignments",   label: "Assignments",   icon: ClipboardList },
  { key: "team-updates",  label: "Team Updates",  icon: MessageSquare },
  { key: "decisions",     label: "Decision Log",  icon: GitBranch },
  { key: "signals",       label: "Signals",       icon: AlertTriangle },
  { key: "sos",           label: "SOS",           icon: Siren },
] as const;
type TabKey = typeof TABS[number]["key"];

// ── Mission Shell ──────────────────────────────────────────────────
function MissionShell() {
  const { engagement, member, isLeadership, canEdit } = useEngagement();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const tab = (search.tab as TabKey) || "overview";

  function setTab(t: TabKey) {
    navigate({ to: "/command", search: { tab: t } });
  }

  if (!engagement) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      {/* ── Mission header ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "16px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>
              Mission
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              {engagement.name}
            </h1>
            {(engagement as any).client_name && (
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{(engagement as any).client_name}</div>
            )}
          </div>
          <MissionStatusBadge engagementId={engagement.id} />
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as TabKey)}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
                borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer",
                background: tab === key ? "rgba(255,255,255,0.07)" : "transparent",
                borderBottom: tab === key ? `2px solid ${GOLD}` : "2px solid transparent",
                color: tab === key ? TEXT : MUTED,
                fontSize: 13, fontWeight: tab === key ? 700 : 400,
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {label}
              {key === "sos" && <SosCount engagementId={engagement.id} />}
              {key === "signals" && <SignalCount engagementId={engagement.id} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <SosBanner engagementId={engagement.id} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "overview"     && <OverviewTab />}
        {tab === "library"      && <LibraryTab />}
        {tab === "briefing"     && <BriefingTab />}
        {tab === "assignments"  && <AssignmentsTab />}
        {tab === "team-updates" && <TeamUpdatesTab />}
        {tab === "decisions"    && <DecisionsTab />}
        {tab === "signals"      && <SignalsTab />}
        {tab === "sos"          && <SosTab />}
      </div>
    </div>
  );
}

// ── Helper badges ──────────────────────────────────────────────────
function MissionStatusBadge({ engagementId }: { engagementId: string }) {
  const [sections, setSections] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("heatmap_sections").select("status").eq("engagement_id", engagementId)
      .then(({ data }) => setSections(data ?? []));
  }, [engagementId]);
  const red = sections.filter(s => s.status === "Red").length;
  const yellow = sections.filter(s => s.status === "Yellow" || s.status === "Orange").length;
  const color = red > 0 ? "#ef4444" : yellow > 0 ? "#f59e0b" : "#22c55e";
  const label = red > 0 ? `${red} Red` : yellow > 0 ? `${yellow} Yellow` : "On Track";
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, padding: "4px 12px", borderRadius: 20 }}>
      {label}
    </span>
  );
}

function SosCount({ engagementId }: { engagementId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    supabase.from("sos_alerts").select("id", { count: "exact", head: true })
      .eq("engagement_id", engagementId).neq("status", "Resolved")
      .then(({ count }) => setN(count ?? 0));
  }, [engagementId]);
  if (!n) return null;
  return <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px", marginLeft: 2 }}>{n}</span>;
}

function SignalCount({ engagementId }: { engagementId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    supabase.from("risks").select("id", { count: "exact", head: true })
      .eq("engagement_id", engagementId).in("status", ["Open", "Monitoring"])
      .then(({ count }) => setN(count ?? 0));
  }, [engagementId]);
  if (!n) return null;
  return <span style={{ background: "#f59e0b", color: "#000", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px", marginLeft: 2 }}>{n}</span>;
}

// ═══════════════════════════════════════════
// TAB 1: OVERVIEW
// ═══════════════════════════════════════════
function OverviewTab() {
  const { engagement, member, isLeadership } = useEngagement();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [huddles, setHuddles] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  useEffect(() => {
    if (!engagement) return;
    const eid = engagement.id;
    Promise.all([
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5),
      supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(10),
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
    ]).then(([b, h, s]) => {
      setBroadcasts(b.data ?? []);
      setHuddles(h.data ?? []);
      setSections(s.data ?? []);
    });
  }, [engagement?.id]);

  if (!engagement) return null;
  const dead = (engagement as any).submission_date;
  const daysLeft = dead ? daysUntil(dead) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Deadline strip */}
        {daysLeft !== null && (
          <div style={{ background: daysLeft <= 7 ? "rgba(239,68,68,0.08)" : daysLeft <= 14 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${daysLeft <= 7 ? "rgba(239,68,68,0.3)" : daysLeft <= 14 ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.2)"}`, borderRadius: 10, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <Clock style={{ width: 18, height: 18, color: daysLeft <= 7 ? "#ef4444" : daysLeft <= 14 ? "#f59e0b" : "#22c55e" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{daysLeft <= 0 ? "SUBMISSION PAST DUE" : `${daysLeft} days to submission`}</div>
              <div style={{ fontSize: 11, color: MUTED }}>Due {new Date(dead).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            </div>
          </div>
        )}

        {/* Section health grid */}
        <Panel title="Section Health">
          {sections.length === 0 ? <Empty text="No sections yet" /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {sections.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: HEALTH[s.status] ?? "#64748b", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.section_name}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{s.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* IRIS strategic feed */}
        <StrategicIntelFeed engagementId={engagement.id} />

        {/* Recent team updates */}
        <Panel title="Recent Team Updates">
          {huddles.length === 0 ? <Empty text="No updates yet" /> : huddles.slice(0, 5).map(h => (
            <Row key={h.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH[h.health] ?? "#64748b", flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{h.submitter_name}</span>
                  <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>{relativeTime(h.created_at)}</span>
                  {h.leadership_needed && <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginLeft: 8 }}>NEEDS LEAD</span>}
                </div>
              </div>
              {h.risk && <div style={{ fontSize: 12, color: MUTED, marginTop: 4, paddingLeft: 18 }}>{h.risk}</div>}
            </Row>
          ))}
        </Panel>
      </div>

      {/* Right */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Broadcasts */}
        <Panel title="Leadership Messages">
          {broadcasts.length === 0 ? <Empty text="No messages" /> : broadcasts.map(b => (
            <Row key={b.id}>
              {b.pinned && <span style={{ fontSize: 9, fontWeight: 800, color: GOLD, letterSpacing: "0.1em" }}>PINNED  </span>}
              <div style={{ fontSize: 13, color: TEXT }}>{b.content}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{b.author_name} · {relativeTime(b.created_at)}</div>
            </Row>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 2: LIBRARY
// ═══════════════════════════════════════════
const LIB_CATS = ["RFP","Amendment","Q&A","Research","Competitive","Contacts","Deliverables","Other"] as const;
type LibCat = typeof LIB_CATS[number];

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name)) return file.text();
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc2 = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = await Promise.all(Array.from({ length: Math.min(doc2.numPages, 40) }, async (_, i) => {
      const p = await doc2.getPage(i + 1);
      return (await p.getTextContent()).items.map((x: any) => x.str ?? "").join(" ");
    }));
    await doc2.destroy();
    return pages.join("\n");
  }
  return "";
}

function LibraryTab() {
  const { engagement, member, isLeadership, canEdit } = useEngagement();
  const { user } = useSession();
  const canWrite = canEdit("briefing");
  const [docs, setDocs] = useState<any[]>([]);
  const [cat, setCat] = useState<LibCat>("RFP");
  const [filterCat, setFilterCat] = useState<string>("All");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hgRefresh, setHgRefresh] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(eid: string) {
    const { data } = await supabase.from("intel_documents").select("*").eq("engagement_id", eid).order("created_at", { ascending: false });
    setDocs(data ?? []);
  }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function runAnalyze(it: any) {
    if (!engagement || !it.file_path) { toast.error("Analysis needs an uploaded file."); return; }
    setAnalyzingId(it.id);
    try {
      const { data: signed } = await supabase.storage.from("intel-files").createSignedUrl(it.file_path, 120);
      if (!signed) throw new Error("Could not access file");
      const blob = await (await fetch(signed.signedUrl)).blob();
      const f2 = new File([blob], it.name || "rfp", { type: blob.type });
      toast.info("Extracting text…");
      const text = await extractTextFromFile(f2);
      if (!text || text.trim().length < 50) throw new Error("Not enough text extracted.");
      toast.info("Running analysis…");
      const result = await analyzeOpportunity({ data: { engagementId: engagement.id, documentId: it.id, fileName: it.name, text } }) as any;
      toast.success("Briefing Book updated");
      if (result?.deadlineUpdated?.to) toast.success(`Deadline set: ${result.deadlineUpdated.to}`);
      setHgRefresh(n => n + 1);
      if (isLeadership) {
        toast.info("Auto-researching all intelligence categories…");
        (async () => {
          let runId: string | null = null;
          try {
            const run = await startHolyGrailRun({ data: { engagementId: engagement.id } }) as any;
            runId = run?.id ?? null;
            for (const c of ["market","political","competitive","customer","provider","community"] as const) {
              try { await analyzeCategory({ data: { engagementId: engagement.id, category: c, runId: runId ?? undefined, force: false } }); setHgRefresh(n => n+1); }
              catch (e: any) { console.warn(`${c} failed:`, e?.message); }
            }
            if (runId) await finishHolyGrailRun({ data: { runId, status: "done" } });
            toast.success("Full intelligence ready — check Briefing Book");
            setHgRefresh(n => n + 1);
          } catch (e: any) {
            toast.error(`Research failed: ${e?.message ?? "unknown"}`);
            if (runId) try { await finishHolyGrailRun({ data: { runId, status: "failed", error: (e as any)?.message } }); } catch {}
          }
        })();
      }
    } catch (err: any) { toast.error(err?.message ?? "Analysis failed"); }
    finally { setAnalyzingId(null); }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    const finalName = name.trim() || file?.name?.trim() || "";
    if (!finalName) return toast.error("Name required");
    if (!file) return toast.error("Select a file");
    setUploading(true);
    try {
      const path = `${engagement.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("intel-files").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("intel_documents").insert({ engagement_id: engagement.id, name: finalName, category: cat, file_path: path, notes: notes || null, uploaded_by: user.id, uploader_name: member.display_name });
      if (error) throw error;
      if (cat === "RFP" || cat === "Amendment") {
        toast.success("Uploaded — starting Briefing Book analysis…");
        await load(engagement.id);
        const { data: newDoc } = await supabase.from("intel_documents").select("*").eq("engagement_id", engagement.id).eq("file_path", path).maybeSingle();
        setName(""); setNotes(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
        if (newDoc) runAnalyze(newDoc);
      } else {
        toast.success("Added to Library");
        setName(""); setNotes(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
        load(engagement.id);
      }
    } catch (err: any) { toast.error(err?.message ?? "Upload failed"); }
    finally { setUploading(false); }
  }

  async function openDoc(it: any) {
    if (it.url) return window.open(it.url, "_blank", "noopener");
    if (it.file_path) {
      const { data } = await supabase.storage.from("intel-files").createSignedUrl(it.file_path, 600);
      if (data) window.open(data.signedUrl, "_blank", "noopener");
    }
  }

  const visible = useMemo(() => filterCat === "All" ? docs : docs.filter(d => d.category === filterCat), [docs, filterCat]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: canWrite ? "1fr 300px" : "1fr", gap: 28 }}>
      {/* Document list */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {["All", ...LIB_CATS].map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: filterCat === c ? GOLD : BORDER, color: filterCat === c ? GOLD : MUTED, background: filterCat === c ? "rgba(196,154,42,0.08)" : "transparent" }}>{c}</button>
          ))}
        </div>
        {visible.length === 0 ? (
          <Empty text={docs.length === 0 ? "No documents yet — upload the RFP to get started" : `No ${filterCat} documents`} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map(it => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: BG2, border: `1px solid ${BORDER}` }}>
                <FileText style={{ width: 18, height: 18, color: MUTED, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{it.category} · {it.uploader_name} · {relativeTime(it.created_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {(it.category === "RFP" || it.category === "Amendment") && it.file_path && (
                    <button onClick={() => runAnalyze(it)} disabled={!!analyzingId} style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      {analyzingId === it.id ? <><Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />Analyzing</> : <><Sparkles style={{ width: 10, height: 10 }} />Analyze</>}
                    </button>
                  )}
                  <button onClick={() => openDoc(it)} style={{ fontSize: 11, color: MUTED, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                    {it.url ? <ExternalLink style={{ width: 12, height: 12 }} /> : <Download style={{ width: 12, height: 12 }} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Upload form */}
      {canWrite && (
        <div>
          <Panel title="Add Document">
            <form onSubmit={upload} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <Label style={{ fontSize: 11 }}>Category</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {LIB_CATS.map(c => (
                    <button key={c} type="button" onClick={() => setCat(c)} style={{ padding: "3px 10px", borderRadius: 14, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: cat === c ? GOLD : BORDER, color: cat === c ? GOLD : MUTED, background: cat === c ? "rgba(196,154,42,0.08)" : "transparent" }}>{c}</button>
                  ))}
                </div>
              </div>
              <div><Label style={{ fontSize: 11 }}>Name (optional)</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Defaults to filename" className="mt-1" /></div>
              <div>
                <Label style={{ fontSize: 11 }}>File</Label>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.xlsx,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginTop: 4, fontSize: 12, color: MUTED, width: "100%" }} />
              </div>
              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="mr-2 h-4 w-4" />{(cat === "RFP" || cat === "Amendment") ? "Upload & Analyze" : "Add to Library"}</>}
              </Button>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 3: BRIEFING BOOK
// ═══════════════════════════════════════════
function BriefingTab() {
  const { engagement, isLeadership } = useEngagement();
  if (!engagement) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Briefing Book</h2>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>IRIS-generated intelligence. Updates automatically when the Library changes.</p>
      </div>
      <RfpStructuredPanel engagementId={engagement.id} canEdit={isLeadership} />
      <div style={{ marginTop: 24 }}>
        <HolyGrailPanel engagementId={engagement.id} isLeadership={isLeadership} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 4: ASSIGNMENTS
// ═══════════════════════════════════════════
function AssignmentsTab() {
  const { engagement, member, isLeadership } = useEngagement();
  const [sections, setSections] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  async function load(eid: string) {
    const [s, a, m] = await Promise.all([
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
      supabase.from("section_assignments").select("*, engagement_members(display_name, role)").eq("engagement_id", eid),
      supabase.from("engagement_members").select("id, display_name, role").eq("engagement_id", eid),
    ]);
    setSections(s.data ?? []);
    setAssignments(a.data ?? []);
    setMembers((m.data ?? []).filter((x: any) => ["writer","sme","engagement_lead","lead","pm","founder"].includes(x.role)));
  }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function updateStatus(sectionId: string, status: string) {
    setSaving(sectionId);
    await supabase.from("heatmap_sections").update({ status, updated_at: new Date().toISOString() }).eq("id", sectionId);
    if (engagement) await load(engagement.id);
    setSaving(null);
  }

  if (!engagement) return null;
  const myAssignments = member ? assignments.filter(a => a.engagement_members && (a.member_id === member.id || (isLeadership))) : assignments;
  const sectionAssignMap: Record<string, any> = {};
  assignments.forEach(a => { if (!sectionAssignMap[a.section_id]) sectionAssignMap[a.section_id] = []; sectionAssignMap[a.section_id].push(a); });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Assignments</h2>
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{sections.length} sections · {assignments.length} assignments</p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map(s => {
          const assigns = sectionAssignMap[s.id] ?? [];
          return (
            <div key={s.id} style={{ padding: "14px 18px", borderRadius: 10, background: BG2, border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: HEALTH[s.status] ?? "#64748b", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{s.section_name}</div>
                  {assigns.length > 0 && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {assigns.map((a: any) => a.engagement_members?.display_name ?? "—").join(", ")}
                    </div>
                  )}
                  {s.notes && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{s.notes}</div>}
                </div>
                {isLeadership && (
                  <select value={s.status} onChange={e => updateStatus(s.id, e.target.value)} disabled={saving === s.id}
                    style={{ fontSize: 11, fontWeight: 700, color: HEALTH[s.status] ?? MUTED, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
                    {["Green","Yellow","Orange","Red","N/A"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: `${HEALTH[s.status] ?? "#64748b"}18`, color: HEALTH[s.status] ?? "#64748b" }}>{s.status}</div>
              </div>
            </div>
          );
        })}
        {sections.length === 0 && <Empty text="No sections yet. Add sections in the Library after uploading the RFP." />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 5: TEAM UPDATES
// ═══════════════════════════════════════════
function TeamUpdatesTab() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [health, setHealth] = useState("Green");
  const [priority, setPriority] = useState("On Track");
  const [notes, setNotes] = useState("");
  const [leadershipNeeded, setLeadershipNeeded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(30);
    setItems(data ?? []);
  }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    setSubmitting(true);
    const { error } = await supabase.from("huddles").insert({ engagement_id: engagement.id, submitted_by: user.id, submitter_name: member.display_name, health, priority, notes: notes || null, leadership_needed: leadershipNeeded });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Update submitted");
    setNotes(""); setLeadershipNeeded(false); setHealth("Green"); setPriority("On Track");
    load(engagement.id);
  }

  if (!engagement) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 16px" }}>Team Updates</h2>
        {items.length === 0 ? <Empty text="No updates yet" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(h => (
              <div key={h.id} style={{ padding: "14px 16px", borderRadius: 10, background: BG2, border: `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: h.notes ? 6 : 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: HEALTH[h.health] ?? "#64748b" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{h.submitter_name}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>{h.priority}</span>
                  {h.leadership_needed && <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginLeft: 4 }}>NEEDS LEAD</span>}
                  <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>{relativeTime(h.created_at)}</span>
                </div>
                {h.notes && <div style={{ fontSize: 12, color: MUTED, paddingLeft: 20 }}>{h.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Panel title="Submit Update">
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Label style={{ fontSize: 11 }}>Status</Label>
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {["Green","Yellow","Red"].map(v => (
                  <button key={v} type="button" onClick={() => setHealth(v)} style={{ padding: "3px 10px", borderRadius: 14, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: health === v ? HEALTH[v] : BORDER, color: health === v ? HEALTH[v] : MUTED, background: health === v ? `${HEALTH[v]}15` : "transparent" }}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Priority</Label>
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {["On Track","Pushing Hard","At Risk","Blocked"].map(v => (
                  <button key={v} type="button" onClick={() => setPriority(v)} style={{ padding: "3px 10px", borderRadius: 14, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: priority === v ? GOLD : BORDER, color: priority === v ? GOLD : MUTED, background: priority === v ? "rgba(196,154,42,0.08)" : "transparent" }}>{v}</button>
                ))}
              </div>
            </div>
            <div><Label style={{ fontSize: 11 }}>Notes / blockers</Label><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you work on? Any blockers?" className="mt-1 resize-none" /></div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: MUTED, cursor: "pointer" }}>
              <input type="checkbox" checked={leadershipNeeded} onChange={e => setLeadershipNeeded(e.target.checked)} />
              Needs leadership attention
            </label>
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit Update"}</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 6: DECISION LOG
// ═══════════════════════════════════════════
function DecisionsTab() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState(""); const [rationale, setRationale] = useState(""); const [areas, setAreas] = useState(""); const [status, setStatus] = useState("Final"); const [date, setDate] = useState(new Date().toISOString().split("T")[0]); const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) { const { data } = await supabase.from("decisions").select("*").eq("engagement_id", eid).order("decision_date", { ascending: false }); setItems(data ?? []); }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !title.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("decisions").insert({ engagement_id: engagement.id, title: title.trim(), owner_name: member.display_name, rationale: rationale || null, impacted_areas: areas || null, status, decision_date: date, created_by: user.id });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Decision logged"); setTitle(""); setRationale(""); setAreas("");
    load(engagement.id);
  }

  if (!engagement) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: isLeadership ? "1fr 320px" : "1fr", gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 16px" }}>Decision Log</h2>
        {items.length === 0 ? <Empty text="No decisions logged yet" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(d => (
              <div key={d.id} style={{ padding: "14px 16px", borderRadius: 10, background: BG2, border: `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <CheckCircle style={{ width: 16, height: 16, color: d.status === "Final" ? "#22c55e" : "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{d.title}</div>
                    {d.rationale && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{d.rationale}</div>}
                    {d.impacted_areas && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Impacts: {d.impacted_areas}</div>}
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{d.owner_name} · {d.decision_date} · {d.status}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isLeadership && (
        <Panel title="Log Decision">
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><Label style={{ fontSize: 11 }}>Decision</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was decided?" className="mt-1" /></div>
            <div><Label style={{ fontSize: 11 }}>Rationale</Label><Textarea rows={2} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Why this call?" className="mt-1 resize-none" /></div>
            <div><Label style={{ fontSize: 11 }}>Impacted areas</Label><Input value={areas} onChange={e => setAreas(e.target.value)} placeholder="e.g. Pricing, staffing" className="mt-1" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Label style={{ fontSize: 11 }}>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
              <div><Label style={{ fontSize: 11 }}>Status</Label>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {["Final","Pending","Revisited"].map(v => <button key={v} type="button" onClick={() => setStatus(v)} style={{ padding: "3px 8px", borderRadius: 12, border: "1px solid", fontSize: 10, fontWeight: 600, cursor: "pointer", borderColor: status === v ? GOLD : BORDER, color: status === v ? GOLD : MUTED, background: status === v ? "rgba(196,154,42,0.08)" : "transparent" }}>{v}</button>)}
                </div>
              </div>
            </div>
            <Button type="submit" disabled={submitting || !title.trim()}>{submitting ? "Saving…" : "Log Decision"}</Button>
          </form>
        </Panel>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 7: SIGNALS
// ═══════════════════════════════════════════
function SignalsTab() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [risks, setRisks] = useState<any[]>([]);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [sev, setSev] = useState("Yellow"); const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) { const { data } = await supabase.from("risks").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }); setRisks(data ?? []); }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !title.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("risks").insert({ engagement_id: engagement.id, title: title.trim(), description: desc || null, severity: sev, status: "Open", owner_name: member.display_name, created_by: user.id });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Signal logged"); setTitle(""); setDesc("");
    load(engagement.id);
  }

  async function resolve(id: string) {
    await supabase.from("risks").update({ status: "Resolved" }).eq("id", id);
    if (engagement) load(engagement.id);
  }

  if (!engagement) return null;
  const open = risks.filter(r => r.status !== "Resolved");
  const resolved = risks.filter(r => r.status === "Resolved");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 16px" }}>Signals <span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}>· {open.length} open</span></h2>
        {open.length === 0 ? <Empty text="No open signals" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {open.map(r => (
              <div key={r.id} style={{ padding: "14px 16px", borderRadius: 10, background: BG2, border: `1px solid ${r.severity === "Red" || r.severity === "High" || r.severity === "Critical" ? "rgba(239,68,68,0.25)" : BORDER}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <AlertCircle style={{ width: 16, height: 16, color: r.severity === "Red" || r.severity === "High" || r.severity === "Critical" ? "#ef4444" : "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{r.description}</div>}
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{r.owner_name} · {r.severity} · {relativeTime(r.created_at)}</div>
                  </div>
                  {isLeadership && (
                    <button onClick={() => resolve(r.id)} style={{ fontSize: 11, color: "#22c55e", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>Resolve</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {resolved.length > 0 && (
          <div style={{ marginTop: 20, opacity: 0.4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", marginBottom: 8 }}>RESOLVED ({resolved.length})</div>
            {resolved.map(r => <div key={r.id} style={{ fontSize: 12, color: MUTED, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>{r.title}</div>)}
          </div>
        )}
      </div>
      <Panel title="Raise a Signal™">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div><Label style={{ fontSize: 11 }}>Signal</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you seeing?" className="mt-1" /></div>
          <div><Label style={{ fontSize: 11 }}>Details</Label><Textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Context, impact, timeline" className="mt-1 resize-none" /></div>
          <div><Label style={{ fontSize: 11 }}>Severity</Label>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {["Yellow","Orange","Red"].map(v => <button key={v} type="button" onClick={() => setSev(v)} style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: sev === v ? HEALTH[v] : BORDER, color: sev === v ? HEALTH[v] : MUTED, background: sev === v ? `${HEALTH[v]}15` : "transparent" }}>{v}</button>)}
            </div>
          </div>
          <Button type="submit" disabled={submitting || !title.trim()}>{submitting ? "Submitting…" : "Raise Signal"}</Button>
        </form>
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB 8: SOS
// ═══════════════════════════════════════════
function SosTab() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [desc, setDesc] = useState(""); const [needed, setNeeded] = useState(""); const [sev, setSev] = useState("Orange"); const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) { const { data } = await supabase.from("sos_alerts").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(20); setItems(data ?? []); }
  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !desc.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("sos_alerts").insert({ engagement_id: engagement.id, description: desc.trim(), what_is_needed: needed || null, severity: sev, status: "Open", submitter_id: user.id, submitter_name: member.display_name });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Escalation raised — leadership has been notified"); setDesc(""); setNeeded("");
    load(engagement.id);
  }

  if (!engagement) return null;
  const open = items.filter(i => i.status !== "Resolved");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 28px" }}>
      <div style={{ marginBottom: 20, padding: "16px 20px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>SOS — Urgent Escalation Only</div>
        <div style={{ fontSize: 12, color: MUTED }}>Use SOS when you need immediate leadership intervention. For non-urgent concerns, use Signals.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
        <div>
          {open.length === 0 ? <Empty text="No open escalations" /> : open.map(s => (
            <div key={s.id} style={{ padding: "16px", borderRadius: 10, background: BG2, border: "1px solid rgba(239,68,68,0.25)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Siren style={{ width: 16, height: 16, color: "#ef4444" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{s.severity} · {s.status}</span>
                <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>{relativeTime(s.created_at)}</span>
              </div>
              <div style={{ fontSize: 13, color: TEXT, marginBottom: s.what_is_needed ? 6 : 0 }}>{s.description}</div>
              {s.what_is_needed && <div style={{ fontSize: 12, color: MUTED }}>Needs: {s.what_is_needed}</div>}
              <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>Raised by {s.submitter_name}</div>
            </div>
          ))}
        </div>
        <Panel title="Raise SOS">
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><Label style={{ fontSize: 11 }}>What happened?</Label><Textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the urgent situation" className="mt-1 resize-none" /></div>
            <div><Label style={{ fontSize: 11 }}>What is needed?</Label><Textarea rows={2} value={needed} onChange={e => setNeeded(e.target.value)} placeholder="What do you need leadership to do?" className="mt-1 resize-none" /></div>
            <div><Label style={{ fontSize: 11 }}>Severity</Label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {["Orange","Red"].map(v => <button key={v} type="button" onClick={() => setSev(v)} style={{ padding: "3px 12px", borderRadius: 12, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: sev === v ? HEALTH[v] : BORDER, color: sev === v ? HEALTH[v] : MUTED, background: sev === v ? `${HEALTH[v]}15` : "transparent" }}>{v}</button>)}
              </div>
            </div>
            <Button type="submit" disabled={submitting || !desc.trim()} className="bg-red-600 hover:bg-red-700 text-white">{submitting ? "Raising…" : "Raise SOS"}</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────────
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>{title}</div>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: MUTED }}>{text}</div>;
}
