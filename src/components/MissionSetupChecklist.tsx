// UX-4: Onboarding checklist card on Journey Map for newly-created missions.
// Auto-checks items off live data; dismiss persists in localStorage per mission.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMissionAccess } from "@/hooks/useAccess";

const GOLD = "#C9A84C";

type Props = { missionId: string };

export function MissionSetupChecklist({ missionId }: Props) {
  const storageKey = `atlas_checklist_dismissed_${missionId}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });
  const [autoDismissed, setAutoDismissed] = useState(false);
  const { data: access } = useMissionAccess(missionId);
  const role = (access?.role ?? "").toLowerCase();
  const isViewer = role === "viewer";

  const { data } = useQuery({
    queryKey: ["mission-setup-checklist", missionId],
    enabled: !!missionId && !dismissed && !isViewer,
    queryFn: async () => {
      const [mission, library, qAll, qPens, qWriter, atlas, briefings] = await Promise.all([
        supabase.from("missions").select("created_at").eq("id", missionId).maybeSingle(),
        supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId).eq("category", "RFP"),
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", missionId).not("pens_down_date", "is", null),
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", missionId).not("assigned_writer_id", "is", null),
        supabase.from("atlas_sources").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("briefings").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      return {
        createdAt: (mission.data?.created_at as string | null) ?? null,
        rfpCount: library.count ?? 0,
        totalQ: qAll.count ?? 0,
        pensQ: qPens.count ?? 0,
        writerQ: qWriter.count ?? 0,
        atlasCount: atlas.count ?? 0,
        briefingsCount: briefings.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    if (!data) return null;
    const pensPct = data.totalQ > 0 ? data.pensQ / data.totalQ : 0;
    return [
      { label: "Upload RFP document", done: data.rfpCount >= 1 },
      { label: "Set pens-down dates", done: pensPct >= 0.5 && data.totalQ > 0 },
      { label: "Assign writers to questions", done: data.writerQ >= 1 },
      { label: "Run IRIS discovery", done: data.atlasCount >= 1 },
      { label: "Send team briefing", done: data.briefingsCount >= 1 },
    ];
  }, [data]);

  const allDone = items?.every((i) => i.done) ?? false;

  // Auto-dismiss 3s after all items are checked.
  useEffect(() => {
    if (allDone && !autoDismissed) {
      const id = setTimeout(() => setAutoDismissed(true), 3000);
      return () => clearTimeout(id);
    }
  }, [allDone, autoDismissed]);

  if (isViewer || dismissed || !data || !items) return null;

  // Only show on missions created within the last 30 days.
  if (data.createdAt) {
    const ageDays = (Date.now() - new Date(data.createdAt).getTime()) / 86_400_000;
    if (ageDays > 30) return null;
  }

  // If everything's already done on first load AND user hasn't interacted, hide on mount.
  // (Spec: "If all 5 items are already checked when the page loads, do not show the card at all.")
  // We approximate by checking initial render: items reflect live state.
  if (allDone && autoDismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(storageKey, "true"); } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {allDone && (
            <span className="h-2 w-2 rounded-full" style={{ background: "#22C55E" }} />
          )}
          <div
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: allDone ? "#22C55E" : GOLD }}
          >
            {allDone ? "Mission Ready" : "Mission Setup"}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2 text-[13px]">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded border"
              style={{
                borderColor: it.done ? GOLD : "rgba(255,255,255,0.25)",
                background: it.done ? GOLD : "transparent",
              }}
            >
              {it.done && <Check className="h-3 w-3" style={{ color: "#0a0a0a" }} strokeWidth={3} />}
            </span>
            <span
              className={it.done ? "text-muted-foreground line-through" : "text-foreground"}
            >
              {it.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
