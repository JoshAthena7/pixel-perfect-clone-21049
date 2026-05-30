import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEngagement } from "@/hooks/use-engagement";
import { useNeedsAttention, type AttentionItem, type AttentionType } from "@/hooks/use-needs-attention";
import { useComms } from "@/hooks/use-comms";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { relativeTime } from "@/lib/time";
import { HandHelping, Siren, AlertTriangle, CalendarX, Frown, Check } from "lucide-react";
import { toast } from "sonner";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export const Route = createFileRoute("/_authenticated/needs-attention")({
  head: () => ({ meta: [{ title: "Active Signals — Athena" }] }),
  component: Gate,
});

function Gate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <NeedsAttentionPage />;
}

const TYPE_META: Record<AttentionType, { color: string; label: string; icon: ComponentType<LucideProps> }> = {
  stuck:    { color: "#BA7517", label: "Stuck",    icon: HandHelping },
  sos:      { color: "#A32D2D", label: "SOS",      icon: Siren },
  risk:     { color: "#f97316", label: "Risk",     icon: AlertTriangle },
  overdue:  { color: "#ef4444", label: "Overdue",  icon: CalendarX },
  morale:   { color: "#533AB7", label: "Morale",   icon: Frown },
};

function NeedsAttentionPage() {
  const { engagement } = useEngagement();
  const { items, loading } = useNeedsAttention(engagement?.id);

  const active = items.filter((i) => !i.resolved);
  const resolved = items.filter((i) => i.resolved);

  return (
    <div className="w-full max-w-4xl mx-auto px-5 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Active Signals</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything requiring lead action, in one feed.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No items need attention right now</div>
      ) : (
        <>
          <ul className="space-y-2">
            {active.map((item) => <Card key={item.key} item={item} />)}
            {active.length === 0 && (
              <li className="text-sm text-muted-foreground">No active items — all caught up.</li>
            )}
          </ul>
          {resolved.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Resolved · {resolved.length}
              </div>
              <ul className="space-y-2">
                {resolved.map((item) => <Card key={item.key} item={item} />)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ item }: { item: AttentionItem }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const muted = item.resolved;

  return (
    <li
      className="rounded-lg flex gap-3 items-start px-4 py-3 transition"
      style={{
        background: muted ? "rgba(255,255,255,0.02)" : "#1a2333",
        borderLeft: `3px solid ${muted ? "rgba(255,255,255,0.15)" : meta.color}`,
        border: "0.5px solid rgba(255,255,255,0.08)",
        opacity: muted ? 0.55 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: meta.color,
              background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
              border: `0.5px solid color-mix(in oklab, ${meta.color} 45%, transparent)`,
            }}
          >
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          {item.writer_name && <span className="text-[12px] font-medium">{item.writer_name}</span>}
          {item.section_name && item.type !== "stuck" && (
            <span className="text-[12px] text-muted-foreground">· {item.section_name}</span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(item.created_at)}</span>
        </div>
        <div className="text-sm text-white/85 line-clamp-2">{item.description}</div>
        {muted && item.resolved_at && (
          <div className="text-[11px] text-muted-foreground mt-1">Resolved {relativeTime(item.resolved_at)}</div>
        )}
      </div>
      <ActionButton item={item} />
    </li>
  );
}

function ActionButton({ item }: { item: AttentionItem }) {
  const { openChatWith } = useComms();
  const { user } = useSession();
  const { engagement, member } = useEngagement();

  if (item.resolved) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-1">
        <Check className="h-3 w-3" /> Done
      </span>
    );
  }

  async function resolveStuck() {
    const { error } = await supabase.from("stuck_flags").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", item.source_id);
    if (error) toast.error(error.message);
    else toast.success("Marked resolved");
  }

  async function ack(type: "morale" | "overdue") {
    if (!engagement || !user || !member) return;
    const { error } = await supabase.from("attention_acks").insert({
      engagement_id: engagement.id,
      type,
      source_key: item.source_id,
      acknowledged_by: user.id,
      acknowledged_by_name: member.display_name,
    });
    if (error && !error.message.includes("duplicate")) toast.error(error.message);
    else toast.success("Acknowledged");
  }

  async function contactWriter() {
    if (!item.assignment_user_id) return ack("overdue");
    const { data } = await supabase
      .from("engagement_members")
      .select("id, display_name")
      .eq("engagement_id", engagement?.id ?? "")
      .eq("user_id", item.assignment_user_id)
      .maybeSingle();
    if (data) openChatWith(data.id, data.display_name);
    await ack("overdue");
  }

  const btn = "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0";

  if (item.type === "stuck") return <button type="button" onClick={resolveStuck} className={btn}>Mark resolved</button>;
  if (item.type === "sos") return <Link to="/issues" className={btn}>Open issue</Link>;
  if (item.type === "risk") return <Link to="/issues" className={btn}>Open issue</Link>;
  if (item.type === "overdue") return <button type="button" onClick={contactWriter} className={btn}>Contact writer</button>;
  if (item.type === "morale") return <button type="button" onClick={() => ack("morale")} className={btn}>Acknowledge</button>;
  return null;
}
