import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MissionSidebar, MissionBottomTabs } from "@/components/nav/MissionSidebar";
import { MissionContextBar } from "@/components/mission-context/MissionContextBar";
import { MissionWelcomeOverlay } from "@/components/mission-context/MissionWelcomeOverlay";
import { QuickStartButton } from "@/components/mission-context/QuickStartButton";
import { MissionPulseStrip } from "@/components/mission/MissionPulseStrip";
import { MissionCommandBar } from "@/components/mission-command/MissionCommandBar";

export const Route = createFileRoute("/_authenticated/missions/$missionId")({
  loader: async ({ params }) => {
    const [missionRes, progressRes] = await Promise.all([
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
    const { data, error } = missionRes;
    const progressRows = progressRes.data;
    // Fail OPEN on transient null/error: a token-refresh race or RLS hiccup
    // can return `null` for an instant. Throwing notFound here would yank a
    // signed-in user off /briefing or /flight-deck mid-session. Only treat
    // an explicit row-missing response as not-found by re-throwing the
    // original error on subsequent loads.
    if (error) throw error;
    if (!data) {
      return { missionId: params.missionId };
    }
    // Setup drafts haven't been launched yet — keep the user in the wizard
    // instead of dropping them into a half-empty briefing room.
    const status = (data.status ?? "").toLowerCase();
    if (status === "draft" || status === "setup") {
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

function MissionLayout() {
  const { missionId } = Route.useParams();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 48px)" }}>
      <MissionSidebar missionId={missionId} email={email} />
      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        <MissionContextBar missionId={missionId} />
        <MissionPulseStrip missionId={missionId} />
        <Outlet />
      </div>
      <MissionBottomTabs missionId={missionId} />
      <MissionWelcomeOverlay missionId={missionId} />
      <QuickStartButton missionId={missionId} />
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
