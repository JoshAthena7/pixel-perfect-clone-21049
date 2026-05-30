import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AttentionType = "stuck" | "sos" | "risk" | "overdue" | "morale";

export type AttentionItem = {
  key: string;
  type: AttentionType;
  source_id: string;
  created_at: string;
  writer_name: string | null;
  section_name: string | null;
  description: string;
  resolved: boolean;
  resolved_at: string | null;
  // Navigation/data hints
  member_id?: string | null;
  assignment_user_id?: string | null;
};

type StuckRow = { id: string; section_name: string; writer_name: string; member_id: string; created_at: string; resolved: boolean; resolved_at: string | null };
type SosRow = { id: string; description: string; submitter_name: string; severity: string; status: string; created_at: string };
type RiskRow = { id: string; title: string; severity: string; status: string; updated_at: string; created_at: string };
type AssignRow = { id: string; user_id: string; due_date: string; status: string; section_id: string };
type SectionRow = { id: string; section_name: string };
type MemberRow = { id: string; user_id: string; display_name: string };
type CheckinRow = { response: string };
type AckRow = { type: string; source_key: string; acknowledged_at: string };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useNeedsAttention(engagementId: string | undefined) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (eid: string) => {
    const today = todayKey();
    const [stuck, sos, risks, assigns, sections, members, checkins, acks] = await Promise.all([
      supabase.from("stuck_flags").select("id, section_name, writer_name, member_id, created_at, resolved, resolved_at").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("sos_alerts").select("id, description, submitter_name, severity, status, created_at").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("risks").select("id, title, severity, status, updated_at, created_at").eq("engagement_id", eid).eq("severity", "High").order("created_at", { ascending: false }),
      supabase.from("section_assignments").select("id, user_id, due_date, status, section_id").eq("engagement_id", eid).not("due_date", "is", null),
      supabase.from("heatmap_sections").select("id, section_name").eq("engagement_id", eid),
      supabase.from("engagement_members").select("id, user_id, display_name").eq("engagement_id", eid),
      supabase.from("daily_checkins").select("response").eq("engagement_id", eid).eq("checkin_date", today),
      supabase.from("attention_acks").select("type, source_key, acknowledged_at").eq("engagement_id", eid),
    ]);

    const sectionsById = new Map<string, string>(((sections.data as SectionRow[]) ?? []).map((s) => [s.id, s.section_name]));
    const memberByUid = new Map<string, MemberRow>(((members.data as MemberRow[]) ?? []).map((m) => [m.user_id, m]));
    const ackMap = new Map<string, string>(((acks.data as AckRow[]) ?? []).map((a) => [`${a.type}:${a.source_key}`, a.acknowledged_at]));

    const out: AttentionItem[] = [];

    for (const s of (stuck.data as StuckRow[]) ?? []) {
      out.push({
        key: `stuck:${s.id}`,
        type: "stuck",
        source_id: s.id,
        created_at: s.created_at,
        writer_name: s.writer_name,
        section_name: s.section_name,
        description: `Writer flagged they are stuck on ${s.section_name}.`,
        resolved: s.resolved,
        resolved_at: s.resolved_at,
        member_id: s.member_id,
      });
    }

    for (const a of (sos.data as SosRow[]) ?? []) {
      const resolved = a.status === "Resolved";
      out.push({
        key: `sos:${a.id}`,
        type: "sos",
        source_id: a.id,
        created_at: a.created_at,
        writer_name: a.submitter_name,
        section_name: null,
        description: a.description,
        resolved,
        resolved_at: resolved ? a.created_at : null,
      });
    }

    for (const r of (risks.data as RiskRow[]) ?? []) {
      const resolved = r.status === "Closed";
      out.push({
        key: `risk:${r.id}`,
        type: "risk",
        source_id: r.id,
        created_at: r.created_at,
        writer_name: null,
        section_name: null,
        description: r.title,
        resolved,
        resolved_at: resolved ? r.updated_at : null,
      });
    }

    const todayMs = new Date(today + "T00:00:00").getTime();
    for (const a of (assigns.data as AssignRow[]) ?? []) {
      if (!a.due_date) continue;
      const dueMs = new Date(a.due_date + "T00:00:00").getTime();
      if (dueMs >= todayMs) continue; // not overdue
      if (a.status === "Complete" || a.status === "Submitted") continue;
      const sect = sectionsById.get(a.section_id) ?? "Section";
      const mem = memberByUid.get(a.user_id);
      const ackAt = ackMap.get(`overdue:${a.id}`) ?? null;
      out.push({
        key: `overdue:${a.id}`,
        type: "overdue",
        source_id: a.id,
        created_at: a.due_date + "T00:00:00",
        writer_name: mem?.display_name ?? "Unassigned",
        section_name: sect,
        description: `${sect} was due ${a.due_date} and is still ${a.status}.`,
        resolved: !!ackAt,
        resolved_at: ackAt,
        assignment_user_id: a.user_id,
        member_id: mem?.id ?? null,
      });
    }

    // Morale: today's check-ins, >=30% struggling
    const responses = ((checkins.data as CheckinRow[]) ?? []).map((c) => c.response);
    if (responses.length > 0) {
      const struggling = responses.filter((r) => r === "struggling").length;
      const pct = struggling / responses.length;
      if (pct >= 0.3) {
        const ackAt = ackMap.get(`morale:${today}`) ?? null;
        out.push({
          key: `morale:${today}`,
          type: "morale",
          source_id: today,
          created_at: today + "T00:00:00",
          writer_name: null,
          section_name: null,
          description: `${Math.round(pct * 100)}% of today's check-ins reported struggling (${struggling}/${responses.length}).`,
          resolved: !!ackAt,
          resolved_at: ackAt,
        });
      }
    }

    out.sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setItems(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!engagementId) return;
    load(engagementId);
    const ch = supabase
      .channel(`needs-attn:${engagementId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stuck_flags", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .on("postgres_changes", { event: "*", schema: "public", table: "risks", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .on("postgres_changes", { event: "*", schema: "public", table: "section_assignments", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_checkins", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .on("postgres_changes", { event: "*", schema: "public", table: "attention_acks", filter: `engagement_id=eq.${engagementId}` }, () => load(engagementId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagementId, load]);

  const reload = useCallback(() => engagementId && load(engagementId), [engagementId, load]);

  return { items, loading, reload };
}
