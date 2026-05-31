import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import {
  FileText,
  LinkIcon,
  Upload,
  Download,
  ExternalLink,
  Sparkles,
  Loader2,
  Target,
  Landmark,
  Swords,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { HolyGrailPanel } from "@/components/war-room/HolyGrailPanel";
import {
  analyzeOpportunity,
  analyzeCategory,
  startHolyGrailRun,
  finishHolyGrailRun,
} from "@/lib/ai/holy-grail.functions";
import { logActivity } from "@/lib/activity-log";
import { PageGate } from "@/components/war-room/PageGate";
import { EnvironmentBanner } from "@/components/war-room/EnvironmentBanner";
import { RfpStructuredPanel } from "@/components/war-room/RfpStructuredPanel";

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type.startsWith("text/") || /\.(txt|md|csv|rtf)$/i.test(file.name)) return file.text();
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const pageCount = Math.min(doc.numPages, 40);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, async (_, i) => {
        const page = await doc.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items.map((item: any) => item.str ?? "").join(" ");
      }),
    );
    await doc.destroy();
    return pages.join("\n");
  }
  return "";
}

export const Route = createFileRoute("/_authenticated/intel")({
  head: () => ({ meta: [{ title: "Intelligence Vault — Athena Command" }] }),
  component: () => (
    <PageGate page="briefing">
      <MissionBriefingPage />
    </PageGate>
  ),
});

const CATEGORIES = [
  "RFP",
  "Amendment",
  "Q&A",
  "Client Doc",
  "Research",
  "Competitive",
  "Past Performance",
  "Terminology",
  "Other",
] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * Briefing tab definitions per PROMPT-2 spec.
 * Each tab maps to a set of intel categories so the library auto-filters
 * to the relevant subset, plus optional inline panels.
 */
const BRIEFING_TABS = [
  {
    key: "rfp",
    label: "The Opportunity",
    icon: Target,
    categories: ["RFP", "Amendment", "Q&A", "Past Performance"] as Category[],
    blurb: "The opportunity itself — the RFP, amendments, procurement history, evaluation criteria, and compliance requirements.",
  },
  {
    key: "state",
    label: "State & Community",
    icon: Landmark,
    categories: ["Client Doc", "Research"] as Category[],
    blurb: "Everything about the state — priorities, political climate, agency leadership, program history, and community context.",
  },
  {
    key: "competitor",
    label: "The Competition",
    icon: Swords,
    categories: ["Competitive"] as Category[],
    blurb: "Who else is competing and what they're likely to do. Known competitors, strengths, weaknesses, and pricing strategy.",
  },
  {
    key: "strategic",
    label: "Our Strategy",
    icon: Lightbulb,
    categories: [] as Category[],
    blurb: "The strategic 'so what' — what the intelligence means for how we position and win this engagement.",
  },
] as const;
type TabKey = (typeof BRIEFING_TABS)[number]["key"];

function MissionBriefingPage() {
  const { engagement, member, isLeadership, canEdit } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("rfp");

  const canWriteBriefing = canEdit("briefing");

  const [mode, setMode] = useState<"file" | "url">("file");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("RFP");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hgRefresh, setHgRefresh] = useState(0);

  // When the active tab changes, default the upload category to the first
  // category for that tab (if any) so leadership uploads into the right bucket.
  useEffect(() => {
    const active = BRIEFING_TABS.find((t) => t.key === tab);
    if (active && active.categories.length > 0 && !active.categories.includes(category)) {
      setCategory(active.categories[0]);
    }
  }, [tab]);

  async function runAnalyze(it: any) {
    if (!engagement || !it.file_path) {
      toast.error("Holy Grail analysis needs an uploaded file (PDF/DOCX/TXT).");
      return;
    }
    setAnalyzingId(it.id);
    try {
      const { data: signed, error: sErr } = await supabase.storage
        .from("intel-files")
        .createSignedUrl(it.file_path, 120);
      if (sErr || !signed) throw new Error(sErr?.message ?? "Could not access file");
      const resp = await fetch(signed.signedUrl);
      const blob = await resp.blob();
      const f = new File([blob], it.name || "rfp", { type: blob.type });
      toast.info("Extracting text…");
      const text = await extractTextFromFile(f);
      if (!text || text.trim().length < 50) throw new Error("Could not extract enough text from this file.");
      toast.info("Running Holy Grail analysis…");
      const result = (await analyzeOpportunity({
        data: { engagementId: engagement.id, documentId: it.id, fileName: it.name, text },
      })) as any;
      toast.success("Opportunity ready");
      if (result?.deadlineUpdated?.to) {
        toast.success(
          result.deadlineUpdated.from
            ? `Deadline updated from RFP: ${result.deadlineUpdated.from} → ${result.deadlineUpdated.to}`
            : `Deadline auto-populated from RFP: ${result.deadlineUpdated.to}`,
        );
      }
      setHgRefresh((n) => n + 1);

      if (isLeadership) {
        toast.info("Auto-researching market, political, competitive, customer, provider, community…");
        (async () => {
          let runId: string | null = null;
          try {
            const run = (await startHolyGrailRun({ data: { engagementId: engagement.id } })) as any;
            runId = run?.id ?? null;
            const cats = ["market", "political", "competitive", "customer", "provider", "community"] as const;
            for (const cat of cats) {
              try {
                await analyzeCategory({
                  data: { engagementId: engagement.id, category: cat, runId: runId ?? undefined, force: false },
                });
                setHgRefresh((n) => n + 1);
              } catch (e: any) {
                console.warn(`Holy Grail ${cat} failed:`, e?.message);
              }
            }
            if (runId) await finishHolyGrailRun({ data: { runId, status: "done" } });
            toast.success("Full Holy Grail intelligence ready");
            setHgRefresh((n) => n + 1);
          } catch (e: any) {
            toast.error(`Auto-research failed: ${e?.message ?? "unknown"}`);
            if (runId) try { await finishHolyGrailRun({ data: { runId, status: "failed", error: e?.message } }); } catch {}
          }
        })();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function load(eid: string) {
    const { data } = await supabase
      .from("intel_documents")
      .select("*")
      .eq("engagement_id", eid)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => {
    if (engagement) load(engagement.id);
  }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    const finalName = name.trim() || file?.name?.trim() || "";
    if (!finalName) return toast.error("Name required");
    if (mode === "file" && !file) return toast.error("Select a file");
    if (mode === "url" && !url.trim()) return toast.error("URL required");

    setUploading(true);
    let file_path: string | null = null;
    let linkUrl: string | null = mode === "url" ? url.trim() : null;

    try {
      if (mode === "file" && file) {
        const path = `${engagement.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("intel-files").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        file_path = path;
      }
      const { error } = await supabase.from("intel_documents").insert({
        engagement_id: engagement.id,
        name: finalName,
        category,
        url: linkUrl,
        file_path,
        notes: notes || null,
        uploaded_by: user.id,
        uploader_name: member.display_name,
      });
      if (error) throw error;
      toast.success("Added to briefing");
      setName("");
      setUrl("");
      setNotes("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load(engagement.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openItem(it: any) {
    if (engagement && member) {
      logActivity({
        engagementId: engagement.id,
        userId: user?.id ?? null,
        actorName: member.display_name,
        action: "view_intel_document",
        targetTable: "intel_documents",
        targetId: it.id,
        metadata: { name: it.name, category: it.category },
      });
    }
    if (it.url) return window.open(it.url, "_blank", "noopener");
    if (it.file_path) {
      const { data, error } = await supabase.storage.from("intel-files").createSignedUrl(it.file_path, 60 * 10);
      if (error || !data) return toast.error(error?.message ?? "Could not get link");
      window.open(data.signedUrl, "_blank", "noopener");
    }
  }

  const activeTab = BRIEFING_TABS.find((t) => t.key === tab)!;
  const visible = useMemo(() => {
    return items.filter((it) => {
      if (activeTab.categories.length > 0 && !activeTab.categories.includes(it.category)) return false;
      if (search && !`${it.name} ${it.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, activeTab, search]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mission Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The shared environment around this opportunity — everything the team needs to write with confidence.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          {BRIEFING_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(" ")[0]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {BRIEFING_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-6">
            <p className="mb-4 text-sm text-muted-foreground">{t.blurb}</p>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* RFP tab: structured RFP data + full Holy Grail panel */}
              {t.key === "rfp" && engagement && (
                <div className="lg:col-span-5 space-y-4">
                  <RfpStructuredPanel engagementId={engagement.id} canEdit={canWriteBriefing} />
                  <HolyGrailPanel
                    engagementId={engagement.id}
                    refreshKey={hgRefresh}
                    isLeadership={isLeadership}
                  />
                </div>
              )}

              {/* Win Themes tab: full themes panel, no library */}
              {(t.key as string) === "win-themes" && engagement && (
                <div className="lg:col-span-5 space-y-4">
                  <Card className="border-border bg-surface p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold">Win Themes</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Confirmed themes drive section writing. Map themes to RFP questions to seed writer hints.
                        </p>
                      </div>
                      <Button variant="outline" asChild>
                        <a href="/win-themes">Open Win Themes editor</a>
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Library (file/link list) — shown on every tab except Win Themes */}
              {(t.key as string) !== "win-themes" && (
                <>
                  {canWriteBriefing && (
                    <Card className="border-border bg-surface p-6 lg:col-span-2">
                      <h2 className="text-base font-semibold">Add to {t.label}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Files or links — they'll appear in the {t.label} list to the right.
                      </p>

                      <div className="mt-4 inline-flex rounded-md border border-border p-0.5">
                        <button
                          type="button"
                          onClick={() => setMode("file")}
                          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                            mode === "file"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Upload className="h-3.5 w-3.5" /> File
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("url")}
                          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                            mode === "url"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <LinkIcon className="h-3.5 w-3.5" /> Link
                        </button>
                      </div>

                      <form onSubmit={submit} className="mt-4 space-y-4">
                        {mode === "file" ? (
                          <div>
                            <Label htmlFor="file">File</Label>
                            <Input
                              id="file"
                              ref={fileRef}
                              type="file"
                              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            />
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor="url">URL</Label>
                            <Input
                              id="url"
                              type="url"
                              value={url}
                              onChange={(e) => setUrl(e.target.value)}
                              placeholder="https://…"
                            />
                          </div>
                        )}
                        <div>
                          <Label htmlFor="name">Display name</Label>
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={file?.name ?? "What's this?"}
                          />
                        </div>
                        <div>
                          <Label>Category</Label>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {(t.categories.length > 0 ? t.categories : CATEGORIES).map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCategory(c)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                  category === c
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea
                            id="notes"
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Context, page refs, who cares about this"
                          />
                        </div>
                        <Button type="submit" disabled={uploading} className="w-full">
                          {uploading ? "Saving…" : `Add to ${t.label}`}
                        </Button>
                      </form>
                    </Card>
                  )}

                  <Card
                    className={`border-border bg-surface p-6 ${
                      canWriteBriefing ? "lg:col-span-3" : "lg:col-span-5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        {t.label} · {visible.length}
                      </h2>
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="max-w-[200px]"
                      />
                    </div>

                    {visible.length === 0 ? (
                      <div className="mt-6 text-sm text-muted-foreground">
                        Nothing in {t.label} yet.
                        {canWriteBriefing && t.categories.length > 0
                          ? ` Use the form to add the first ${t.categories[0]}.`
                          : ""}
                      </div>
                    ) : (
                      <ul className="mt-4 max-h-[70vh] space-y-2 overflow-auto">
                        {visible.map((it) => (
                          <li
                            key={it.id}
                            className="group flex items-start gap-3 rounded-md border border-border bg-surface-hover/40 p-3 hover:border-primary/40"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                              {it.url ? <LinkIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => openItem(it)}
                                className="text-left text-sm font-semibold hover:text-primary"
                              >
                                {it.name}
                              </button>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="rounded-full border border-border px-2 py-0.5">{it.category}</span>
                                <span>{it.uploader_name ?? "—"}</span>
                                <span>{relativeTime(it.created_at)}</span>
                              </div>
                              {it.notes && <p className="mt-1 text-xs text-muted-foreground">{it.notes}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {isLeadership &&
                                it.file_path &&
                                (it.category === "RFP" || it.category === "Amendment") && (
                                  <button
                                    onClick={() => runAnalyze(it)}
                                    disabled={analyzingId === it.id}
                                    title="Run Holy Grail analysis"
                                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                                  >
                                    {analyzingId === it.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    {analyzingId === it.id ? "Analyzing…" : "Holy Grail"}
                                  </button>
                                )}
                              <button
                                onClick={() => openItem(it)}
                                className="rounded-md border border-border p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:border-primary/50 hover:text-foreground"
                              >
                                {it.url ? (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
