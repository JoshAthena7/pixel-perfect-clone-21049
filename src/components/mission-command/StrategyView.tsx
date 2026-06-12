import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronRight, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { useIsAdmin, logAudit } from "@/lib/mission-helpers";

const GOLD = "#c9a84c";

type WS = any;

const ACCORDION_FIELDS: { key: string; label: string }[] = [
  { key: "discriminators", label: "Discriminators" },
  { key: "client_priorities", label: "Client Priorities" },
  { key: "value_proposition", label: "Value Proposition" },
  { key: "executive_summary", label: "Executive Summary" },
  { key: "risk_mitigation", label: "Risk Mitigation" },
];

function previewText(s: string | null | undefined, n = 110): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

export function StrategyView({ missionId, missionName }: { missionId: string; missionName: string }) {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [ws, setWs] = useState<WS | null>(null);
  const [bannerOn, setBannerOn] = useState(false);
  const debounce = useRef<number | undefined>(undefined);
  const bannerTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(debounce.current);
      window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ws-live", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_win_strategy")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["ws-audit", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_audit_log")
        .select("*")
        .eq("mission_id", missionId)
        .ilike("action", "%Win Strategy%")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (data && !ws) setWs(data);
  }, [data, ws]);

  const set = (k: string, v: any) => {
    setWs((s: any) => ({ ...s, [k]: v }));
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      if (!ws?.id) return;
      const { error } = await supabase
        .from("mission_win_strategy")
        .update({ [k]: v } as any)
        .eq("id", ws.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit({ missionId, action: `Win Strategy field updated: ${k}` });
      setBannerOn(true);
      window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(() => setBannerOn(false), 5000);
      qc.invalidateQueries({ queryKey: ["ws-audit", missionId] });
    }, 1000);
  };

  const notifyTeam = async () => {
    const { data: team } = await supabase
      .from("mission_team_members")
      .select("member_id")
      .eq("mission_id", missionId);
    const rows = (team ?? []).map((t) => ({
      recipient_id: t.member_id,
      recipient_role: "specific_user",
      type: "win_strategy_updated",
      message: `The Win Strategy for ${missionName} has been updated. Review before your next writing session.`,
      metadata: { mission_id: missionId },
    }));
    if (rows.length) await supabase.from("atlas_notifications").insert(rows);
    await logAudit({ missionId, action: "Win Strategy: Team notified" });
    toast.success("Team notified.");
  };

  if (isError) return <ErrorState message="Couldn't load the win strategy." onRetry={() => refetch()} />;
  if (roleLoading || isLoading || !ws) {
    if (!roleLoading && !isAdmin) {
      return (
        <EmptyState
          title="Admin only"
          description="The win strategy is restricted to mission administrators."
        />
      );
    }
    return <SkeletonRows rows={6} height="h-24" />;
  }
  if (!isAdmin) return null;

  const winThemes: any[] = Array.isArray(ws.win_themes) ? ws.win_themes : [];
  const proofPoints: any[] = Array.isArray(ws.proof_points) ? ws.proof_points : [];

  return (
    <div className="space-y-5">
      {/* 1. North Star + Central Claim — featured gold-bordered card */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{
          background: "rgba(201,168,76,0.06)",
          border: `1px solid rgba(201,168,76,0.35)`,
          borderLeft: `3px solid ${GOLD}`,
        }}
      >
        <div>
          <div
            style={{
              color: GOLD,
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            North Star
          </div>
          <Textarea
            rows={2}
            value={ws.north_star_message ?? ""}
            onChange={(e) => set("north_star_message", e.target.value)}
            className="mt-1.5 text-lg italic text-primary border-0 bg-transparent focus-visible:ring-0 resize-none px-0"
            placeholder="The North Star message…"
          />
        </div>
        <div className="pt-3" style={{ borderTop: `0.5px solid rgba(201,168,76,0.25)` }}>
          <div
            style={{
              color: GOLD,
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            Central Claim
          </div>
          <Textarea
            rows={3}
            value={ws.central_claim ?? ""}
            onChange={(e) => set("central_claim", e.target.value)}
            className="mt-1.5 border-0 bg-transparent focus-visible:ring-0 resize-none px-0"
            placeholder="Why should the evaluator choose our client?"
            style={{ fontSize: 13, lineHeight: 1.6 }}
          />
        </div>
      </div>

      {bannerOn && (
        <div className="rounded-lg bg-primary/15 border border-primary/40 p-3 flex items-center justify-between">
          <span className="text-sm">Win Strategy updated. IRIS has been informed.</span>
          <Button size="sm" onClick={notifyTeam}>
            Notify Team
          </Button>
        </div>
      )}

      {/* 2. Win Themes — 3 col card grid */}
      <div>
        <SectionLabel>Win Themes</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          {winThemes.map((t, idx) => (
            <div
              key={idx}
              className="rounded-lg p-3 space-y-2 relative"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "0.5px solid rgba(255,255,255,0.06)",
                borderLeft: `3px solid ${GOLD}`,
              }}
            >
              <button
                onClick={() => set("win_themes", winThemes.filter((_, i) => i !== idx))}
                className="absolute top-2 right-2 opacity-50 hover:opacity-100"
                title="Remove"
              >
                <X className="size-3" />
              </button>
              <Input
                value={t.title ?? ""}
                onChange={(e) => {
                  const next = [...winThemes];
                  next[idx] = { ...t, title: e.target.value };
                  set("win_themes", next);
                }}
                placeholder="Theme title"
                className="font-semibold bg-transparent border-0 px-0 h-auto py-0 focus-visible:ring-0"
                style={{ fontSize: 13, color: "white" }}
              />
              <Textarea
                rows={3}
                value={t.description ?? ""}
                onChange={(e) => {
                  const next = [...winThemes];
                  next[idx] = { ...t, description: e.target.value };
                  set("win_themes", next);
                }}
                placeholder="Supporting message"
                className="bg-transparent border-0 px-0 py-0 focus-visible:ring-0 resize-none"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set("win_themes", [...winThemes, { title: "", description: "" }])
            }
            className="rounded-lg p-3 flex items-center justify-center gap-1 hover:bg-white/[0.03]"
            style={{
              border: "0.5px dashed rgba(255,255,255,0.15)",
              color: GOLD,
              fontSize: 11,
              minHeight: 90,
            }}
          >
            <Plus className="size-3.5" /> Add Win Theme
          </button>
        </div>
      </div>

      {/* 3. Evaluator Priorities + Hot Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FieldCard
          label="Evaluator Priorities"
          value={ws.evaluator_priorities}
          onChange={(v) => set("evaluator_priorities", v)}
        />
        <FieldCard
          label="Evaluator Hot Buttons"
          value={ws.evaluator_hot_buttons}
          onChange={(v) => set("evaluator_hot_buttons", v)}
        />
      </div>

      {/* 4. Accordion fields */}
      <div className="space-y-2">
        {ACCORDION_FIELDS.map((f) => (
          <Accordion key={f.key} label={f.label} value={ws[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
        ))}
      </div>

      {/* 5. Proof Points — arrow-card list */}
      <div>
        <SectionLabel>Proof Points</SectionLabel>
        <div className="mt-2 space-y-2">
          {proofPoints.map((p, idx) => (
            <div
              key={idx}
              className="rounded-lg p-3 flex items-start gap-3 group"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)" }}
            >
              <span style={{ color: GOLD, fontSize: 14, lineHeight: 1, marginTop: 2 }}>→</span>
              <div className="flex-1 space-y-1.5 min-w-0">
                <Input
                  value={p.title ?? ""}
                  onChange={(e) => {
                    const next = [...proofPoints];
                    next[idx] = { ...p, title: e.target.value };
                    set("proof_points", next);
                  }}
                  placeholder="Proof point"
                  className="bg-transparent border-0 px-0 h-auto py-0 focus-visible:ring-0"
                  style={{ fontSize: 12, color: "white", fontWeight: 500 }}
                />
                <Input
                  value={p.evidence ?? ""}
                  onChange={(e) => {
                    const next = [...proofPoints];
                    next[idx] = { ...p, evidence: e.target.value };
                    set("proof_points", next);
                  }}
                  placeholder="Evidence"
                  className="bg-transparent border-0 px-0 h-auto py-0 focus-visible:ring-0"
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}
                />
              </div>
              <button
                onClick={() => set("proof_points", proofPoints.filter((_, i) => i !== idx))}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                title="Remove"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("proof_points", [...proofPoints, { title: "", evidence: "" }])}
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: GOLD, fontSize: 11 }}
          >
            <Plus className="size-3.5" /> Add proof point
          </button>
        </div>
      </div>

      {/* 6. Recent Changes — compact activity feed */}
      <div>
        <SectionLabel>Recent Changes</SectionLabel>
        <div className="mt-2 space-y-1">
          {(audit ?? []).length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>
              No changes yet.
            </p>
          ) : (
            (audit ?? []).map((a: any) => (
              <div
                key={a.id}
                className="flex items-baseline gap-2 py-1"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}
              >
                <span style={{ color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>
                  {format(new Date(a.created_at), "MMM d HH:mm")}
                </span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                <span>{a.action.replace(/^Win Strategy[:\s]*/, "")}</span>
                {a.performed_by_name && (
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>· {a.performed_by_name}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function FieldCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)" }}
    >
      <SectionLabel>{label}</SectionLabel>
      <Textarea
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 bg-transparent border-0 px-0 py-0 focus-visible:ring-0 resize-none"
        style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}
      />
    </div>
  );
}

function Accordion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-3 py-2.5 text-left hover:bg-white/[0.02]"
      >
        <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
          <div className="truncate" style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
            {value ? previewText(value) : <span style={{ fontStyle: "italic" }}>Not yet set</span>}
          </div>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform"
            style={{ color: GOLD, transform: open ? "rotate(90deg)" : "none" }}
          />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          <Textarea
            rows={5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Add ${label.toLowerCase()}…`}
          />
        </div>
      )}
    </div>
  );
}
