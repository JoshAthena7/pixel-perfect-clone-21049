import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Trash2, Loader2, Filter, Sparkles, ShieldCheck, ShieldAlert, Shield, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { DOC_TYPES, extractComplianceRequirements, checkDraftCompliance, setRequirementStatus, deleteComplianceDocument } from "@/lib/ai/compliance.functions";

export const Route = createFileRoute("/_authenticated/engagement/$id/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Athena" }] }),
  component: CompliancePage,
});

type Doc = {
  id: string;
  name: string;
  doc_type: string;
  source: string | null;
  page_count: number | null;
  requirement_count: number;
  created_at: string;
};

type Req = {
  id: string;
  document_id: string;
  requirement_text: string;
  section_reference: string | null;
  requirement_type: string | null;
  status: "Not Mapped" | "Addressed" | "Partial" | "Gap";
  addressed_in_sections: string[];
  ai_quote: string | null;
  ai_explanation: string | null;
  last_checked_at: string | null;
};

function statusColor(s: Req["status"]) {
  return s === "Addressed"
    ? "bg-emerald-500"
    : s === "Partial"
      ? "bg-amber-500"
      : s === "Gap"
        ? "bg-red-500"
        : "bg-muted-foreground/40";
}

function boldKeyword(text: string) {
  return text.replace(/\b(SHALL NOT|MUST NOT|SHALL|MUST|REQUIRED|PROHIBITED)\b/g, "<strong>$1</strong>");
}

function CompliancePage() {
  const { id: engagementId } = Route.useParams();
  const { engagement, isLeadership, switchEngagement } = useEngagement();
  const { user } = useSession();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [sections, setSections] = useState<{ id: string; section_name: string }[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    if (engagementId && engagement?.id !== engagementId) switchEngagement(engagementId);
  }, [engagementId, engagement?.id, switchEngagement]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: r }, { data: s }] = await Promise.all([
      supabase
        .from("compliance_documents")
        .select("id, name, doc_type, source, page_count, requirement_count, created_at")
        .eq("engagement_id", engagementId)
        .order("created_at", { ascending: false }),
      supabase
        .from("compliance_requirements")
        .select("id, document_id, requirement_text, section_reference, requirement_type, status, addressed_in_sections, ai_quote, ai_explanation, last_checked_at")
        .eq("engagement_id", engagementId)
        .order("created_at"),
      supabase
        .from("heatmap_sections")
        .select("id, section_name")
        .eq("engagement_id", engagementId)
        .order("sort_order"),
    ]);
    setDocs((d as Doc[]) ?? []);
    setReqs((r as Req[]) ?? []);
    setSections((s as any[]) ?? []);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`compliance:${engagementId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "compliance_requirements", filter: `engagement_id=eq.${engagementId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "compliance_documents", filter: `engagement_id=eq.${engagementId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, engagementId]);

  const filteredReqs = useMemo(() => {
    let xs = reqs;
    if (activeDocId) xs = xs.filter((r) => r.document_id === activeDocId);
    if (gapsOnly) xs = xs.filter((r) => r.status === "Gap" || r.status === "Partial");
    return xs;
  }, [reqs, activeDocId, gapsOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, Req[]>();
    map.set("Unmapped", []);
    sections.forEach((s) => map.set(s.section_name, []));
    for (const r of filteredReqs) {
      const targets = r.addressed_in_sections.length ? r.addressed_in_sections : ["Unmapped"];
      for (const t of targets) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(r);
      }
    }
    return Array.from(map.entries()).filter(([, v]) => v.length > 0);
  }, [filteredReqs, sections]);

  const overallScore = useMemo(() => {
    const mapped = reqs.filter((r) => r.status !== "Not Mapped");
    if (!mapped.length) return 0;
    return Math.round((mapped.filter((r) => r.status === "Addressed").length / mapped.length) * 100);
  }, [reqs]);

  const scoreColor = overallScore >= 85 ? "bg-emerald-500" : overallScore >= 60 ? "bg-amber-500" : "bg-red-500";
  const scoreText = overallScore >= 85 ? "text-emerald-600" : overallScore >= 60 ? "text-amber-600" : "text-red-600";

  function sectionScore(name: string) {
    const rs = reqs.filter((r) => r.addressed_in_sections.includes(name));
    const mapped = rs.filter((r) => r.status !== "Not Mapped");
    if (!mapped.length) return null;
    return Math.round((mapped.filter((r) => r.status === "Addressed").length / mapped.length) * 100);
  }

  async function runCheck(sectionName: string) {
    const sec = sections.find((s) => s.section_name === sectionName);
    if (!sec) return;
    setRunning(sec.id);
    try {
      const res = (await checkDraftCompliance({ data: { sectionId: sec.id } })) as any;
      toast.success(`Checked ${res.checked ?? 0} requirements`);
    } catch (e: any) {
      toast.error(e.message ?? "Compliance check failed");
    } finally {
      setRunning(null);
      load();
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/heatmap" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Compliance Matrix</h1>
            <p className="text-sm text-muted-foreground">{engagement?.name}</p>
          </div>
        </div>
        {isLeadership && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Document
              </Button>
            </DialogTrigger>
            <UploadDialog engagementId={engagementId} userId={user?.id} onDone={() => { setUploadOpen(false); load(); }} />
          </Dialog>
        )}
      </div>

      {/* Score bar */}
      <Card className="p-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overall Compliance</p>
            <p className={`text-3xl font-bold ${scoreText}`}>{overallScore}%</p>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            {reqs.filter((r) => r.status === "Addressed").length} addressed · {reqs.filter((r) => r.status === "Partial").length} partial · {reqs.filter((r) => r.status === "Gap").length} gap · {reqs.filter((r) => r.status === "Not Mapped").length} unmapped
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${scoreColor} transition-all`} style={{ width: `${overallScore}%` }} />
        </div>
      </Card>

      <div className="flex gap-4">
        {/* Left: documents */}
        <Card className="w-72 shrink-0 p-3 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Documents</p>
            <button
              onClick={() => setGapsOnly((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                gapsOnly ? "border-red-500/40 bg-red-500/10 text-red-600" : "border-border text-muted-foreground"
              }`}
            >
              <Filter className="h-3 w-3" /> Gaps
            </button>
          </div>
          <button
            onClick={() => setActiveDocId(null)}
            className={`w-full text-left rounded-md px-2 py-1.5 text-sm mb-1 ${!activeDocId ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
          >
            All documents ({docs.length})
          </button>
          {docs.map((d) => {
            const dr = reqs.filter((r) => r.document_id === d.id);
            const gaps = dr.filter((r) => r.status === "Gap").length;
            return (
              <div key={d.id} className="group flex items-center gap-1 mb-0.5">
                <button
                  onClick={() => setActiveDocId(d.id)}
                  className={`flex-1 text-left rounded-md px-2 py-1.5 text-sm ${activeDocId === d.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{d.name}</span>
                    {gaps > 0 && <Badge variant="destructive" className="h-4 text-[10px]">{gaps}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <Badge variant="outline" className="h-4 text-[9px]">{d.source ?? d.doc_type}</Badge>
                    <span>{d.requirement_count} reqs</span>
                  </div>
                </button>
                {isLeadership && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${d.name}" and its requirements?`)) return;
                      await deleteComplianceDocument({ data: { documentId: d.id } });
                      if (activeDocId === d.id) setActiveDocId(null);
                      load();
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          {docs.length === 0 && (
            <p className="text-xs text-muted-foreground italic px-2 py-4 text-center">No documents yet.</p>
          )}
        </Card>

        {/* Main: requirements */}
        <div className="flex-1 space-y-4">
          {loading ? (
            <Card className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></Card>
          ) : grouped.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {docs.length === 0 ? "Upload a compliance document to extract requirements." : "No requirements match the current filter."}
            </Card>
          ) : (
            grouped.map(([secName, rs]) => {
              const score = sectionScore(secName);
              const sec = sections.find((s) => s.section_name === secName);
              return (
                <Card key={secName} className="p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{secName}</h3>
                      <Badge variant="outline">{rs.length}</Badge>
                      {score !== null && (
                        <Badge className={score >= 85 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}>
                          {score}%
                        </Badge>
                      )}
                    </div>
                    {sec && isLeadership && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runCheck(secName)}
                        disabled={running === sec.id}
                      >
                        {running === sec.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Run AI Check
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {rs.map((r) => (
                      <RequirementRow key={r.id + secName} r={r} isLeadership={isLeadership} />
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function RequirementRow({ r, isLeadership }: { r: Req; isLeadership: boolean }) {
  const [status, setStatus] = useState(r.status);
  useEffect(() => setStatus(r.status), [r.status]);
  return (
    <div className="rounded-md border border-border bg-surface/60 p-3">
      <div className="flex items-start gap-2">
        <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${statusColor(r.status)}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {r.requirement_type && <Badge variant="outline" className="h-4 text-[9px]">{r.requirement_type}</Badge>}
            {r.section_reference && <span className="text-[10px] font-mono text-muted-foreground">{r.section_reference}</span>}
          </div>
          <p className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: boldKeyword(r.requirement_text) }} />
          {r.ai_quote && r.status === "Addressed" && (
            <div className="mt-2 rounded border-l-2 border-emerald-500 bg-emerald-500/5 pl-2 py-1">
              <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Found in draft</p>
              <p className="text-xs italic">"{r.ai_quote}"</p>
            </div>
          )}
          {r.ai_explanation && r.status !== "Addressed" && (
            <p className="mt-1 text-xs text-muted-foreground italic">AI: {r.ai_explanation}</p>
          )}
        </div>
        {isLeadership && (
          <Select
            value={status}
            onValueChange={async (v) => {
              setStatus(v as Req["status"]);
              try {
                await setRequirementStatus({ data: { requirementId: r.id, status: v as any } });
                toast.success("Updated");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Not Mapped">Not Mapped</SelectItem>
              <SelectItem value="Gap">Gap</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Addressed">Addressed</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function UploadDialog({ engagementId, userId, onDone }: { engagementId: string; userId?: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [source, setSource] = useState("");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<string>("");

  async function handleFile(f: File | null) {
    setFile(f);
    if (!f) return;
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    if (f.type === "text/plain" || f.name.endsWith(".txt") || f.name.endsWith(".md")) {
      const t = await f.text();
      setRawText(t);
    }
  }

  async function submit() {
    if (!name || !rawText.trim() || rawText.trim().length < 20) {
      toast.error("Provide a name and the document text (paste at least 20 chars).");
      return;
    }
    setSubmitting(true);
    setStage("Saving document...");
    try {
      let filePath: string | null = null;
      if (file) {
        filePath = `${engagementId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("compliance-docs").upload(filePath, file);
        if (upErr) console.warn("upload skipped:", upErr.message);
      }
      const { data: doc, error } = await supabase
        .from("compliance_documents")
        .insert({
          engagement_id: engagementId,
          name,
          doc_type: docType,
          source: source || null,
          file_path: filePath,
          uploaded_by: userId ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      setStage("Analyzing document · Extracting SHALL statements · Mapping to sections...");
      const res = (await extractComplianceRequirements({
        data: { documentId: (doc as any).id, rawText: rawText.slice(0, 180000) },
      })) as any;
      toast.success(`Extracted ${res.inserted ?? 0} requirements`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSubmitting(false);
      setStage("");
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Add Compliance Document</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="TX HHSC Contract Template v3.2" />
          </div>
          <div>
            <Label>Source</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="TX HHSC, CMS, 42 CFR 438..." />
          </div>
          <div className="col-span-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>File (optional — .txt/.md auto-loads, others need pasted text below)</Label>
          <Input type="file" accept=".txt,.md,.pdf,.docx" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <Label>Document Text</Label>
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the full document text here. Large documents are chunked automatically (up to ~180k chars)."
            className="min-h-[240px] font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-1">{rawText.length.toLocaleString()} characters</p>
        </div>
        {stage && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> {stage}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Extract Requirements
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
