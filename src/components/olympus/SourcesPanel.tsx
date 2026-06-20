import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOlympusSources, addOlympusSource } from "@/lib/olympus.functions";
import { runOracleStage } from "@/lib/oracle-pipeline.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Source = {
  id: string;
  source_name: string;
  source_url: string;
  tier: string;
  state_code: string | null;
  status: string;
  last_checked_at: string | null;
  error_count: number;
  error_message: string | null;
  check_frequency_hours: number;
  default_category: string;
  default_subcategory: string;
  source_type: string;
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function SourcesPanel() {
  const fn = useServerFn(listOlympusSources);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["olympus", "sources"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const sources = (q.data?.sources ?? []) as Source[];

  const togglePause = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("oracle_source_registry").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["olympus", "sources"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const runStage = useServerFn(runOracleStage);
  const checkNow = useMutation({
    mutationFn: () => runStage({ data: { stage: "scraper" } }),
    onSuccess: () => toast.success("Scraper run started"),
    onError: (e: Error) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-2">
      {q.isLoading ? (
        <div className="text-[12px] text-white/40 py-4">Loading sources…</div>
      ) : sources.length === 0 ? (
        <div className="text-[12px] text-white/40 py-4">No sources registered.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              s={s}
              onToggle={() =>
                togglePause.mutate({ id: s.id, status: s.status === "active" ? "paused" : "active" })
              }
              onCheck={() => checkNow.mutate()}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setShowAdd((v) => !v)}
        className="w-full text-[11px] border border-white/20 rounded py-1.5 text-white/70 hover:bg-white/5"
      >
        {showAdd ? "Cancel" : "+ Add Source"}
      </button>

      {showAdd && <AddSourceForm onDone={() => { setShowAdd(false); q.refetch(); }} />}
    </div>
  );
}

function SourceRow({
  s,
  onToggle,
  onCheck,
}: {
  s: Source;
  onToggle: () => void;
  onCheck: () => void;
}) {
  const dot =
    s.status === "active" ? "bg-emerald-400" :
    s.status === "paused" ? "bg-amber-400" :
    "bg-red-400";
  const tierBadge =
    s.tier === "platform" ? "border-violet-400/40 text-violet-300" :
    s.tier === "state" ? "border-sky-400/40 text-sky-300" :
    "border-amber-400/40 text-amber-300";

  return (
    <div className="py-2 px-1">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-[12px] text-white/90 truncate flex-1">{s.source_name}</span>
        <span className={`text-[11px] px-1 py-0.5 rounded border ${tierBadge}`}>{s.tier}</span>
      </div>
      <div className="text-[11px] text-white/40 mb-1.5">
        Checked {relative(s.last_checked_at)} · every {s.check_frequency_hours}h
        {s.error_count > 0 && <span className="text-red-400 ml-1">· {s.error_count} errors</span>}
      </div>
      <div className="flex gap-1">
        <button
          onClick={onToggle}
          className="text-[11px] border border-white/20 rounded px-2 py-0.5 text-white/70 hover:bg-white/5"
        >
          {s.status === "active" ? "Pause" : "Resume"}
        </button>
        <button
          onClick={onCheck}
          className="text-[11px] border border-white/20 rounded px-2 py-0.5 text-white/70 hover:bg-white/5"
        >
          Check Now
        </button>
      </div>
    </div>
  );
}

function AddSourceForm({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(addOlympusSource);
  const [form, setForm] = useState({
    source_name: "",
    source_url: "",
    feed_url: "",
    source_type: "html_scrape",
    default_category: "regulatory_state",
    default_subcategory: "state_plan",
    check_frequency_hours: 4,
    tier: "state" as "platform" | "state" | "mission",
    state_code: "",
  });

  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          source_name: form.source_name,
          source_url: form.source_url,
          feed_url: form.feed_url || null,
          source_type: form.source_type,
          default_category: form.default_category,
          default_subcategory: form.default_subcategory,
          check_frequency_hours: form.check_frequency_hours,
          tier: form.tier,
          state_code: form.tier === "state" ? form.state_code.toUpperCase() : null,
        },
      }),
    onSuccess: () => { toast.success("Source added"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const input = "w-full bg-transparent border border-white/15 rounded px-2 py-1 text-[12px] text-white/90";

  return (
    <div className="space-y-2 p-2 border border-white/10 rounded">
      <input className={input} placeholder="Source name" value={form.source_name}
        onChange={(e) => setForm({ ...form, source_name: e.target.value })} />
      <input className={input} placeholder="Source URL (https://...)" value={form.source_url}
        onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
      <input className={input} placeholder="Feed URL (optional)" value={form.feed_url}
        onChange={(e) => setForm({ ...form, feed_url: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value as "platform" | "state" | "mission" })}>
          <option value="platform" className="bg-[#070f1c]">platform</option>
          <option value="state" className="bg-[#070f1c]">state</option>
          <option value="mission" className="bg-[#070f1c]">mission</option>
        </select>
        <input className={input} placeholder="State (NJ)" maxLength={2} value={form.state_code}
          onChange={(e) => setForm({ ...form, state_code: e.target.value })} />
        <select className={input} value={form.check_frequency_hours}
          onChange={(e) => setForm({ ...form, check_frequency_hours: Number(e.target.value) })}>
          {[1, 4, 12, 24, 48].map((h) => (
            <option key={h} value={h} className="bg-[#070f1c]">{h}h</option>
          ))}
        </select>
        <select className={input} value={form.source_type}
          onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
          <option value="html_scrape" className="bg-[#070f1c]">html_scrape</option>
          <option value="rss" className="bg-[#070f1c]">rss</option>
          <option value="api" className="bg-[#070f1c]">api</option>
        </select>
      </div>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending || !form.source_name || !form.source_url}
        className="w-full text-[11px] border border-amber-400/60 text-amber-300 rounded py-1.5 hover:bg-amber-400/10 disabled:opacity-50"
      >
        {m.isPending ? "Saving…" : "Save Source"}
      </button>
    </div>
  );
}
