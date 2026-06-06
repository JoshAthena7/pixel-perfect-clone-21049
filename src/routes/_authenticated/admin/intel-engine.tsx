import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, PlusCircle, Library as LibraryIcon, Sparkles,
  AlertTriangle, ChevronDown, ChevronRight, Search, Link as LinkIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/intel-engine")({
  component: IntelEnginePage,
});

/* ──────────────── Demo data ──────────────── */

type IntelType =
  | "Source Document"
  | "Win Theme"
  | "Competitive Intel"
  | "Terminology"
  | "Program Context"
  | "Lesson Learned";

type IntelStatus = "Active" | "Pending" | "Universal";

type IntelItem = {
  id: string;
  title: string;
  summary: string;
  type: IntelType;
  mission: string; // mission name or "Universal"
  url?: string;
  status: IntelStatus;
  updatedAt: string; // ISO
  drift?: string | null;
};

const MISSIONS = [
  "NJ CSOC Behavioral Health",
  "VA Cardinal Care MLTSS",
  "Indiana PathWays",
];

const DEMO_ITEMS: IntelItem[] = [
  {
    id: "i1",
    title: "NJ DCF CSOC Service Array — Definitive Citation",
    summary:
      "DCF Children's System of Care service array as defined in the 2024 procurement: Mobile Response, CMO, Family Support Org, OOH treatment.",
    type: "Source Document",
    mission: "NJ CSOC Behavioral Health",
    url: "https://www.nj.gov/dcf/about/divisions/dcsc/",
    status: "Active",
    updatedAt: "2026-06-04T13:21:00Z",
  },
  {
    id: "i2",
    title: "Win Theme — Trauma-Informed, Family-Driven Care",
    summary:
      "Anchor every section in DCF's trauma-informed, family-driven, youth-guided system-of-care values. Cite outcomes from CMO partnership pilots.",
    type: "Win Theme",
    mission: "NJ CSOC Behavioral Health",
    status: "Active",
    updatedAt: "2026-06-03T09:10:00Z",
  },
  {
    id: "i3",
    title: "Competitive Intel — PerformCare Incumbent Posture",
    summary:
      "Incumbent contract assistance services administrator. Strengths: deep CMO relationships. Weaknesses: legacy tech stack, slower MRSS dispatch.",
    type: "Competitive Intel",
    mission: "NJ CSOC Behavioral Health",
    status: "Active",
    updatedAt: "2026-06-02T17:42:00Z",
  },
  {
    id: "i4",
    title: "Terminology — Never Say 'Member' for CSOC Youth",
    summary:
      "DCF language: 'youth and family' or 'youth served', never 'member' or 'enrollee'. Health plan vocabulary is an automatic credibility hit.",
    type: "Terminology",
    mission: "NJ CSOC Behavioral Health",
    status: "Active",
    updatedAt: "2026-06-02T11:05:00Z",
    drift:
      "Detected health-plan phrasing ('member engagement') drifting into CSOC drafts. Reviewer should re-anchor terminology.",
  },
  {
    id: "i5",
    title: "Program Context — Wraparound Fidelity & High-Fidelity Standards",
    summary:
      "DCF requires Wraparound fidelity per NWIC standards. Reference SAMHSA SOC values and CANS as the assessment backbone.",
    type: "Program Context",
    mission: "NJ CSOC Behavioral Health",
    url: "https://nwic.org/",
    status: "Active",
    updatedAt: "2026-06-01T15:30:00Z",
  },
  {
    id: "i6",
    title: "Lesson Learned — Don't Overclaim on Mobile Response Times",
    summary:
      "Past evaluator feedback: bidders lost points overclaiming 60-min MRSS times statewide. Commit to documented SLAs with regional differentiation.",
    type: "Lesson Learned",
    mission: "NJ CSOC Behavioral Health",
    status: "Active",
    updatedAt: "2026-05-31T19:55:00Z",
  },
  {
    id: "i7",
    title: "Win Theme — Local Roots, Statewide Reach",
    summary:
      "Pair regional CMO partnerships with statewide operational backbone. Speak to county-level relationships before scale.",
    type: "Win Theme",
    mission: "NJ CSOC Behavioral Health",
    status: "Active",
    updatedAt: "2026-05-30T08:12:00Z",
  },
  {
    id: "i8",
    title: "Source Document — DCF Stakeholder Listening Sessions Summary",
    summary:
      "Themes from 2025 family listening sessions: respite access gaps, transitions out of OOH, sibling placement continuity.",
    type: "Source Document",
    mission: "NJ CSOC Behavioral Health",
    url: "https://www.nj.gov/dcf/news/",
    status: "Active",
    updatedAt: "2026-05-28T14:40:00Z",
  },
  {
    id: "p1",
    title: "Possible Win Theme — Lived-Experience Workforce",
    summary:
      "Family Partners and Youth Partners with lived experience as a hiring commitment. Needs validation against DCF workforce requirements.",
    type: "Win Theme",
    mission: "NJ CSOC Behavioral Health",
    status: "Pending",
    updatedAt: "2026-06-04T18:02:00Z",
  },
  {
    id: "p2",
    title: "Competitive Note — Beacon Health Posture",
    summary:
      "Rumored Beacon interest in CSOC space. Auto-sourced from industry chatter; needs human confirmation before activation.",
    type: "Competitive Intel",
    mission: "NJ CSOC Behavioral Health",
    status: "Pending",
    updatedAt: "2026-06-04T18:05:00Z",
  },
  {
    id: "u1",
    title: "Universal — Person-First Language Standard",
    summary:
      "Always person-first across every proposal. 'Person with a substance use disorder', not 'addict'. 'Youth served', not 'consumer'.",
    type: "Terminology",
    mission: "Universal",
    status: "Universal",
    updatedAt: "2026-05-15T12:00:00Z",
  },
  {
    id: "u2",
    title: "Universal — Athena Voice & Tone",
    summary:
      "Direct, specific, warm. Solutions with a soul. Never robotic, never corporate, never hedge-first.",
    type: "Win Theme",
    mission: "Universal",
    status: "Universal",
    updatedAt: "2026-05-10T12:00:00Z",
  },
];

/* ──────────────── Page ──────────────── */

type Tab = "monitor" | "populate" | "library";

function IntelEnginePage() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [items, setItems] = useState<IntelItem[]>(DEMO_ITEMS);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intel Engine</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One place to monitor mission intel health, add new intelligence, and flip it
            live into the Studio Intel Panel. Monitor. Populate. Deploy.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "monitor"} onClick={() => setTab("monitor")} icon={<Activity className="h-3.5 w-3.5" />}>
          Monitor
        </TabButton>
        <TabButton active={tab === "populate"} onClick={() => setTab("populate")} icon={<PlusCircle className="h-3.5 w-3.5" />}>
          Populate
        </TabButton>
        <TabButton active={tab === "library"} onClick={() => setTab("library")} icon={<LibraryIcon className="h-3.5 w-3.5" />}>
          Library
        </TabButton>
      </div>

      {tab === "monitor" && <MonitorTab items={items} onToggle={(id) => toggleActive(id, items, setItems)} />}
      {tab === "populate" && <PopulateTab onSave={(it) => setItems((arr) => [it, ...arr])} />}
      {tab === "library" && <LibraryTab items={items} onToggle={(id) => toggleActive(id, items, setItems)} />}
    </div>
  );
}

function toggleActive(
  id: string,
  items: IntelItem[],
  setItems: (next: IntelItem[]) => void,
) {
  setItems(
    items.map((it) =>
      it.id === id
        ? { ...it, status: it.status === "Active" ? "Pending" : "Active", updatedAt: new Date().toISOString() }
        : it,
    ),
  );
}

function TabButton({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px inline-flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
        active
          ? "text-foreground border-b-2 border-[color:var(--athena-gold,#d4a55b)] font-medium"
          : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ──────────────── Monitor Tab ──────────────── */

function MonitorTab({ items, onToggle }: { items: IntelItem[]; onToggle: (id: string) => void }) {
  const rows = useMemo(() => {
    return MISSIONS.map((m) => {
      const mine = items.filter((i) => i.mission === m);
      const active = mine.filter((i) => i.status === "Active").length;
      const pending = mine.filter((i) => i.status === "Pending").length;
      const last = mine
        .map((i) => i.updatedAt)
        .sort()
        .pop() ?? null;
      const drift = mine.some((i) => i.drift);
      let health: "green" | "amber" | "red" = "green";
      if (drift || pending >= 2) health = "amber";
      if (active === 0) health = "red";
      // Demo specifics — keep the other two missions sparse so the dashboard reads honestly
      if (m !== "NJ CSOC Behavioral Health") {
        return {
          mission: m,
          active: m === "VA Cardinal Care MLTSS" ? 3 : 0,
          pending: m === "VA Cardinal Care MLTSS" ? 1 : 0,
          last: m === "VA Cardinal Care MLTSS" ? "2026-05-22T10:00:00Z" : null,
          drift: false,
          health: (m === "VA Cardinal Care MLTSS" ? "amber" : "red") as "green" | "amber" | "red",
          items: [] as IntelItem[],
        };
      }
      return { mission: m, active, pending, last, drift, health, items: mine };
    });
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2 px-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <div className="col-span-4">Mission</div>
        <div className="col-span-1 text-right">Active</div>
        <div className="col-span-1 text-right">Pending</div>
        <div className="col-span-3">Last Update</div>
        <div className="col-span-2">Drift</div>
        <div className="col-span-1 text-right">Health</div>
      </div>
      {rows.map((r) => (
        <MissionRow key={r.mission} row={r} onToggle={onToggle} />
      ))}
    </div>
  );
}

function MissionRow({
  row, onToggle,
}: {
  row: { mission: string; active: number; pending: number; last: string | null; drift: boolean; health: "green" | "amber" | "red"; items: IntelItem[] };
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(row.mission === "NJ CSOC Behavioral Health");
  const healthColor =
    row.health === "green" ? "#22c55e" : row.health === "amber" ? "#f59e0b" : "#ef4444";

  return (
    <div className="rounded-lg border border-border bg-surface/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid grid-cols-12 gap-2 items-center w-full px-4 py-3 text-sm hover:bg-surface-hover/60 text-left"
      >
        <div className="col-span-4 flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="font-medium">{row.mission}</span>
        </div>
        <div className="col-span-1 text-right tabular-nums">{row.active}</div>
        <div className="col-span-1 text-right tabular-nums">
          {row.pending > 0 ? (
            <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
              {row.pending}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="col-span-3 text-muted-foreground text-xs">
          {row.last ? new Date(row.last).toLocaleString() : "—"}
        </div>
        <div className="col-span-2">
          {row.drift ? (
            <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
              <AlertTriangle className="h-3 w-3" /> Drift Detected
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Clean</span>
          )}
        </div>
        <div className="col-span-1 flex items-center justify-end">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: healthColor }} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {row.items.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No intel items for this mission yet. Use Populate to add one.</div>
          ) : (
            row.items.map((it) => <IntelLine key={it.id} item={it} onToggle={onToggle} />)
          )}
        </div>
      )}
    </div>
  );
}

function IntelLine({ item, onToggle }: { item: IntelItem; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-12 gap-3 items-start rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
      <div className="col-span-7">
        <div className="flex items-center gap-2">
          <TypeBadge t={item.type} />
          <span className="text-sm font-medium">{item.title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.summary}</p>
        {item.drift && (
          <div className="mt-2 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{item.drift}</span>
          </div>
        )}
      </div>
      <div className="col-span-3 text-[11px] text-muted-foreground">
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <LinkIcon className="h-3 w-3" /> source
          </a>
        )}
        <div className="mt-1">{new Date(item.updatedAt).toLocaleDateString()}</div>
      </div>
      <div className="col-span-2 flex justify-end">
        <ToggleActive active={item.status === "Active"} onClick={() => onToggle(item.id)} />
      </div>
    </div>
  );
}

/* ──────────────── Populate Tab ──────────────── */

function PopulateTab({ onSave }: { onSave: (it: IntelItem) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<IntelType>("Win Theme");
  const [mission, setMission] = useState<string>("NJ CSOC Behavioral Health");
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  function letIrisGenerate() {
    setGenerating(true);
    setTimeout(() => {
      const topic = url || title || "behavioral health proposal context";
      setTitle((t) => t || `IRIS Draft — ${topic.slice(0, 60)}`);
      setSummary(
        `Auto-summary from ${url ? "the linked source" : "your topic"}: ${topic.replace(/^https?:\/\//, "").slice(0, 200)}. Anchor this in the mission's win themes, cite the source on use, and re-validate with a human reviewer before activation.`,
      );
      setGenerating(false);
    }, 900);
  }

  function save() {
    if (!title.trim() || !summary.trim()) return;
    onSave({
      id: `new-${Date.now()}`,
      title: title.trim(),
      summary: summary.trim(),
      type,
      mission,
      url: url.trim() || undefined,
      status: active ? "Active" : "Pending",
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    setTitle("");
    setSummary("");
    setUrl("");
    setActive(false);
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 rounded-lg border border-border bg-surface/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">New Intel Item</h2>
          <button
            onClick={letIrisGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--iris,#22d3ee)]/40 bg-[color:var(--iris,#22d3ee)]/10 px-3 py-1.5 text-xs font-medium text-[color:var(--iris,#22d3ee)] hover:bg-[color:var(--iris,#22d3ee)]/20 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {generating ? "IRIS drafting…" : "Let IRIS Generate"}
          </button>
        </div>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Short, specific title" />
        </Field>

        <Field label="Summary">
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className={inputClass} placeholder="2–3 sentences. IRIS can draft this if you paste a URL above." />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <div className="flex flex-wrap gap-1.5">
              {(["Source Document", "Win Theme", "Competitive Intel", "Terminology", "Program Context", "Lesson Learned"] as IntelType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    type === t
                      ? "border-[color:var(--athena-gold,#d4a55b)] bg-[color:var(--athena-gold,#d4a55b)]/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Mission">
            <select value={mission} onChange={(e) => setMission(e.target.value)} className={inputClass}>
              {MISSIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="Universal">Universal (all missions)</option>
            </select>
          </Field>
        </div>

        <Field label="Source URL (optional)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://…" />
        </Field>

        <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-xs text-muted-foreground">
              When on, this item appears in the Studio Intel Panel for writers immediately.
            </div>
          </div>
          <button
            onClick={() => setActive((a) => !a)}
            className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-emerald-500/80" : "bg-border"}`}
            aria-pressed={active}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-emerald-400">Saved · deployed to {mission}</span>}
          <button
            onClick={save}
            className="rounded-md bg-[color:var(--athena-gold,#d4a55b)] px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Save Intel
          </button>
        </div>
      </div>

      <aside className="rounded-lg border border-border bg-surface/40 p-5 space-y-3 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">How it works</h3>
        <ol className="space-y-2 text-xs text-muted-foreground leading-relaxed list-decimal pl-4">
          <li><span className="text-foreground font-medium">Title + Summary.</span> Paste a URL and let IRIS draft if you want — you stay the editor.</li>
          <li><span className="text-foreground font-medium">Tag it.</span> Pick a type and a mission (or Universal).</li>
          <li><span className="text-foreground font-medium">Flip Active.</span> The Studio Intel Panel picks it up the moment you save.</li>
        </ol>
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
          <div className="font-semibold mb-0.5">Intel Drift</div>
          IRIS watches for health-plan phrasing leaking into behavioral health CSA missions and flags those items in Monitor.
        </div>
      </aside>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-[color:var(--athena-gold,#d4a55b)] focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ──────────────── Library Tab ──────────────── */

function LibraryTab({ items, onToggle }: { items: IntelItem[]; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [mission, setMission] = useState<string>("");
  const [type, setType] = useState<IntelType | "">("");
  const [status, setStatus] = useState<IntelStatus | "">("");

  const filtered = items.filter((it) => {
    if (q && !(`${it.title} ${it.summary}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (mission && it.mission !== mission) return false;
    if (type && it.type !== type) return false;
    if (status && it.status !== status) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or summary"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <select value={mission} onChange={(e) => setMission(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="">All missions</option>
          {MISSIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value="Universal">Universal</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as IntelType | "")} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="">All types</option>
          {(["Source Document", "Win Theme", "Competitive Intel", "Terminology", "Program Context", "Lesson Learned"] as IntelType[]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as IntelStatus | "")} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Universal">Universal</option>
        </select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-lg border border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
            No intel items match your filters.
          </div>
        )}
        {filtered.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-3 items-start rounded-md border border-border bg-surface/40 px-3 py-2.5">
            <div className="col-span-7">
              <div className="flex items-center gap-2 flex-wrap">
                <TypeBadge t={it.type} />
                <span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground border border-border">
                  {it.mission}
                </span>
                <span className="text-sm font-medium">{it.title}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{it.summary}</p>
            </div>
            <div className="col-span-3 text-[11px] text-muted-foreground">
              {it.url && (
                <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                  <LinkIcon className="h-3 w-3" /> source
                </a>
              )}
              <div className="mt-1">{new Date(it.updatedAt).toLocaleDateString()}</div>
              <div className="mt-1">
                <StatusPill status={it.status} />
              </div>
            </div>
            <div className="col-span-2 flex justify-end">
              {it.status !== "Universal" && (
                <ToggleActive active={it.status === "Active"} onClick={() => onToggle(it.id)} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────── Bits ──────────────── */

function TypeBadge({ t }: { t: IntelType }) {
  const color: Record<IntelType, string> = {
    "Source Document": "#60a5fa",
    "Win Theme": "#d4a55b",
    "Competitive Intel": "#f87171",
    "Terminology": "#22d3ee",
    "Program Context": "#a78bfa",
    "Lesson Learned": "#34d399",
  };
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${color[t]}22`, color: color[t] }}>
      {t}
    </span>
  );
}

function StatusPill({ status }: { status: IntelStatus }) {
  const map: Record<IntelStatus, { bg: string; fg: string }> = {
    Active: { bg: "rgba(34,197,94,0.18)", fg: "#22c55e" },
    Pending: { bg: "rgba(245,158,11,0.18)", fg: "#f59e0b" },
    Universal: { bg: "rgba(167,139,250,0.18)", fg: "#a78bfa" },
  };
  const c = map[status];
  return (
    <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}

function ToggleActive({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-emerald-500/80" : "bg-border"}`}
      aria-pressed={active}
      title={active ? "Active — visible to writers" : "Inactive — toggle on to deploy"}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${active ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
