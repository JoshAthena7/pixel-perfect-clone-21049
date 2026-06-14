import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Users as UsersIcon, ClipboardList, Rocket, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminMissionsPage,
});

type MissionRow = {
  id: string;
  name: string;
  status: string | null;
  client_name: string | null;
};

type Bucket = "Active" | "Draft" | "Closed";

function bucketFor(status: string | null | undefined): Bucket {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "pens_down") return "Active";
  if (s === "setup" || s === "draft") return "Draft";
  return "Closed";
}

function statusColor(b: Bucket) {
  if (b === "Active") return "#22c55e";
  if (b === "Draft") return "#c9a84c";
  return "rgba(255,255,255,0.35)";
}

function AdminMissionsPage() {
  const navigate = useNavigate();

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["admin-missions-list"],
    queryFn: async (): Promise<MissionRow[]> => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,status,client_name")
        .order("created_at", { ascending: false });
      return (data ?? []) as MissionRow[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["admin-missions-team-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("mission_id");
      const out: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        out[r.mission_id] = (out[r.mission_id] ?? 0) + 1;
      });
      return out;
    },
  });

  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Missions</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              All ATLAS missions across the platform.
            </p>
          </div>
          <Link
            to="/olympus/missions/new"
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors"
            style={{
              background: "#c9a84c",
              color: "#080c14",
            }}
          >
            <Plus className="h-4 w-4" />
            New mission
          </Link>
        </div>

        <div className="space-y-2">
          {isLoading && (
            <div className="rounded-lg border p-6 text-sm" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              Loading missions…
            </div>
          )}
          {!isLoading && missions.length === 0 && (
            <div className="rounded-lg border p-6 text-sm" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              No missions yet. Click <span style={{ color: "#c9a84c" }}>New mission</span> to create one.
            </div>
          )}
          {missions.map((m) => {
            const b = bucketFor(m.status);
            const dot = statusColor(b);
            const staff = counts[m.id] ?? 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (b === "Draft") {
                    navigate({ to: "/olympus/wizard/$missionId", params: { missionId: m.id } });
                  } else {
                    navigate({ to: "/admin/missions/$missionId", params: { missionId: m.id } });
                  }
                }}
                className="group w-full text-left rounded-lg px-4 py-3.5 flex items-center gap-4 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: dot, boxShadow: b === "Active" ? `0 0 8px ${dot}` : undefined }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm truncate">{m.name}</div>
                  {m.client_name && (
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {m.client_name}
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <UsersIcon className="h-3.5 w-3.5" />
                  {staff}
                </div>
                {b === "Draft" && (
                  <span
                    className="rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0"
                    style={{
                      padding: "3px 9px",
                      background: "rgba(201,168,76,0.18)",
                      color: "#c9a84c",
                      border: "1px solid rgba(201,168,76,0.4)",
                    }}
                  >
                    Resume setup
                  </span>
                )}
                <span
                  className="rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{
                    padding: "3px 9px",
                    background:
                      b === "Active" ? "rgba(34,197,94,0.12)" :
                      b === "Draft" ? "rgba(201,168,76,0.12)" :
                      "rgba(255,255,255,0.05)",
                    color: dot,
                    border: `1px solid ${b === "Active" ? "rgba(34,197,94,0.3)" : b === "Draft" ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {b}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
              </button>

            );
          })}
        </div>
      </div>
    </div>
  );
}
