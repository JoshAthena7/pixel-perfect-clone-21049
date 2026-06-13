import { createFileRoute, Outlet, Link, notFound, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/missions/$missionId")({
  loader: async ({ params }) => {
    const [{ data, error }, { data: progressRows }] = await Promise.all([
      supabase
        .from("missions")
        .select("id, status")
        .eq("id", params.missionId)
        .maybeSingle(),
      supabase
        .from("mission_iris_extractions")
        .select("extracted_field, extracted_value, wizard_step")
        .eq("mission_id", params.missionId)
        .not("wizard_step", "is", null),
    ]);
    if (error || !data) throw notFound();
    // Setup drafts haven't been launched yet — keep the user in the wizard
    // instead of dropping them into a half-empty briefing room.
    if (["draft", "setup"].includes((data.status ?? "").toLowerCase())) {
      const savedStep = Number(
        progressRows?.find((r) => r.extracted_field === "__wizard_last_step")?.extracted_value,
      );
      const inferredStep = Math.max(
        1,
        ...(progressRows ?? [])
          .map((r) => r.wizard_step ?? 1)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 8),
      );
      const { redirect } = await import("@tanstack/react-router");
      throw redirect({
        to: "/olympus/wizard/$missionId",
        params: { missionId: params.missionId },
        search: { step: Number.isFinite(savedStep) ? Math.min(8, Math.max(1, savedStep)) : inferredStep },
      });
    }
    return { missionId: params.missionId };
  },
  component: MissionLayout,
  errorComponent: () => <MissionNotFound />,
  notFoundComponent: () => <MissionNotFound />,
});

const TABS = [
  { id: "briefing", label: "Briefing", to: "/missions/$missionId/briefing" as const },
  { id: "oracle", label: "IRIS", to: "/missions/$missionId/oracle" as const },
  { id: "insights", label: "Insights", to: "/missions/$missionId/insights" as const },
];

function MissionLayout() {
  const { missionId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const tabbedSegments = ["briefing", "oracle", "insights"];
  const seg = pathname.split("/")[3] ?? "";
  const showTabs = tabbedSegments.includes(seg) || seg === "";

  const { data: missions = [] } = useQuery({
    queryKey: ["mission-switcher"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      return (data ?? []) as { id: string; name: string; status: string | null; updated_at: string }[];
    },
  });

  const current = missions.find((m) => m.id === missionId);
  const currentName = current?.name ?? "Mission";

  return (
    <div>
      {showTabs && (
        <div
          className="sticky top-12 z-30 flex items-center gap-1 px-6 h-10"
          style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 mr-3 px-2 py-1 rounded-md hover:bg-white/[0.05] focus:outline-none max-w-[280px]"
              style={{ color: "white", fontSize: 12, fontWeight: 500 }}
            >
              <span className="truncate">{currentName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.5)" }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 max-h-96 overflow-y-auto">
              {missions.map((m) => {
                const active = m.id === missionId;
                return (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() =>
                      navigate({ to: "/missions/$missionId/briefing", params: { missionId: m.id } })
                    }
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{m.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-[#c9a84c] shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/home" })}>
                ← All missions
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mr-3" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>

          {TABS.map((t) => {
            const active = seg === t.id || (seg === "" && t.id === "briefing");
            return (
              <Link
                key={t.id}
                to={t.to}
                params={{ missionId }}
                className="px-3 py-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
                style={{
                  fontSize: 12,
                  color: active ? "#c9a84c" : "rgba(255,255,255,0.55)",
                  fontWeight: active ? 600 : 400,
                  borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
      <Outlet />
    </div>
  );
}

function MissionNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div style={{ color: "white", fontSize: 16, fontWeight: 500 }}>
          Mission not found.
        </div>
        <div className="mt-2" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
          The mission you are looking for does not exist or you do not have access to it.
        </div>
        <Link
          to="/home"
          className="mt-6 inline-block hover:underline"
          style={{ color: "#C49A2B", fontSize: 13, fontWeight: 500 }}
        >
          ← Back to missions
        </Link>
      </div>
    </div>
  );
}
