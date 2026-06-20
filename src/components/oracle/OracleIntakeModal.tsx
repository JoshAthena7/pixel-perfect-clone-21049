/**
 * OracleIntakeModal — the typed "Add to ORACLE" intake surface.
 *
 * Steps:
 *  1. Tier & scope (platform / state · NJ / mission)
 *  2. Category (8 cards)
 *  3. Base + type-specific fields
 *  4. Taxonomy classification (AI-suggested + manual + win themes + JPB)
 *  5. Save
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  addOracleIntel,
  listMissionWinThemes,
  listOracleTaxonomy,
  suggestOracleTaxonomy,
  type OracleCategoryKey,
} from "@/lib/oracle-intel.functions";
import {
  Bolt,
  Loader2,
  Scale,
  BarChart3,
  HeartPulse,
  Lightbulb,
  Microscope,
  Ear,
  Shield,
  Map as MapIcon,
  X,
} from "lucide-react";

const GOLD = "#C49A2B";
const BLUE = "#3b82f6";
const PURPLE = "#a855f7";

type Tier = "platform" | "state" | "mission";

const CATEGORIES: {
  key: OracleCategoryKey;
  label: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { key: "regulatory", label: "Regulatory & Compliance", desc: "Statutes, regulations, guidance, waivers, state plan", Icon: Scale },
  { key: "quality", label: "Quality & Performance", desc: "HEDIS, EQRO, NCI domains, benchmarks", Icon: BarChart3 },
  { key: "sdoh", label: "Health Outcomes & SDOH", desc: "Population health, SDOH prevalence, pain points", Icon: HeartPulse },
  { key: "policy_innovation", label: "Policy & Innovation", desc: "CMMI models, demonstrations, grants, VBP", Icon: Lightbulb },
  { key: "evidence", label: "Evidence Base", desc: "Research, white papers, clinical guidelines, best practice", Icon: Microscope },
  { key: "field", label: "Field Intelligence", desc: "Forum notes, presentations, advocacy positions, news", Icon: Ear },
  { key: "competitive", label: "Competitive Landscape", desc: "Competitor profiles, prior awards, differentiation", Icon: Shield },
  { key: "client_content", label: "Client Content Map", desc: "Win themes, proof point categories, content pointers", Icon: MapIcon },
];

const JPB_VARS = [
  "Pressure Intelligence",
  "Stakeholder Trust",
  "Future-State Fit",
  "Implementation Confidence",
  "Perceived Risk",
  "Political Exposure",
  "Message Drift",
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  initialTier?: Tier;
  initialTopicTags?: string[];
  initialCategory?: OracleCategoryKey;
};

export function OracleIntakeModal({
  open,
  onOpenChange,
  missionId,
  initialTier = "mission",
  initialTopicTags = [],
  initialCategory,
}: Props) {
  const qc = useQueryClient();
  const addFn = useServerFn(addOracleIntel);
  const suggestFn = useServerFn(suggestOracleTaxonomy);
  const taxonomyQ = useServerFn(listOracleTaxonomy);
  const winThemesQ = useServerFn(listMissionWinThemes);

  const [tier, setTier] = useState<Tier>(initialTier);
  const [category, setCategory] = useState<OracleCategoryKey | null>(initialCategory ?? null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [topicTags, setTopicTags] = useState<string[]>(initialTopicTags);
  const [topicInput, setTopicInput] = useState("");

  // Type-specific
  const [subcategory, setSubcategory] = useState("");
  const [authority, setAuthority] = useState<"primary" | "secondary" | "tertiary">("tertiary");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [fullText, setFullText] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState({
    measure_set: "",
    measure_code: "",
    measure_name: "",
    national_benchmark: "",
    state_benchmark: "",
    mco_rate: "",
    data_year: "",
  });
  const [sdoh, setSdoh] = useState({
    sdoh_domain: "",
    geography_type: "",
    geography_name: "",
    prevalence_rate: "",
    national_benchmark: "",
    data_year: "",
    data_source: "",
  });

  // Taxonomy
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [winThemes, setWinThemes] = useState<string[]>([]);
  const [jpb, setJpb] = useState<string[]>([]);
  const lastSuggestKeyRef = useRef<string>("");

  // Reset when opening
  useEffect(() => {
    if (open) {
      setTier(initialTier);
      setCategory(initialCategory ?? null);
      setTitle("");
      setSummary("");
      setSourceName("");
      setSourceUrl("");
      setPublishedAt("");
      setTopicTags(initialTopicTags);
      setTopicInput("");
      setSubcategory("");
      setAuthority("tertiary");
      setEffectiveDate("");
      setExpirationDate("");
      setFullText("");
      setExtra({});
      setQuality({ measure_set: "", measure_code: "", measure_name: "", national_benchmark: "", state_benchmark: "", mco_rate: "", data_year: "" });
      setSdoh({ sdoh_domain: "", geography_type: "", geography_name: "", prevalence_rate: "", national_benchmark: "", data_year: "", data_source: "" });
      setSuggested([]);
      setSelectedCodes([]);
      setWinThemes([]);
      setJpb([]);
      lastSuggestKeyRef.current = "";
    }
  }, [open, initialTier, initialCategory, initialTopicTags]);

  const { data: taxonomy = [] } = useQuery({
    queryKey: ["oracle-taxonomy"],
    queryFn: () => taxonomyQ(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: themes = [] } = useQuery({
    queryKey: ["oracle-mission-win-themes", missionId],
    queryFn: () => winThemesQ({ data: { missionId } }),
    enabled: open && !!missionId,
  });

  const taxonomyByDomain = useMemo(() => {
    const map: Record<string, { code: string; name: string }[]> = {};
    for (const t of taxonomy) {
      const d = (t as { domain: string }).domain;
      const arr = map[d] ?? (map[d] = []);
      arr.push({ code: (t as { node_code: string }).node_code, name: (t as { node_name: string }).node_name });
    }
    return map;
  }, [taxonomy]);

  async function runSuggestion() {
    if (!category || !title.trim() || !summary.trim()) return;
    const key = `${category}|${title.trim()}|${summary.trim()}`;
    if (lastSuggestKeyRef.current === key) return;
    lastSuggestKeyRef.current = key;
    setSuggesting(true);
    try {
      const res = await suggestFn({ data: { title: title.trim(), summary: summary.trim(), category } });
      setSuggested(res.codes ?? []);
      // auto-select suggestions the user hasn't deselected
      setSelectedCodes((prev) => {
        const merged = new Set(prev);
        for (const c of res.codes ?? []) merged.add(c);
        return Array.from(merged);
      });
    } catch (e) {
      console.warn("[oracle-intake] suggest failed", e);
    } finally {
      setSuggesting(false);
    }
  }

  function addTopicTag() {
    const v = topicInput.trim().toLowerCase();
    if (!v) return;
    setTopicTags((arr) => (arr.includes(v) ? arr : [...arr, v]));
    setTopicInput("");
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("Pick a category");
      const numOrNull = (s: string) => (s.trim() ? Number(s) : null);
      return addFn({
        data: {
          missionId,
          tier,
          state_code: tier === "state" ? "NJ" : null,
          category,
          title: title.trim(),
          summary: summary.trim(),
          source_name: sourceName.trim(),
          source_url: sourceUrl.trim() || null,
          published_at: publishedAt || null,
          topic_tags: topicTags,
          taxonomy_node_codes: selectedCodes,
          win_theme_tags: winThemes,
          jpb_variable_tags: jpb,
          subcategory: subcategory || null,
          authority,
          effective_date: effectiveDate || null,
          expiration_date: expirationDate || null,
          full_text: fullText || null,
          quality:
            category === "quality"
              ? {
                  measure_set: quality.measure_set || undefined,
                  measure_code: quality.measure_code || undefined,
                  measure_name: quality.measure_name || undefined,
                  national_benchmark: numOrNull(quality.national_benchmark),
                  state_benchmark: numOrNull(quality.state_benchmark),
                  mco_rate: numOrNull(quality.mco_rate),
                  data_year: numOrNull(quality.data_year) as number | null,
                }
              : undefined,
          sdoh:
            category === "sdoh"
              ? {
                  sdoh_domain: sdoh.sdoh_domain || undefined,
                  geography_type: sdoh.geography_type || undefined,
                  geography_name: sdoh.geography_name || undefined,
                  prevalence_rate: numOrNull(sdoh.prevalence_rate),
                  national_benchmark: numOrNull(sdoh.national_benchmark),
                  data_year: numOrNull(sdoh.data_year) as number | null,
                  data_source: sdoh.data_source || undefined,
                }
              : undefined,
          extra,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Added to ORACLE. IRIS will use this across all ${res.scope} questions.`);
      qc.invalidateQueries({ queryKey: ["intel-events", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-signals", missionId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not add intel";
      toast.error(msg);
    },
  });

  const canSave =
    !!category &&
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    sourceName.trim().length > 0 &&
    selectedCodes.length > 0;

  const tierBorder = tier === "platform" ? GOLD : tier === "state" ? BLUE : PURPLE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[680px] max-h-[90vh] overflow-y-auto"
        style={{ background: "rgb(8,16,28)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Bolt className="h-4 w-4" style={{ color: GOLD }} />
            Add to ORACLE
          </DialogTitle>
          <DialogDescription style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            Intelligence you add here becomes available to IRIS across all questions on this mission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Tier */}
          <Section title="1. Scope">
            <div className="grid grid-cols-3 gap-2">
              <TierPill active={tier === "platform"} color={GOLD} onClick={() => setTier("platform")} label="Platform" sub="All missions, all states" title="Federal regulatory, universal evidence base, clinical frameworks. Available everywhere." />
              <TierPill active={tier === "state"} color={BLUE} onClick={() => setTier("state")} label="State · NJ" sub="All NJ missions" title="NJ-specific regulatory, state plan, EQRA, state benchmarks. Available to every NJ mission." />
              <TierPill active={tier === "mission"} color={PURPLE} onClick={() => setTier("mission")} label="This Mission" sub="This mission only" title="RFP-specific intel, client content map, competitive landscape. This mission only." />
            </div>
          </Section>

          {/* Step 2: Category */}
          <Section title="2. Intelligence Type">
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className="rounded-lg p-3 text-left transition"
                    style={{
                      background: active ? "rgba(196,154,43,0.1)" : "rgba(5,13,24,0.5)",
                      border: `1px solid ${active ? `${GOLD}88` : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <c.Icon className="h-4 w-4 mt-0.5" style={{ color: active ? GOLD : "rgba(255,255,255,0.55)" }} />
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium text-white">{c.label}</div>
                        <div className="text-[11px] text-white/55 mt-0.5">{c.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Step 3: Fields */}
          {category && (
            <Section title="3. Details">
              <div className="space-y-3">
                <Field label="Title" required>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short, scannable title" />
                </Field>
                <Field label="Summary" required>
                  <Textarea
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    onBlur={runSuggestion}
                    placeholder="One sentence: what this is and why it matters for this mission."
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source name" required>
                    <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. CMS SMD letter" />
                  </Field>
                  <Field label="Source URL">
                    <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Published date">
                    <Input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
                  </Field>
                  <Field label="Topic tags">
                    <div className="flex flex-wrap items-center gap-1 rounded-md border border-white/10 bg-black/30 p-1.5 min-h-[36px]">
                      {topicTags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,0.06)", fontSize: 11, color: "white" }}>
                          {t}
                          <button onClick={() => setTopicTags((a) => a.filter((x) => x !== t))} className="text-white/40 hover:text-white">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addTopicTag();
                          }
                        }}
                        onBlur={addTopicTag}
                        placeholder="dcp&p, care-coordination…"
                        className="flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none min-w-[80px]"
                      />
                    </div>
                  </Field>
                </div>

                {/* per-category */}
                {category === "regulatory" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subcategory">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["State Plan", "Federal Regulation", "Federal Guidance", "Waiver 1115", "Waiver 1915b", "Waiver 1915c", "State Regulation", "State Guidance", "Contract Requirement"]} />
                    </Field>
                    <Field label="Authority level">
                      <SimpleSelect value={authority} onValueChange={(v) => setAuthority(v as typeof authority)} options={[{ v: "primary", l: "Primary (statute/regulation)" }, { v: "secondary", l: "Secondary (guidance/policy)" }, { v: "tertiary", l: "Tertiary (analysis/report)" }]} />
                    </Field>
                    <Field label="Effective date">
                      <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                    </Field>
                    <Field label="Expiration date">
                      <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
                    </Field>
                    <div className="col-span-2">
                      <Field label="Full text">
                        <Textarea rows={6} value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder="Paste the relevant regulatory text or key provisions." />
                      </Field>
                    </div>
                  </div>
                )}

                {category === "quality" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Measure set">
                      <SimpleSelect value={quality.measure_set} onValueChange={(v) => setQuality((q) => ({ ...q, measure_set: v }))} options={["HEDIS", "NCI", "CAHPS", "EQRO", "State Specific"]} />
                    </Field>
                    <Field label="Measure code"><Input value={quality.measure_code} onChange={(e) => setQuality((q) => ({ ...q, measure_code: e.target.value }))} placeholder="FUH, FUM" /></Field>
                    <Field label="Measure name"><Input value={quality.measure_name} onChange={(e) => setQuality((q) => ({ ...q, measure_name: e.target.value }))} /></Field>
                    <Field label="Data year"><Input type="number" value={quality.data_year} onChange={(e) => setQuality((q) => ({ ...q, data_year: e.target.value }))} /></Field>
                    <Field label="National benchmark (%)"><Input type="number" step="0.1" value={quality.national_benchmark} onChange={(e) => setQuality((q) => ({ ...q, national_benchmark: e.target.value }))} /></Field>
                    <Field label="State benchmark (%)"><Input type="number" step="0.1" value={quality.state_benchmark} onChange={(e) => setQuality((q) => ({ ...q, state_benchmark: e.target.value }))} /></Field>
                    <Field label="MCO current rate (%)"><Input type="number" step="0.1" value={quality.mco_rate} onChange={(e) => setQuality((q) => ({ ...q, mco_rate: e.target.value }))} /></Field>
                  </div>
                )}

                {category === "sdoh" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SDOH domain">
                      <SimpleSelect value={sdoh.sdoh_domain} onValueChange={(v) => setSdoh((s) => ({ ...s, sdoh_domain: v }))} options={["Housing", "Food Security", "Transportation", "Economic Stability", "Social Isolation", "Education", "Environment", "General Health Outcome"]} />
                    </Field>
                    <Field label="Geography type">
                      <SimpleSelect value={sdoh.geography_type} onValueChange={(v) => setSdoh((s) => ({ ...s, geography_type: v }))} options={["State", "County", "ZIP", "Region"]} />
                    </Field>
                    <Field label="Geography name"><Input value={sdoh.geography_name} onChange={(e) => setSdoh((s) => ({ ...s, geography_name: e.target.value }))} /></Field>
                    <Field label="Prevalence rate (%)"><Input type="number" step="0.1" value={sdoh.prevalence_rate} onChange={(e) => setSdoh((s) => ({ ...s, prevalence_rate: e.target.value }))} /></Field>
                    <Field label="National benchmark (%)"><Input type="number" step="0.1" value={sdoh.national_benchmark} onChange={(e) => setSdoh((s) => ({ ...s, national_benchmark: e.target.value }))} /></Field>
                    <Field label="Data year"><Input type="number" value={sdoh.data_year} onChange={(e) => setSdoh((s) => ({ ...s, data_year: e.target.value }))} /></Field>
                    <div className="col-span-2"><Field label="Data source"><Input value={sdoh.data_source} onChange={(e) => setSdoh((s) => ({ ...s, data_source: e.target.value }))} placeholder="e.g. County Health Rankings 2024" /></Field></div>
                  </div>
                )}

                {category === "evidence" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Evidence type">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["Peer-Reviewed Research", "Federal Agency Publication", "Foundation Report", "Clinical Practice Guideline", "Best Practice Framework", "Systematic Review"]} />
                    </Field>
                    <Field label="Journal / Publisher"><Input value={extra.publisher ?? ""} onChange={(e) => setExtra((x) => ({ ...x, publisher: e.target.value }))} /></Field>
                    <div className="col-span-2"><Field label="Authors"><Input value={extra.authors ?? ""} onChange={(e) => setExtra((x) => ({ ...x, authors: e.target.value }))} /></Field></div>
                    <div className="col-span-2"><Field label="Key finding"><Textarea rows={2} value={extra.key_finding ?? ""} onChange={(e) => setExtra((x) => ({ ...x, key_finding: e.target.value }))} placeholder="One sentence: the core finding or recommendation." /></Field></div>
                    <div className="col-span-2"><Field label="Full citation"><Input value={extra.citation ?? ""} onChange={(e) => setExtra((x) => ({ ...x, citation: e.target.value }))} placeholder="APA or MLA format" /></Field></div>
                    <div className="col-span-2"><Field label="Relevance to this mission"><Textarea rows={2} value={extra.relevance ?? ""} onChange={(e) => setExtra((x) => ({ ...x, relevance: e.target.value }))} placeholder="Why does this evidence matter for this mission?" /></Field></div>
                  </div>
                )}

                {category === "field" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subtype">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["Forum Notes", "Conference Presentation", "Legislative Testimony", "Advocacy Position", "News", "Stakeholder Communication"]} />
                    </Field>
                    <Field label="Event date"><Input type="date" value={extra.event_date ?? ""} onChange={(e) => setExtra((x) => ({ ...x, event_date: e.target.value }))} /></Field>
                    <div className="col-span-2"><Field label="Event name"><Input value={extra.event_name ?? ""} onChange={(e) => setExtra((x) => ({ ...x, event_name: e.target.value }))} placeholder="e.g. CSOC Advisory Committee Meeting June 2026" /></Field></div>
                    <div className="col-span-2"><Field label="Key takeaways"><Textarea rows={4} value={extra.takeaways ?? ""} onChange={(e) => setExtra((x) => ({ ...x, takeaways: e.target.value }))} placeholder="What was said or decided that matters for this mission?" /></Field></div>
                  </div>
                )}

                {category === "competitive" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subtype">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["Competitor Profile", "Prior Award Pattern", "Competitor Strength", "Competitor Weakness", "Incumbent Vulnerability", "Differentiation Opportunity"]} />
                    </Field>
                    <Field label="Competitor name"><Input value={extra.competitor_name ?? ""} onChange={(e) => setExtra((x) => ({ ...x, competitor_name: e.target.value }))} /></Field>
                    <div className="col-span-2"><Field label="Relevance"><Textarea rows={2} value={extra.relevance ?? ""} onChange={(e) => setExtra((x) => ({ ...x, relevance: e.target.value }))} placeholder="How does this affect our positioning?" /></Field></div>
                  </div>
                )}

                {category === "policy_innovation" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subtype">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["CMMI Model", "1115 Innovation", "VBP Initiative", "Grant Program", "Demonstration", "APM"]} />
                    </Field>
                    <Field label="Effective date"><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
                    <div className="col-span-2"><Field label="Relevance"><Textarea rows={2} value={extra.relevance ?? ""} onChange={(e) => setExtra((x) => ({ ...x, relevance: e.target.value }))} /></Field></div>
                  </div>
                )}

                {category === "client_content" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subtype">
                      <SimpleSelect value={subcategory} onValueChange={setSubcategory} options={["Win Theme", "Proof Point Category", "Program Description", "Performance Highlight", "Content Pointer"]} />
                    </Field>
                    <Field label="Win theme connection">
                      <SimpleSelect value={extra.win_theme_link ?? ""} onValueChange={(v) => setExtra((x) => ({ ...x, win_theme_link: v }))} options={(themes ?? []).map((t) => t.text)} />
                    </Field>
                    <div className="col-span-2"><Field label="Where to find it"><Input value={extra.where ?? ""} onChange={(e) => setExtra((x) => ({ ...x, where: e.target.value }))} placeholder="SharePoint folder, Loopio section, doc name…" /></Field></div>
                    <div className="col-span-2"><Field label="What to look for"><Textarea rows={2} value={extra.what ?? ""} onChange={(e) => setExtra((x) => ({ ...x, what: e.target.value }))} placeholder="Specific content the writer should retrieve from the client environment" /></Field></div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Step 4: Classification */}
          {category && (
            <Section title="4. ORACLE Classification" sub="IRIS will use this to find the right intel for the right question.">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ fontSize: 10, color: GOLD, textTransform: "", letterSpacing: "0.06em" }}>IRIS suggests</span>
                    {suggesting && <Loader2 className="h-3 w-3 animate-spin" style={{ color: GOLD }} />}
                    <button type="button" onClick={runSuggestion} className="ml-auto text-[11px] text-white/40 hover:text-white">re-suggest</button>
                  </div>
                  {suggested.length === 0 && !suggesting && (
                    <div className="text-[12px] text-white/40">Fill title + summary; suggestions appear when you tab out.</div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {suggested.map((code) => {
                      const node = taxonomy.find((t) => (t as { node_code: string }).node_code === code) as { node_code: string; node_name: string } | undefined;
                      const active = selectedCodes.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setSelectedCodes((a) => (a.includes(code) ? a.filter((c) => c !== code) : [...a, code]))}
                          className="rounded-full px-2 py-0.5 text-[12px]"
                          style={{
                            background: active ? `${GOLD}33` : "rgba(196,154,43,0.06)",
                            color: active ? "white" : GOLD,
                            border: `1px solid ${active ? GOLD : `${GOLD}55`}`,
                          }}
                          title={node?.node_name ?? code}
                        >
                          {node?.node_name ?? code}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Add manual classification">
                  <select
                    className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !selectedCodes.includes(v)) setSelectedCodes((a) => [...a, v]);
                    }}
                  >
                    <option value="">— pick a taxonomy node —</option>
                    {Object.entries(taxonomyByDomain).map(([domain, nodes]) => (
                      <optgroup key={domain} label={domain.replace(/_/g, " ")}>
                        {nodes.map((n) => (
                          <option key={n.code} value={n.code}>{n.code} — {n.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>

                {selectedCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCodes.map((code) => {
                      const node = taxonomy.find((t) => (t as { node_code: string }).node_code === code) as { node_code: string; node_name: string } | undefined;
                      return (
                        <span key={code} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "rgba(168,85,247,0.15)", color: "white", fontSize: 11, border: `1px solid ${PURPLE}55` }}>
                          {node?.node_name ?? code}
                          <button onClick={() => setSelectedCodes((a) => a.filter((c) => c !== code))} className="text-white/50 hover:text-white">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {themes.length > 0 && (
                  <Field label="Win themes this intel supports">
                    <div className="flex flex-wrap gap-1.5">
                      {themes.map((t) => {
                        const active = winThemes.includes(t.text);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setWinThemes((a) => (a.includes(t.text) ? a.filter((x) => x !== t.text) : [...a, t.text]))}
                            className="rounded-full px-2 py-0.5 text-[12px]"
                            style={{
                              background: active ? "rgba(196,154,43,0.25)" : "rgba(255,255,255,0.04)",
                              color: active ? "white" : "rgba(255,255,255,0.6)",
                              border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.1)"}`,
                            }}
                          >
                            {t.text}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}

                <Field label="JPB variables">
                  <div className="grid grid-cols-2 gap-1.5">
                    {JPB_VARS.map((v) => (
                      <label key={v} className="flex items-center gap-2 text-[12px] text-white/70">
                        <Checkbox
                          checked={jpb.includes(v)}
                          onCheckedChange={(c) => setJpb((arr) => (c ? [...arr, v] : arr.filter((x) => x !== v)))}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60">Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!canSave || mut.isPending}
            style={{ background: GOLD, color: "rgb(8,16,28)", borderColor: tierBorder }}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bolt className="h-4 w-4 mr-1" />}
            Add to ORACLE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Small UI helpers ============ */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-white/55 mb-1.5">{title}</div>
      {sub && <div className="text-[11px] text-white/40 mb-2">{sub}</div>}
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-white/50">
        {label} {required && <span style={{ color: GOLD }}>*</span>}
      </Label>
      {children}
    </div>
  );
}

function TierPill({ active, color, label, sub, onClick, title }: { active: boolean; color: string; label: string; sub: string; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-lg px-3 py-2 text-left transition"
      style={{
        background: active ? `${color}1f` : "rgba(5,13,24,0.5)",
        border: `1.5px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <div className="text-[12px] font-medium text-white">{label}</div>
      <div className="text-[11px] text-white/55 mt-0.5">{sub}</div>
    </button>
  );
}

type SimpleOption = string | { v: string; l: string };
function SimpleSelect({ value, onValueChange, options }: { value: string; onValueChange: (v: string) => void; options: SimpleOption[] }) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 text-[12px] bg-black/30 border-white/10 text-white">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.v;
          const l = typeof o === "string" ? o : o.l;
          return (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
