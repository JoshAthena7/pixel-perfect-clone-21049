import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { listStateIntelPacks, createStateIntelPack } from "@/lib/state-intel/state-intel.functions";
import { US_STATES, TOTAL_CATEGORIES } from "@/lib/state-intel/categories";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function CompletenessRing({ filled, total }: { filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100);
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 75 ? "#22c55e" : pct >= 40 ? "#c9a84c" : "#ef4444";
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 52 52" className="w-full h-full -rotate-90">
        <circle cx="26" cy="26" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
        <circle
          cx="26" cy="26" r={r}
          stroke={color} strokeWidth="4" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-semibold text-white">{filled}/{total}</span>
      </div>
    </div>
  );
}

function isStale(iso: string | null | undefined) {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 1000 * 60 * 60 * 24 * 180; // 6 months
}

export function StateIntelGrid() {
  const list = useServerFn(listStateIntelPacks);
  const create = useServerFn(createStateIntelPack);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>("");

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["state-intel-packs"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) =>
      create({ data: { stateCode: code, stateName: name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["state-intel-packs"] });
      toast.success("State added");
      setOpen(false);
      setPicked("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add state"),
  });

  const existingCodes = new Set(packs.map((p) => p.state_code));
  const remaining = US_STATES.filter((s) => !existingCodes.has(s.code));

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-semibold text-white">State Intelligence Packs</h1>
          <p className="text-sm text-white/55 mt-1">
            One per state — uploaded once, inherited by every mission in that state.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Add state
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-white/55 mt-8">Loading…</div>
      ) : packs.length === 0 ? (
        <div className="mt-12 border border-dashed border-white/10 rounded-lg p-8 text-center">
          <p className="text-sm text-white/60">No state packs yet. Add a state to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-6">
          {packs.map((p) => {
            const stale = isStale(p.last_reviewed_at);
            return (
              <Link
                key={p.state_code}
                to="/admin/state-intel/$stateCode"
                params={{ stateCode: p.state_code }}
                className="group rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:border-white/20 hover:bg-white/[0.04] transition"
              >
                <div className="flex items-start gap-3">
                  <CompletenessRing filled={p.categories_filled} total={TOTAL_CATEGORIES} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[#c9a84c]">{p.state_code}</span>
                      {stale && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 uppercase tracking-wide">
                          Stale
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-white truncate mt-0.5">{p.state_name}</div>
                    <div className="text-[11px] text-white/45 mt-1">
                      {p.last_reviewed_at
                        ? `Reviewed ${new Date(p.last_reviewed_at).toLocaleDateString()}`
                        : "Never reviewed"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add State Intelligence Pack</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-white/55 mb-1 block">State</label>
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a state…" />
              </SelectTrigger>
              <SelectContent>
                {remaining.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!picked || createMut.isPending}
              onClick={() => {
                const s = US_STATES.find((x) => x.code === picked);
                if (s) createMut.mutate({ code: s.code, name: s.name });
              }}
            >
              {createMut.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
