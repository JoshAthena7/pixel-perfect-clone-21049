/**
 * syncOracleConfigFromExtractions
 *
 * After the wizard writes per-row keys (win_theme_1..5, top_risk_1..5,
 * competitor_1..5, north_star, central_claim, etc.) into
 * mission_iris_extractions, downstream readers (briefing page, IRIS, today's
 * focus) still expect the aggregated shape in oracle_engagement_config
 * (win_themes[], top_risks[], competitors[], north_star, central_claim).
 *
 * This helper re-derives that aggregated shape from confirmed extractions and
 * upserts it. Safe to call after every field confirmation.
 */
import { supabase } from "@/integrations/supabase/client";

type Extraction = {
  extracted_field: string;
  extracted_value: string | null;
  user_override_value: string | null;
  confirmed_by_user: boolean;
};

function val(e: Extraction): string | null {
  const v = e.user_override_value ?? e.extracted_value;
  return v && v.trim() ? v.trim() : null;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function syncOracleConfigFromExtractions(missionId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("mission_iris_extractions")
      .select("extracted_field, extracted_value, user_override_value, confirmed_by_user")
      .eq("mission_id", missionId);

    const rows = (data ?? []) as Extraction[];
    // Only use rows that have value AND are confirmed (or overridden — same flag here)
    const confirmed = rows.filter((r) => r.confirmed_by_user && val(r));

    const taggedFrom = (prefix: string) =>
      confirmed
        .filter((r) => r.extracted_field.startsWith(`${prefix}_`))
        .sort((a, b) => a.extracted_field.localeCompare(b.extracted_field))
        .map((r) => ({
          id: uid(),
          text: val(r) as string,
          signal_authority: "team_validated",
          rfp_reference: null,
          confidence: 100,
          status: "confirmed",
        }));

    const simpleFrom = (prefix: string) =>
      confirmed
        .filter((r) => r.extracted_field.startsWith(`${prefix}_`))
        .sort((a, b) => a.extracted_field.localeCompare(b.extracted_field))
        .map((r) => ({ id: uid(), text: val(r) as string, client_stated: false }));

    const competitorList = confirmed
      .filter((r) => r.extracted_field.startsWith("competitor_"))
      .sort((a, b) => a.extracted_field.localeCompare(b.extracted_field))
      .map((r) => ({ id: uid(), name: val(r) as string }));

    const winThemes = taggedFrom("win_theme");
    const topRisks = taggedFrom("top_risk");
    const discriminators = simpleFrom("discriminator");
    const proofPoints = simpleFrom("proof_point");

    const northStar = confirmed.find((r) => r.extracted_field === "north_star");
    const centralClaim = confirmed.find((r) => r.extracted_field === "central_claim");

    // Spread existing to preserve unrelated keys (engagement settings, etc.)
    const { data: existing } = await supabase
      .from("oracle_engagement_config")
      .select("*")
      .eq("mission_id", missionId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      mission_id: missionId,
    };
    if (winThemes.length) patch.win_themes = winThemes;
    if (topRisks.length) patch.top_risks = topRisks;
    if (competitorList.length) patch.competitors = competitorList;
    if (discriminators.length) patch.discriminators = discriminators;
    if (proofPoints.length) patch.proof_points = proofPoints;
    if (northStar) patch.north_star = val(northStar);
    if (centralClaim) patch.central_claim = val(centralClaim);

    await supabase
      .from("oracle_engagement_config")
      .upsert({ ...(existing ?? {}), ...patch } as never, { onConflict: "mission_id" });
  } catch (e) {
    console.warn("[syncOracleConfigFromExtractions] non-fatal:", e);
  }
}
