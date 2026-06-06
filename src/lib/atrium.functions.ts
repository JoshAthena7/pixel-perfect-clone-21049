// The Atrium — cross-engagement common space data.
// Latest win, recent activity, live writers, viewer's own profile card.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AtriumPayload } from "./atrium.types";

export type {
  AtriumActivity,
  AtriumContributor,
  AtriumLiveWriter,
  AtriumPayload,
  AtriumViewerCard,
  AtriumWin,
} from "./atrium.types";

export const getAtrium = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtriumPayload> => {
    const { userId } = context as { userId: string };
    const { getAtriumPayload } = await import("./atrium.server");
    return getAtriumPayload(userId);
  });
