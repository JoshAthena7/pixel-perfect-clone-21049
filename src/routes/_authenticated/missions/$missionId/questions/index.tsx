import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy URL — Phase 1 Course Correction renamed Questions → Sections.
// Kept as a redirect so existing bookmarks, emails, and notification links
// keep working.
export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/sections",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});
