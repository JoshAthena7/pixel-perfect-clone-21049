import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  component: AdminMissionDetail,
});

type Tab = "overview" | "team" | "journey" | "compliance" | "reports";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "journey", label: "Journey" },
  { id: "compliance", label: "Compliance" },
  { id: "reports", label: "Reports" },
];

type Mission = {
  id: string;
  name: string;
  client_name: string | null;
  status: string | null;
  submission_deadline: string | null;
  contract_value: number | null;
  agency_name: string | null;
  state: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  procurement_type: string | null;
  program_type: string | null;
  blast_off_at: string | null;
  iris_disclaimer: string | null;
};

function AdminMissionDetail() {
  const { missionId } = useParams({ from: "/_authenticated/admin/missions/$missionId" });
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<Partial<Mission>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cascaded, setCascaded] = useState(false);

  const { data: mission } = useQuery({
    queryKey: ["admin-mission", missionId],
    queryFn: async (): Promise<Mission | null> => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client_name,status,submission_deadline,contract_value,agency_name,state,primary_contact_name,primary_contact_email,procurement_type,program_type,blast_off_at,iris_disclaimer")
        .eq("id", missionId)
        .maybeSingle();
      return data as Mission | null;
    },
  });

  useEffect(() => {
    if (mission) {
      setForm(mission);
      setDirty(false);
    }
  }, [mission]);

  useEffect(() => {
    if (!cascaded) return;
    const t = setTimeout(() => setCascaded(false), 3000);
    return () => clearTimeout(t);
  }, [cascaded]);

  function update<K extends keyof Mission>(key: K, value: Mission[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      name: form.name ?? null,
      client_name: form.client_name ?? null,
      status: form.status ?? null,
      submission_deadline: form.submission_deadline ?? null,
      contract_value: form.contract_value ?? null,
      agency_name: form.agency_name ?? null,
      state: form.state ?? null,
      primary_contact_name: form.primary_contact_name ?? null,
      primary_contact_email: form.primary_contact_email ?? null,
      procurement_type: form.procurement_type ?? null,
      program_type: form.program_type ?? null,
      blast_off_at: form.blast_off_at ?? null,
      iris_disclaimer: form.iris_disclaimer ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase.from("missions").update(payload as any) as any).eq("id", missionId);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Saved & cascaded to all linked records");
    setDirty(false);
    setCascaded(true);
    qc.invalidateQueries({ queryKey: ["admin-mission", missionId] });
    qc.invalidateQueries({ queryKey: ["admin-missions-list"] });
  }

  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      {/* Top bar */}
      <div
        className="sticky top-12 z-10 px-6 py-3 flex items-center gap-4"
        style={{ background: "#0a121f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs hover:text-white transition-colors"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Missions
        </Link>
        <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="text-white font-medium text-sm truncate flex-1">
          {form.name ?? "Mission"}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save & cascade"}
          </button>
        )}
      </div>

      {/* Tab strip */}
      <div className="px-6" style={{ background: "#080c14", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-medium transition-colors relative"
                style={{
                  color: active ? "#c9a84c" : "rgba(255,255,255,0.5)",
                  borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        {tab === "overview" && (
          <OverviewTab form={form} update={update} />
        )}
        {tab === "team" && <TeamTab missionId={missionId} />}
        {tab === "journey" && <JourneyTab missionId={missionId} />}
        {tab === "compliance" && <ComplianceTab missionId={missionId} />}
        {tab === "reports" && <ReportsTab missionId={missionId} />}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

function OverviewTab({
  form,
  update,
}: {
  form: Partial<Mission>;
  update: <K extends keyof Mission>(k: K, v: Mission[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionCard title="Mission Snapshot">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Mission name">
            <input style={inputStyle} value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </Field>
          <Field label="Client">
            <input style={inputStyle} value={form.client_name ?? ""} onChange={(e) => update("client_name", e.target.value)} />
          </Field>
          <Field label="Agency">
            <input style={inputStyle} value={form.agency_name ?? ""} onChange={(e) => update("agency_name", e.target.value)} />
          </Field>
          <Field label="State">
            <input style={inputStyle} value={form.state ?? ""} onChange={(e) => update("state", e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              style={inputStyle}
              value={form.status ?? "setup"}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="setup">Draft</option>
              <option value="active">Active</option>
              <option value="pens_down">Pens Down</option>
              <option value="submitted">Submitted</option>
              <option value="awarded">Awarded</option>
              <option value="not_awarded">Not Awarded</option>
              <option value="archived">Closed</option>
            </select>
          </Field>
          <Field label="Submission deadline">
            <input
              type="date"
              style={inputStyle}
              value={form.submission_deadline ? form.submission_deadline.slice(0, 10) : ""}
              onChange={(e) => update("submission_deadline", e.target.value ? new Date(e.target.value).toISOString() : null)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Primary Contact">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input style={inputStyle} value={form.primary_contact_name ?? ""} onChange={(e) => update("primary_contact_name", e.target.value)} />
          </Field>
          <Field label="Email">
            <input style={inputStyle} type="email" value={form.primary_contact_email ?? ""} onChange={(e) => update("primary_contact_email", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Contract">
        <Field label="Contract value (USD)">
          <input
            style={inputStyle}
            type="number"
            value={form.contract_value ?? ""}
            onChange={(e) => update("contract_value", e.target.value === "" ? null : Number(e.target.value))}
          />
        </Field>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#c9a84c" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function TeamTab({ missionId }: { missionId: string }) {
  const { data: members = [] } = useQuery({
    queryKey: ["admin-mission-team", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("id,role,user_id")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });
  return (
    <SectionCard title={`Team (${members.length})`}>
      {members.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No team members assigned yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="text-sm text-white/80 font-mono text-xs">{m.user_id?.slice(0, 8)}…</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(201,168,76,0.12)", color: "#c9a84c" }}>
                {m.role ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function JourneyTab({ missionId }: { missionId: string }) {
  const { data: phases = [] } = useQuery({
    queryKey: ["admin-mission-journey", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_journey_phases")
        .select("id,phase_name,status,start_date,end_date")
        .eq("mission_id", missionId)
        .order("start_date", { ascending: true });
      return data ?? [];
    },
  });
  return (
    <SectionCard title="Journey Phases">
      {phases.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No journey phases defined.
        </div>
      ) : (
        <ol className="space-y-2">
          {phases.map((p: any, i: number) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="text-xs font-mono" style={{ color: "#c9a84c" }}>{String(i + 1).padStart(2, "0")}</span>
              <span className="text-sm text-white/80 flex-1">{p.phase_name}</span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{p.status}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function ComplianceTab({ missionId }: { missionId: string }) {
  const { data: reqs = [] } = useQuery({
    queryKey: ["admin-mission-compliance", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("compliance_requirements")
        .select("id,title,status")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });
  return (
    <SectionCard title={`Compliance (${reqs.length})`}>
      {reqs.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No compliance requirements yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {reqs.map((r: any) => (
            <li key={r.id} className="flex items-center gap-3 rounded-md px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="text-sm text-white/80 flex-1 truncate">{r.title}</span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{r.status ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ReportsTab({ missionId }: { missionId: string }) {
  const { data: outcomes = [] } = useQuery({
    queryKey: ["admin-mission-reports", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_outcomes")
        .select("id,outcome_type,description,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <SectionCard title="Mission Reports">
      {outcomes.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No reports generated yet for this mission.
        </div>
      ) : (
        <ul className="space-y-2">
          {outcomes.map((o: any) => (
            <li key={o.id} className="rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-xs font-semibold" style={{ color: "#c9a84c" }}>{o.outcome_type}</div>
              <div className="text-sm text-white/80 mt-0.5">{o.description}</div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
