import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy URL — Phase 1 Course Correction renamed Questions → Sections.
// Kept as a redirect so existing bookmarks, emails, and notification links
// keep working. The `questionId` URL param name is preserved on the new
// /sections route, so it round-trips cleanly.
export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/$questionId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/sections/$questionId",
      params: { missionId: params.missionId, questionId: params.questionId },
      replace: true,
    });
  },
});
