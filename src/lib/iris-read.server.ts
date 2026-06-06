import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Read aggregator for the IRIS page. Uses the admin client to read all
 * five output slices for a mission in one shot. Authentication and
 * authorization are enforced by the API route caller (see
 * src/routes/api/iris.ts).
 */
export async function getIrisPayload(missionIdInput?: string) {
  let missionId = missionIdInput ?? null;
  if (!missionId) {
    const { data: first } = await supabaseAdmin
      .from("missions")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    missionId = first?.id ?? null;
  }
  if (!missionId) {
    return {
      mission: null,
      signals: [],
      risks: [],
      winThemes: [],
      strategy: [],
      clientIntel: null,
      missions: [],
    };
  }

  const { data: missions } = await supabaseAdmin
    .from("missions")
    .select("id,name,client,state,state_agency,procurement_name,submission_date,health,status")
    .order("created_at", { ascending: false });

  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select(
      "id,name,client,state,state_agency,procurement_name,program_type,description,submission_date,health,status,win_themes,key_requirements",
    )
    .eq("id", missionId)
    .maybeSingle();

  const [signalsRes, risksRes, themesRes, strategyRes, intelRes] = await Promise.all([
    supabaseAdmin
      .from("signals")
      .select(
        "id,signal_type,signal_title,signal_summary,severity,confidence,tags,recommended_action,created_at,created_by_system",
      )
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("mission_risks")
      .select("id,title,description,severity,status,owner,created_at,created_by_system")
      .eq("mission_id", missionId)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("win_themes")
      .select("id,title,description,key_message,status,created_at,created_by_system")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("mission_strategy")
      .select("id,kind,label,notes,sort_order,created_at,created_by_system")
      .eq("mission_id", missionId)
      .eq("kind", "client_priority")
      .eq("created_by_system", true)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("mission_client_intel")
      .select(
        "decision_makers,stakeholders,political_considerations,meeting_cadence,notes,updated_at,created_by_system",
      )
      .eq("mission_id", missionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    mission,
    missions: missions ?? [],
    signals: signalsRes.data ?? [],
    risks: risksRes.data ?? [],
    winThemes: themesRes.data ?? [],
    strategy: strategyRes.data ?? [],
    clientIntel: intelRes.data ?? null,
  };
}
