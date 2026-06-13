/**
 * Mission Team picker — 6 role slots populated from the Athena Collective roster.
 * Persists selections as rows in mission_iris_extractions (one per role key)
 * using the existing override pattern so the rest of the wizard sees them as
 * confirmed basics fields.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ROLES: { key: string; label: string }[] = [
  { key: "team_exec", label: "Executive" },
  { key: "team_engagement_lead", label: "Engagement Lead" },
  { key: "team_lead_writer", label: "Lead Writer" },
  { key: "team_project_manager", label: "Project Manager" },
  { key: "team_lead_graphics", label: "Lead Graphics" },
  { key: "team_lead_copy_editor", label: "Lead Copy Editor" },
];

type Member = { id: string; full_name: string; title: string | null; email: string | null };

export function MissionTeamPicker({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const queryKey = ["mission-team-roles", missionId] as const;

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["collective-members-active"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("collective_members")
        .select("id, full_name, title, email")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_field, user_override_value")
        .eq("mission_id", missionId)
        .in("extracted_field", ROLES.map((r) => r.key));
      return (data ?? []) as Array<{
        id: string;
        extracted_field: string;
        user_override_value: string | null;
      }>;
    },
  });

  const [pending, setPending] = useState<Record<string, string>>({});

  const byRole = useMemo(() => {
    const m = new Map<string, string>();
    (assignments ?? []).forEach((a) => {
      if (a.user_override_value) m.set(a.extracted_field, a.user_override_value);
    });
    Object.entries(pending).forEach(([k, v]) => {
      if (v) m.set(k, v);
      else m.delete(k);
    });
    return m;
  }, [assignments, pending]);

  async function setRole(roleKey: string, value: string) {
    setPending((p) => ({ ...p, [roleKey]: value }));
    const { data: existingRows, error: lookupError } = await supabase
      .from("mission_iris_extractions")
      .select("id")
      .eq("mission_id", missionId)
      .eq("extracted_field", roleKey)
      .limit(1);

    const payload = {
      mission_id: missionId,
      extracted_field: roleKey,
      extracted_value: null,
      user_override_value: value || null,
      overridden_by_user: !!value,
      confirmed_by_user: !!value,
      confirmed_at: value ? new Date().toISOString() : null,
      wizard_step: 2,
    };

    const existingId = existingRows?.[0]?.id;
    const { error } = lookupError
      ? { error: lookupError }
      : existingId
        ? await supabase.from("mission_iris_extractions").update(payload).eq("id", existingId)
        : value
          ? await supabase.from("mission_iris_extractions").insert(payload)
          : { error: null };

    if (error) {
      console.error("[MissionTeamPicker] upsert failed", error);
      alert(`Could not save team role: ${error.message}`);
      setPending((p) => {
        const n = { ...p };
        delete n[roleKey];
        return n;
      });
      return;
    }
    await qc.invalidateQueries({ queryKey });
  }

  return (
    <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-amber-300" />
        <h3 className="text-[14px] font-medium text-white">Mission Team</h3>
      </div>
      <p className="text-[12.5px] text-white/55 mb-4">
        Assign core mission roles from the Athena Collective roster.
      </p>

      {loadingMembers ? (
        <div className="flex items-center gap-2 text-[12.5px] text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roster…
        </div>
      ) : (members?.length ?? 0) === 0 ? (
        <div className="text-[12.5px] text-white/55">
          No collective members found. Import the roster in Admin → Collective.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <RoleSelect
              key={r.key}
              label={r.label}
              members={members ?? []}
              value={byRole.get(r.key) ?? ""}
              onChange={(v) => setRole(r.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleSelect({
  label,
  members,
  value,
  onChange,
}: {
  label: string;
  members: Member[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-white/55 mb-1.5 block">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-amber-400/60"
      >
        <option value="" className="bg-[#0D1B3E]">
          — Unassigned —
        </option>
        {members.map((m) => {
          const display = m.title ? `${m.full_name} (${m.title})` : m.full_name;
          return (
            <option key={m.id} value={display} className="bg-[#0D1B3E]">
              {display}
            </option>
          );
        })}
      </select>
    </label>
  );
}
