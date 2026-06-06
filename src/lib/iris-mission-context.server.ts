// Thin shim that delegates to the unified buildMissionContext().
// Kept so the originally-wired IRIS callers keep working without further edits.
// New code should import { buildMissionContext, formatMissionContextBlock }
// directly from "./iris-context.server".

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMissionContext,
  formatMissionContextBlock,
  type MissionContext as FullMissionContext,
} from "./iris-context.server";

export type MissionContext = FullMissionContext;

export async function loadMissionContext(
  supabase: SupabaseClient,
  missionId: string,
): Promise<MissionContext> {
  return buildMissionContext(supabase, missionId);
}

export function formatMissionContextPreamble(ctx: MissionContext): string {
  return formatMissionContextBlock(ctx);
}
