/**
 * Step: Intelligence Network Seed
 * Bulk-ingest URLs of stakeholders, advocates, academic orgs, trade
 * associations, etc. Fires inserts into intel_sources and kicks off an
 * IRIS initial scan. All work is fire-and-forget — never blocks the UI.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { scanSeededIntelSources } from "@/lib/intel-network-seed.functions";
import { WizardFooter, WizardStepHeading } from "./WizardShellV3";

type Category = "stakeholder" | "advocate" | "academic" | "trade_assoc" | "government" | "media" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "stakeholder", label: "Stakeholder" },
  { value: "advocate", label: "Advocate" },
  { value: "academic", label: "Academic" },
  { value: "trade_assoc", label: "Trade Assoc" },
  { value: "government", label: "Government" },
  { value: "media", label: "Media" },
  { value: "other", label: "Other" },
];

const URL_REGEX = /(https?:\/\/[^\s,"'<>)\]]+)/g;

function inferCategory(url: string): Category {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  if (/\.gov(\.|$)|\.state\./.test(host)) return "government";
  if (/\.edu(\.|$)|\.ac\./.test(host)) return "academic";
  if (/(assoc|alliance|council|federation|institute|coalition)/.test(host)) return "trade_assoc";
  if (/(advocate|advocacy|rights|action|fund)/.test(host)) return "advocate";
  return "other";
}

function extractUrls(text: string): string[] {
  const matches = [...text.matchAll(URL_REGEX)].map((m) => m[1].replace(/[.,;]+$/, ""));
  return [...new Set(matches)];
}

type Chip = { url: string; category: Category };

export function Step5IntelNetwork({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerScan = useServerFn(scanSeededIntelSources);

  // Hydrate chips from any URLs already saved for this mission so they don't
  // appear to "disappear" when the user revisits this step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("intel_sources")
        .select("url, source_category")
        .eq("mission_id", missionId)
        .not("url", "is", null);
      if (cancelled || error || !data) return;
      const loaded: Chip[] = [];
      const seen = new Set<string>();
      for (const r of data) {
        const url = (r.url ?? "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const cat = (CATEGORIES.find((c) => c.value === r.source_category)?.value ??
          inferCategory(url)) as Category;
        loaded.push({ url, category: cat });
      }
      if (loaded.length) setChips(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  const merge = useMemo(
    () => (urls: string[]) => {
      setChips((prev) => {
        const existing = new Set(prev.map((c) => c.url));
        const next = [...prev];
        for (const u of urls) {
          if (!existing.has(u)) {
            next.push({ url: u, category: inferCategory(u) });
            existing.add(u);
          }
        }
        return next;
      });
    },
    [],
  );

  function handleTextChange(v: string) {
    setText(v);
  }
  function flushText() {
    const urls = extractUrls(text);
    if (urls.length) merge(urls);
  }
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    if (pasted) {
      const urls = extractUrls(pasted);
      if (urls.length) setTimeout(() => merge(urls), 0);
    }
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const found: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        for (const row of rows) {
          for (const cell of row) {
            if (cell == null) continue;
            const matches = extractUrls(String(cell));
            found.push(...matches);
          }
        }
      }
      if (found.length) merge([...new Set(found)]);
    } catch (e) {
      console.log("Intel source CSV/XLSX parse failed:", e);
    }
  }

  function removeChip(url: string) {
    setChips((cur) => cur.filter((c) => c.url !== url));
  }
  function setChipCategory(url: string, category: Category) {
    setChips((cur) => cur.map((c) => (c.url === url ? { ...c, category } : c)));
  }

  async function addToMission() {
    flushText();
    const list = chips.length
      ? chips
      : extractUrls(text).map((u) => ({ url: u, category: inferCategory(u) }));
    if (!list.length) {
      onAdvance();
      return;
    }
    setBusy(true);

    // Skip URLs already saved for this mission to avoid duplicates.
    const { data: existing } = await supabase
      .from("intel_sources")
      .select("url")
      .eq("mission_id", missionId);
    const existingUrls = new Set((existing ?? []).map((r) => r.url));
    const toInsert = list.filter((c) => !existingUrls.has(c.url));

    // Fire-and-forget inserts — never block
    for (const c of toInsert) {
      supabase
        .from("intel_sources")
        .insert({
          mission_id: missionId,
          url: c.url,
          source_type: "web_monitor",
          source_category: c.category,
          monitor_daily: true,
          seeded_at_setup: true,
          credibility_score: 70,
        })
        .then(({ error }) => {
          if (error) console.log("Intel source insert failed:", error.message);
        });
    }

    // Fire-and-forget IRIS scan
    triggerScan({ data: { missionId, urls: list.map((c) => c.url) } }).catch((e) =>
      console.log("IRIS seed scan trigger failed:", e),
    );

    onAdvance();
  }

    // Fire-and-forget IRIS scan
    triggerScan({ data: { missionId, urls: list.map((c) => c.url) } }).catch((e) =>
      console.log("IRIS seed scan trigger failed:", e),
    );

    onAdvance();
  }

  return (
    <div>
      <WizardStepHeading
        title="Intelligence Network Seed"
        subtitle="Drop in URLs of stakeholders, advocates, academic orgs, trade associations, and other influencers. IRIS will start monitoring them daily."
      />

      <label className="block text-[12px] uppercase tracking-[0.1em] text-white/55 mb-2">
        Paste URLs
      </label>
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={flushText}
        onPaste={handlePaste}
        placeholder="Paste URLs in any format — one per line, comma-separated, from a spreadsheet, or mixed with text. We'll find them all."
        className="w-full rounded-md p-3 text-[14px] text-white placeholder:text-white/35 outline-none"
        style={{
          minHeight: 120,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-[13px] px-3 py-1.5 rounded-md text-white/75 hover:text-white"
          style={{ border: "1px solid rgba(255,255,255,0.15)" }}
        >
          Upload CSV or Excel
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
        <span className="text-[12px] text-white/45">
          {chips.length ? `${chips.length} URL${chips.length === 1 ? "" : "s"} ready` : "We'll extract URLs from any cell"}
        </span>
      </div>

      {chips.length === 0 && (
        <p className="mt-4 text-[13px] text-white/55 leading-relaxed">
          IRIS will monitor these sources daily and surface new signals — personnel changes,
          published comments, new reports, and policy shifts — directly in your Intelligence Feed.
        </p>
      )}

      {chips.length > 0 && (
        <div className="mt-5 space-y-2">
          {chips.map((c) => (
            <div
              key={c.url}
              className="flex items-center gap-3 px-3 py-2 rounded-md"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="flex-1 truncate text-[13px] text-white/85">{c.url}</span>
              <select
                value={c.category}
                onChange={(e) => setChipCategory(c.url, e.target.value as Category)}
                className="text-[11.5px] uppercase tracking-[0.08em] px-2 py-1 rounded bg-transparent text-white/80 outline-none"
                style={{ border: "1px solid rgba(196,154,43,0.4)", color: "#C49A2B" }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value} style={{ background: "#0A1628" }}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeChip(c.url)}
                className="text-[12px] text-white/50 hover:text-white px-2"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={onAdvance}
          className="text-[13px] text-white/55 hover:text-white underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
        <span className="text-[12px] text-white/40">
          You can add sources later from Intelligence → Sources.
        </span>
      </div>

      <WizardFooter
        step={5}
        onBack={onBack}
        onContinue={addToMission}
        continueLabel={busy ? "Adding…" : chips.length ? `Add ${chips.length} to Mission` : "Continue"}
      />
    </div>
  );
}
