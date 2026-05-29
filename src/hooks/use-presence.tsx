import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";
import { useEngagement } from "./use-engagement";

export type PresenceUser = {
  user_id: string;
  display_name: string;
  role: string;
  path: string;
  online_at: string;
};

export function usePresence(currentPath?: string) {
  const { user } = useSession();
  const { engagement, member } = useEngagement();
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!user || !engagement || !member) return;
    const topic = `presence:engagement:${engagement.id}`;
    // Remove any stale channel with the same topic (StrictMode double-mount, HMR, etc.)
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${topic}` || c.topic === topic) {
        supabase.removeChannel(c);
      }
    }
    const channel = supabase.channel(topic, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const flat: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const metas = state[key] as unknown as PresenceUser[];
          if (metas && metas.length > 0) flat.push(metas[0]);
        }
        setUsers(flat);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            display_name: member.display_name,
            role: member.role,
            path: currentPath ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, engagement?.id, member?.display_name, member?.role, currentPath]);

  return users;
}
