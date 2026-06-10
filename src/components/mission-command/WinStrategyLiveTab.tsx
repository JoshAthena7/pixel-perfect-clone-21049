import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { Plus, X } from "lucide-react";
import { useIsAdmin, logAudit } from "@/lib/mission-helpers";

type WS = any;

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: "central_claim", label: "Central Claim" },
  { key: "discriminators", label: "Discriminators" },
  { key: "client_priorities", label: "Client Priorities" },
  { key: "value_proposition", label: "Value Proposition" },
  { key: "executive_summary", label: "Executive Summary" },
  { key: "evaluator_priorities", label: "Evaluator Priorities" },
  { key: "evaluator_hot_buttons", label: "Evaluator Hot Buttons" },
  { key: "risk_mitigation", label: "Risk Mitigation" },
];

export function WinStrategyLiveTab({ missionId, missionName }: { missionId: string; missionName: string }) {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [ws, setWs] = useState<WS | null>(null);
  const [bannerOn, setBannerOn] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ws-live", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("mission_win_strategy").select("*").eq("mission_id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["ws-audit", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_audit_log").select("*")
        .eq("mission_id", missionId).ilike("action", "%Win Strategy%")
        .order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  useEffect(() => { if (data && !ws) setWs(data); }, [data, ws]);

  const set = (k: string, v: any) => {
    setWs((s: any) => ({ ...s, [k]: v }));
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      if (!ws?.id) return;
      const { error } = await supabase.from("mission_win_strategy").update({ [k]: v } as any).eq("id", ws.id);
      if (error) { toast.error(error.message); return; }
      await logAudit({ missionId, action: `Win Strategy field updated: ${k}` });
      setBannerOn(true);
      window.setTimeout(() => setBannerOn(false), 5000);
      qc.invalidateQueries({ queryKey: ["ws-audit", missionId] });
    }, 1000);
  };

  const notifyTeam = async () => {
    const { data: team } = await supabase.from("mission_team_members").select("member_id").eq("mission_id", missionId);
    const rows = (team ?? []).map((t) => ({
      recipient_id: t.member_id, recipient_role: "specific_user",
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
  const competitors: any[] = Array.isArray(ws.known_competitors) ? ws.known_competitors : [];
  const proofPoints: any[] = Array.isArray(ws.proof_points) ? ws.proof_points : [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Win Strategy</h2>

      <div className="rounded-xl border-2 border-primary bg-card p-6 text-center space-y-2">
        <div className="text-xs uppercase tracking-wider text-primary font-semibold">North Star</div>
        <Textarea
          rows={3}
          value={ws.north_star_message ?? ""}
          onChange={(e) => set("north_star_message", e.target.value)}
          className="text-xl italic text-primary text-center border-0 bg-transparent focus-visible:ring-0 resize-none"
          placeholder="The North Star message…"
        />
      </div>

      {bannerOn && (
        <div className="rounded-lg bg-primary/15 border border-primary/40 p-3 flex items-center justify-between">
          <span className="text-sm">Win Strategy updated. IRIS has been informed.</span>
          <Button size="sm" onClick={notifyTeam}>Notify Team</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <Textarea rows={3} value={ws[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>

      <ListEditor
        label="Win Themes"
        items={winThemes}
        onChange={(v) => set("win_themes", v)}
        keys={["title", "description"]}
        leftBorder
      />
      <ListEditor
        label="Known Competitors"
        items={competitors}
        onChange={(v) => set("known_competitors", v)}
        keys={["name", "strengths", "weaknesses"]}
      />
      <ListEditor
        label="Proof Points"
        items={proofPoints}
        onChange={(v) => set("proof_points", v)}
        keys={["title", "evidence"]}
        numbered
      />

      <div>
        <h3 className="font-semibold mb-2">Recent Changes</h3>
        <div className="space-y-2">
          {(audit ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          )}
          {(audit ?? []).map((a: any) => (
            <div key={a.id} className="text-sm border-l-2 border-primary/40 pl-3">
              <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, h:mm a")}</span>
              <span className="ml-2">{a.action}</span>
              {a.performed_by_name && <span className="text-muted-foreground"> — {a.performed_by_name}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListEditor({
  label, items, onChange, keys, leftBorder, numbered,
}: {
  label: string;
  items: any[];
  onChange: (v: any[]) => void;
  keys: string[];
  leftBorder?: boolean;
  numbered?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className={`rounded border p-3 space-y-2 ${leftBorder ? "border-l-4 border-l-primary" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {numbered ? `#${idx + 1}` : `Item ${idx + 1}`}
              </span>
              <Button variant="ghost" size="icon" className="size-6"
                      onClick={() => onChange(items.filter((_, i) => i !== idx))}>
                <X className="size-3" />
              </Button>
            </div>
            {keys.map((k) => (
              <Input
                key={k}
                placeholder={k}
                value={it[k] ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...it, [k]: e.target.value };
                  onChange(next);
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm"
              onClick={() => onChange([...items, Object.fromEntries(keys.map((k) => [k, ""]))])}>
        <Plus className="size-4 mr-1" />Add
      </Button>
    </div>
  );
}
