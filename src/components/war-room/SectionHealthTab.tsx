import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useComms } from "@/hooks/use-comms";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";

type Assignment = {
  id: string;
  section_id: string;
  user_id: string;
  status: string;
  due_date: string | null;
  updated_at: string;
  section_name: string;
  writer_name: string;
  member_id: string | null;
};

type WriterRow = {
  user_id: string;
  member_id: string;
  display_name: string;
  last_seen: string | null;
  section_count: number;
  all_complete: boolean;
};

const HOUR = 60 * 60 * 1000;

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function hoursUntil(date: string) {
  return (new Date(date + "T23:59:59").getTime() - Date.now()) / HOUR;
}

function countdownColor(hours: number) {
  if (hours <= 24) return "#ef4444";
  if (hours <= 48) return "#f97316";
  if (hours <= 72) return "#eab308";
  return "var(--muted-foreground)";
}

function countdownLabel(due: string) {
  const h = hoursUntil(due);
  if (h < 0) return "Overdue";
  if (h <= 24) return "Due today";
  if (h <= 48) return "Due tomorrow";
  return `Due in ${Math.ceil(h / 24)} days`;
}

export function SectionHealthTab() {
  const { engagement } = useEngagement();
  const { sendNudge, openChatWith } = useComms();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [writers, setWriters] = useState<WriterRow[]>([]);

  async function load() {
    if (!engagement) return;
    const [{ data: a }, { data: members }, { data: pres }] = await Promise.all([
      supabase
        .from("section_assignments")
        .select("id, section_id, user_id, status, due_date, updated_at, heatmap_sections(section_name)")
        .eq("engagement_id", engagement.id),
      supabase
        .from("engagement_members")
        .select("id, user_id, display_name, role")
        .eq("engagement_id", engagement.id),
      supabase
        .from("presence")
        .select("user_id, last_seen")
        .eq("engagement_id", engagement.id),
    ]);

    const memberByUser = new Map<string, { id: string; display_name: string; role: string }>();
    (members ?? []).forEach((m: any) => {
      if (m.user_id) memberByUser.set(m.user_id, m);
    });
    const presByUser = new Map<string, string>();
    (pres ?? []).forEach((p: any) => presByUser.set(p.user_id, p.last_seen));

    const enriched: Assignment[] = (a ?? []).map((row: any) => {
      const m = memberByUser.get(row.user_id);
      return {
        id: row.id,
        section_id: row.section_id,
        user_id: row.user_id,
        status: row.status,
        due_date: row.due_date,
        updated_at: row.updated_at,
        section_name: row.heatmap_sections?.section_name ?? "Section",
        writer_name: m?.display_name ?? "Unassigned",
        member_id: m?.id ?? null,
      };
    });
    setAssignments(enriched);

    // Build writer rows (only writers with assignments)
    const byUser = new Map<string, WriterRow>();
    enriched.forEach((row) => {
      const m = memberByUser.get(row.user_id);
      if (!m) return;
      const existing = byUser.get(row.user_id);
      if (existing) {
        existing.section_count += 1;
        if (row.status !== "Complete") existing.all_complete = false;
      } else {
        byUser.set(row.user_id, {
          user_id: row.user_id,
          member_id: m.id,
          display_name: m.display_name,
          last_seen: presByUser.get(row.user_id) ?? null,
          section_count: 1,
          all_complete: row.status === "Complete",
        });
      }
    });
    setWriters(Array.from(byUser.values()));
  }

  useEffect(() => {
    load();
    if (!engagement) return;
    const ch = supabase
      .channel(`health:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "section_assignments", filter: `engagement_id=eq.${engagement.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence", filter: `engagement_id=eq.${engagement.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  const cold = useMemo(
    () => assignments.filter((a) => a.status !== "Complete" && Date.now() - new Date(a.updated_at).getTime() >= 48 * HOUR),
    [assignments],
  );
  const darkWriters = useMemo(
    () => writers.filter((w) => !w.all_complete && !isToday(w.last_seen)),
    [writers],
  );
  const dueSoon = useMemo(
    () => assignments.filter((a) => a.status === "In Progress" && a.due_date && hoursUntil(a.due_date) >= 0 && hoursUntil(a.due_date) <= 72),
    [assignments],
  );

  async function nudge(a: Assignment) {
    if (!a.member_id) return;
    await sendNudge(a.member_id, a.writer_name);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sections gone cold" value={cold.length} hint="No activity 48h+" />
        <Metric label="Writers dark today" value={darkWriters.length} hint="Not logged in today" />
        <Metric label="Deadline risk" value={dueSoon.length} hint="In Progress · due ≤72h" />
      </div>

      <Panel title="No activity in 48 hours" empty="All sections have had recent activity ✓" rows={cold.length}>
        {cold.map((a) => (
          <Row
            key={a.id}
            left={<><span className="font-medium">{a.section_name}</span> · <span className="text-muted-foreground">{a.writer_name}</span></>}
            mid={<span className="text-xs text-muted-foreground">Last: {relativeTime(a.updated_at)}</span>}
            action={
              <Button size="sm" variant="outline" disabled={!a.member_id} onClick={() => nudge(a)}>
                Nudge writer
              </Button>
            }
          />
        ))}
      </Panel>

      <Panel title="Writers not logged in today" empty="All writers active today ✓" rows={darkWriters.length}>
        {darkWriters.map((w) => (
          <Row
            key={w.user_id}
            left={<><span className="font-medium">{w.display_name}</span> · <span className="text-muted-foreground">{w.section_count} section{w.section_count === 1 ? "" : "s"}</span></>}
            mid={<span className="text-xs text-muted-foreground">Last seen: {w.last_seen ? relativeTime(w.last_seen) : "never"}</span>}
            action={
              <Button size="sm" variant="outline" onClick={() => openChatWith(w.member_id, w.display_name)}>
                Quick chat
              </Button>
            }
          />
        ))}
      </Panel>

      <Panel title="In Progress sections due within 3 days" empty="No sections at immediate risk ✓" rows={dueSoon.length}>
        {dueSoon.map((a) => {
          const h = hoursUntil(a.due_date!);
          return (
            <Row
              key={a.id}
              left={<><span className="font-medium">{a.section_name}</span> · <span className="text-muted-foreground">{a.writer_name}</span></>}
              mid={
                <span className="text-xs font-medium" style={{ color: countdownColor(h) }}>
                  {countdownLabel(a.due_date!)} · {a.status}
                </span>
              }
              action={
                <Button size="sm" variant="outline" disabled={!a.member_id} onClick={() => a.member_id && openChatWith(a.member_id, a.writer_name)}>
                  Contact writer
                </Button>
              }
            />
          );
        })}
      </Panel>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </Card>
  );
}

function Panel({ title, empty, rows, children }: { title: string; empty: string; rows: number; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows} {rows === 1 ? "item" : "items"}</span>
      </div>
      {rows === 0 ? (
        <p className="text-sm text-emerald-500/80">{empty}</p>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </Card>
  );
}

function Row({ left, mid, action }: { left: React.ReactNode; mid: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{left}</div>
        <div className="mt-0.5">{mid}</div>
      </div>
      {action}
    </div>
  );
}
