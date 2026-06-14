import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { triggerMissionLaunchBrief } from "./iris-launch-brief.server";

const Input = z.object({ missionId: z.string().uuid() });

// Fire-and-forget trigger from client when mission launches.
// Always resolves OK; the actual work runs in the background.
export const triggerLaunchBrief = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    try {
      triggerMissionLaunchBrief({ missionId: data.missionId });
    } catch (e) {
      console.error("[launch-brief] trigger failure", e);
    }
    return { ok: true };
  });
