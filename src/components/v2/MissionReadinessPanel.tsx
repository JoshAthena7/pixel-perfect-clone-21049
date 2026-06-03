import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { X, ArrowRight, CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { toast } from "sonner";

type Status = "pass" | "partial" | "fail" | "loading";

type Check = {
  key: string;
  title: string;
  status: Status;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  actionParams?: Record<string, string>;
};

export function MissionReadinessPanel({
  missionId,
  missionName,
  missionStatus,
  onClose,
}: {
  missionId: string;
  missionName: string;
  missionStatus: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [activating, setActivating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mission-readiness", missionId],
    queryFn: async () => {
      const [mission, vault, questions, gates, themes, sources] = await Promise.all([
        supabase.from("missions").select("id,state,program_type,status").eq("id", missionId).maybeSingle(),
        supabase
          .from("mission_library")
          .select("id,name,category")
          .eq("mission_id", missionId)
          .in("category", ["RFP", "Amendment"]),
        supabase
          .from("question_records")
          .select("id,assigned_writer_id,pens_down_date")
          .eq("mission_id", missionId),
        supabase.from("mission_review_gates").select("id,gate_name,target_date").eq("mission_id", missionId),
        supabase.from("win_themes").select("id,title,question_ids").eq("mission_id", missionId),
        supabase
          .from("atlas_sources")
          .select("id,knowledge_layer,mission_id,state_code,program_code")
          .or(`mission_id.eq.${missionId}`),
      ]);

      // Program/state level sources
      const m = mission.data;
      let programSources: any[] = [];
      if (m?.state || m?.program_type) {
        const orParts: string[] = [];
        if (m.program_type) orParts.push(`program_code.eq.${m.program_type}`);
        if (m.state) orParts.push(`state_code.eq.${m.state}`);
        if (orParts.length) {
          const { data: extra } = await supabase
            .from("atlas_sources")
            .select("id,knowledge_layer,state_code,program_code")
            .or(orParts.join(","));
          programSources = extra ?? [];
        }
      }

      return {
        mission: m,
        rfpDocs: vault.data ?? [],
        questions: questions.data ?? [],
        gates: gates.data ?? [],
        themes: themes.data ?? [],
        missionSources: sources.data ?? [],
        programSources,
      };
    },
  });

  const checks: Check[] = useMemo(() => {
    if (!data) {
      return Array.from({ length: 7 }).map((_, i) => ({
        key: String(i),
        title: "",
        status: "loading" as Status,
        detail: "",
      }));
    }

    const { rfpDocs, questions, gates, themes, missionSources, programSources } = data;
    const totalQ = questions.length;
    const withWriters = questions.filter((q: any) => q.assigned_writer_id).length;
    const withDates = questions.filter((q: any) => q.pens_down_date).length;
    const linkedThemeQs = new Set(
      themes.flatMap((t: any) => (Array.isArray(t.question_ids) ? t.question_ids : []))
    );
    const allSources = new Map<string, any>();
    [...missionSources, ...programSources].forEach((s) => allSources.set(s.id, s));
    const sourceCount = allSources.size;

    return [
      {
        key: "rfp",
        title: "RFP Uploaded",
        status: (rfpDocs.length > 0 ? "pass" : "fail") as Status,
        detail: rfpDocs.length > 0
          ? rfpDocs[0].name + (rfpDocs.length > 1 ? ` + ${rfpDocs.length - 1} more` : "")
          : "No RFP in Vault",
        actionLabel: rfpDocs.length > 0 ? undefined : "Upload RFP",
        actionHref: "/missions/$missionId/overview",
        actionParams: { missionId },
      },
      {
        key: "questions",
        title: "Questions Created",
        status: (totalQ > 0 ? "pass" : "fail") as Status,
        detail: totalQ > 0 ? `${totalQ} questions from RFP` : "No questions exist",
        actionLabel: totalQ > 0 ? undefined : "Parse RFP with IRIS",
        actionHref: "/olympus/questions",
      },
      {
        key: "writers",
        title: "Writers Assigned",
        status: (totalQ === 0
          ? "fail"
          : withWriters === totalQ
          ? "pass"
          : withWriters === 0
          ? "fail"
          : "partial") as Status,
        detail:
          totalQ === 0
            ? "No questions yet"
            : withWriters === totalQ
            ? `All ${totalQ} assigned`
            : `${withWriters} of ${totalQ} questions have writers assigned`,
        actionLabel: withWriters === totalQ && totalQ > 0 ? undefined : "Assign Writers",
        actionHref: "/olympus/questions",
      },
      {
        key: "pens-down",
        title: "Pens Down Dates Set",
        status: (totalQ === 0
          ? "fail"
          : withDates === totalQ
          ? "pass"
          : withDates === 0
          ? "fail"
          : "partial") as Status,
        detail:
          totalQ === 0
            ? "No questions yet"
            : withDates === totalQ
            ? `All ${totalQ} dated`
            : `${withDates} of ${totalQ} have pens-down dates`,
        actionLabel: withDates === totalQ && totalQ > 0 ? undefined : "Set Dates",
        actionHref: "/olympus/questions",
      },
      {
        key: "gates",
        title: "Review Gate Created",
        status: (gates.length > 0 ? "pass" : "fail") as Status,
        detail:
          gates.length > 0
            ? `${gates[0].gate_name}${gates[0].target_date ? " · " + new Date(gates[0].target_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}${gates.length > 1 ? ` (+${gates.length - 1})` : ""}`
            : "No gates configured",
        actionLabel: gates.length > 0 ? undefined : "Create Gate",
        actionHref: "/olympus/gates",
      },
      {
        key: "themes",
        title: "Win Themes",
        status: (themes.length === 0
          ? "fail"
          : linkedThemeQs.size === 0
          ? "partial"
          : "pass") as Status,
        detail:
          themes.length === 0
            ? "No win themes"
            : linkedThemeQs.size === 0
            ? `${themes.length} themes created · 0 questions linked`
            : `${themes.length} theme${themes.length > 1 ? "s" : ""} · ${linkedThemeQs.size} question${linkedThemeQs.size > 1 ? "s" : ""} linked`,
        actionLabel:
          themes.length === 0
            ? "Add Win Themes"
            : linkedThemeQs.size === 0
            ? "Link Questions"
            : undefined,
        actionHref: "/olympus/win-themes",
      },
      {
        key: "intel",
        title: "Intelligence Active",
        status: (sourceCount >= 5 ? "pass" : sourceCount >= 1 ? "partial" : "fail") as Status,
        detail:
          sourceCount === 0
            ? "No sources ingested"
            : `${sourceCount} source${sourceCount > 1 ? "s" : ""} ingested`,
        actionLabel: sourceCount >= 5 ? undefined : "Find Sources with IRIS",
        actionHref: "/olympus/source-finder",
      },
    ];
  }, [data, missionId]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const allReady = passed === 7 && !isLoading;
  const isActive = (missionStatus ?? "").toLowerCase() === "active";

  async function activate(force: boolean) {
    if (force) {
      if (
        !confirm(
          "Mission will activate with incomplete setup. Some features may not work correctly. Continue?"
        )
      )
        return;
    }
    setActivating(true);
    const { error } = await supabase.from("missions").update({ status: "Active" }).eq("id", missionId);
    setActivating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mission activated");
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    qc.invalidateQueries({ queryKey: ["mission-readiness", missionId] });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[12px] border border-border bg-background shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Mission Readiness</div>
            <h2 className="h1-display mt-1 text-xl">{missionName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Progress</span>
            <span className="text-sm tabular-nums font-medium">
              {isLoading ? "—" : `${passed}/7`}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
            <div
              className={`h-full transition-all ${allReady ? "bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${(passed / 7) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {checks.map((c) => (
            <CheckRow key={c.key} check={c} onAction={onClose} />
          ))}
        </div>

        <footer className="border-t border-border px-6 py-4 flex items-center justify-between gap-3">
          {isActive ? (
            <div className="text-sm text-muted-foreground">Mission is already active.</div>
          ) : allReady ? (
            <>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
                <span className="dot dot-green" /> Ready to activate
              </div>
              <button
                onClick={() => activate(false)}
                disabled={activating}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 transition disabled:opacity-50"
              >
                Activate Mission <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Complete all 7 checks to activate cleanly.
              </div>
              <button
                onClick={() => activate(true)}
                disabled={activating || isLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-2 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground transition disabled:opacity-50"
              >
                Activate Anyway
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function CheckRow({ check, onAction }: { check: Check; onAction: () => void }) {
  const { status, title, detail, actionLabel, actionHref, actionParams } = check;

  const icon =
    status === "pass" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : status === "partial" ? (
      <AlertTriangle className="h-4 w-4 text-amber-400" />
    ) : status === "fail" ? (
      <Circle className="h-4 w-4 text-red-400" />
    ) : (
      <div className="h-4 w-4 rounded-full bg-surface animate-pulse" />
    );

  const titleColor =
    status === "pass" ? "text-foreground" : status === "partial" ? "text-amber-300" : status === "fail" ? "text-red-300" : "text-muted-foreground";

  return (
    <div className="flex items-start gap-3 rounded-md px-2 py-3 hover:bg-surface-hover/40">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${titleColor}`}>
          {title || <span className="inline-block h-3 w-32 bg-surface rounded animate-pulse" />}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
      </div>
      {actionLabel && actionHref && (
        <Link
          to={actionHref as any}
          params={actionParams as any}
          onClick={onAction}
          className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          {actionLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/** Compact readiness chip used inside the missions table. */
export function ReadinessChip({
  missionId,
  onClick,
}: {
  missionId: string;
  onClick: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["mission-readiness-chip", missionId],
    queryFn: async () => {
      const [vault, questions, gates, themes, sources, mission] = await Promise.all([
        supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId).in("category", ["RFP", "Amendment"]),
        supabase.from("question_records").select("id,assigned_writer_id,pens_down_date").eq("mission_id", missionId),
        supabase.from("mission_review_gates").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("win_themes").select("id,question_ids").eq("mission_id", missionId),
        supabase.from("atlas_sources").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("missions").select("state,program_type").eq("id", missionId).maybeSingle(),
      ]);

      let extraSources = 0;
      const m = mission.data;
      if (m?.state || m?.program_type) {
        const orParts: string[] = [];
        if (m.program_type) orParts.push(`program_code.eq.${m.program_type}`);
        if (m.state) orParts.push(`state_code.eq.${m.state}`);
        if (orParts.length) {
          const { count } = await supabase
            .from("atlas_sources")
            .select("id", { count: "exact", head: true })
            .or(orParts.join(","));
          extraSources = count ?? 0;
        }
      }
      const sourceCount = (sources.count ?? 0) + extraSources;

      const qs = questions.data ?? [];
      const totalQ = qs.length;
      const withWriters = qs.filter((q: any) => q.assigned_writer_id).length;
      const withDates = qs.filter((q: any) => q.pens_down_date).length;
      const themesList = themes.data ?? [];
      const linked = new Set(themesList.flatMap((t: any) => t.question_ids ?? []));

      let pass = 0;
      if ((vault.count ?? 0) > 0) pass++;
      if (totalQ > 0) pass++;
      if (totalQ > 0 && withWriters === totalQ) pass++;
      if (totalQ > 0 && withDates === totalQ) pass++;
      if ((gates.count ?? 0) > 0) pass++;
      if (themesList.length > 0 && linked.size > 0) pass++;
      if (sourceCount >= 5) pass++;
      return pass;
    },
    staleTime: 30_000,
  });

  const passed = data ?? 0;
  const cls =
    passed === 7 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : passed >= 4 ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
    : "text-muted-foreground border-border bg-surface";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Open readiness checklist"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${cls} hover:opacity-90`}
    >
      {data === undefined ? "…/7" : `${passed}/7`} <ArrowRight className="h-3 w-3" />
    </button>
  );
}
