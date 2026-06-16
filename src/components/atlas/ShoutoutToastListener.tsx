/**
 * Listens for new atlas_shoutouts targeted at the signed-in user on the
 * current mission and shows a gold toast. Click → opens the Team tab.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ShoutoutToastListener({ missionId }: { missionId: string | null }) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: me } = await supabase.auth.getUser();
      if (cancelled || !me.user) return;
      const myId = me.user.id;
      channel = supabase
        .channel(`atlas-shoutouts-${missionId}-${myId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "atlas_shoutouts",
            filter: `to_user_id=eq.${myId}`,
          },
          async (payload) => {
            const row = payload.new as { mission_id: string; from_user_id: string; message: string };
            if (row.mission_id !== missionId) return;
            const { data: sender } = await supabase
              .from("atlas_team_members")
              .select("first_name, last_name")
              .eq("id", row.from_user_id)
              .maybeSingle();
            const name = `${sender?.first_name ?? ""} ${sender?.last_name ?? ""}`.trim() || "A teammate";
            toast(`👏 ${name} shouted you out`, {
              description: row.message,
              duration: 5000,
              style: {
                background: "rgba(196,154,43,0.95)",
                color: "white",
                border: "none",
              },
              action: {
                label: "View",
                onClick: () => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("atlas:team-pulse:tab", "team");
                  }
                  qc.invalidateQueries({ queryKey: ["atlas-shoutouts-mine", missionId] });
                },
              },
            });
            qc.invalidateQueries({ queryKey: ["atlas-shoutouts-mine", missionId] });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [missionId, qc]);

  return null;
}
