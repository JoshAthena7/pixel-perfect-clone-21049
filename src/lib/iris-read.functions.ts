import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Single read-side aggregator for the /iris page. Returns mission + all
 * five output slices in one round trip. Uses the user-context Supabase
 * client (RLS applies) — the extractors write with the admin client, but
 * reading respects whatever policies the project has configured.
 */
export const getIrisData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve mission — explicit id wins, else first available mission.
    let missionId = data.missionId ?? null;
    if (!missionId) {
      const { data: first } = await supabase
        .from("missions")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      missionId = first?.id ?? null;
    }
    if (!missionId) {
      return { mission: null, signals: [], risks: [], winThemes: [], strategy: [], clientIntel: null, missions: [] };
    }

    const { data: missions } = await supabase
      .from("missions")
      .select("id,name,client,state,state_agency,procurement_name,submission_date,health,status")
      .order("created_at", { ascending: false });

    const { data: mission } = await supabase
      .from("missions")
      .select(
        "id,name,client,state,state_agency,procurement_name,program_type,description,submission_date,health,status,win_themes,key_requirements",
      )
      .eq("id", missionId)
      .maybeSingle();

    const [signalsRes, risksRes, themesRes, strategyRes, intelRes] = await Promise.all([
      supabase
        .from("signals")
        .select("id,signal_type,signal_title,signal_summary,severity,confidence,tags,recommended_action,created_at,created_by_system")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mission_risks")
        .select("id,title,description,severity,status,owner,created_at,created_by_system")
        .eq("mission_id", missionId)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("win_themes")
        .select("id,title,description,key_message,status,created_at,created_by_system")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mission_strategy")
        .select("id,kind,label,notes,sort_order,created_at,created_by_system")
        .eq("mission_id", missionId)
        .eq("kind", "client_priority")
        .eq("created_by_system", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("mission_client_intel")
        .select("decision_makers,stakeholders,political_considerations,meeting_cadence,notes,updated_at,created_by_system")
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
  });
