/**
 * Legacy wizard route — redirect to the new v3 8-step IRIS-driven wizard.
 * The previous 5-step v2 flow has been replaced.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  step: z.coerce.number().int().min(1).max(10).optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/wizard")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  beforeLoad: ({ params, search }) => {
    // Old step numbers don't map cleanly. Send everyone to step 1 of the new wizard;
    // the new shell figures out where they are from saved state.
    throw redirect({
      to: "/olympus/wizard/$missionId",
      params: { missionId: params.missionId },
      search: search.step && search.step <= 8 ? { step: search.step } : {},
    });
  },
  component: () => null,
});
