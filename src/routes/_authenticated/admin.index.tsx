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
  health_score: number | null;
  submission_deadline: string | null;
};

function healthBorderColor(score: number | null | undefined): string {
  if (score == null) return "rgba(74,222,128,0.7)";
  if (score >= 70) return "rgba(74,222,128,0.7)";
  if (score >= 40) return "rgba(251,191,36,0.7)";
  return "rgba(248,113,113,0.7)";
}

function daysToSubmission(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86400000));
}

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
        .select("id,name,status,client_name,health_score,submission_deadline")
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
            <h1 className="text-2xl font-medium text-white">Missions</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              All ATLAS missions across the platform.
            </p>
          </div>
          <Link
            to="/olympus/missions/new"
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[14px] font-medium transition-colors"
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
            <div className="rounded-lg border p-6 text-[14px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              Loading missions…
            </div>
          )}
          {!isLoading && missions.length === 0 && (
            <div className="rounded-lg border p-6 text-[14px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              No missions yet. Click <span style={{ color: "#c9a84c" }}>New mission</span> to create one.
            </div>
          )}
          {missions.map((m) => {
            const b = bucketFor(m.status);
            const dot = statusColor(b);
            const staff = counts[m.id] ?? 0;
            const healthColor = healthBorderColor(m.health_score);
            const daysLeft = daysToSubmission(m.submission_deadline);
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (b === "Draft") {
                    navigate({ to: "/olympus/wizard/$missionId", params: { missionId: m.id } });
                  } else {
                    navigate({ to: "/admin/missions/$missionId", params: { missionId: m.id } });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (b === "Draft") {
                      navigate({ to: "/olympus/wizard/$missionId", params: { missionId: m.id } });
                    } else {
                      navigate({ to: "/admin/missions/$missionId", params: { missionId: m.id } });
                    }
                  }
                }}
                className="group w-full text-left rounded-lg px-4 py-3.5 flex items-center gap-4 transition-colors cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `4px solid ${healthColor}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)";
                  e.currentTarget.style.borderLeftColor = healthColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderLeftColor = healthColor;
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: dot, boxShadow: b === "Active" ? `0 0 8px ${dot}` : undefined }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-[14px] truncate">{m.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {m.client_name && (
                      <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {m.client_name}
                      </span>
                    )}
                    {daysLeft != null && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                        {m.client_name ? "· " : ""}{daysLeft}d to submission
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-[12px] shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <UsersIcon className="h-3.5 w-3.5" />
                  {staff}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to="/missions/$missionId/briefing"
                    params={{ missionId: m.id }}
                    aria-label="Open Brief"
                    title="Open Brief"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-white/[0.06]"
                    style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}
                  >
                    <ClipboardList className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/missions/$missionId/flight-deck"
                    params={{ missionId: m.id }}
                    aria-label="Open Flight Deck"
                    title="Open Flight Deck"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-white/[0.06]"
                    style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}
                  >
                    <Rocket className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/olympus/wizard/$missionId"
                    params={{ missionId: m.id }}
                    aria-label="Edit Setup"
                    title="Edit Setup (wizard)"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-white/[0.06]"
                    style={{ border: "1px solid rgba(201,168,76,0.35)", color: "#c9a84c" }}
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>
                {b === "Draft" && (
                  <span
                    className="rounded-full text-[11px] font-medium shrink-0"
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
                  className="rounded-full text-[11px] font-medium shrink-0"
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

              </div>

            );
          })}
        </div>
      </div>
    </div>
  );
}
