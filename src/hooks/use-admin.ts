import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

/**
 * Platform admin access is STRICTLY gated by profiles.is_platform_admin.
 * Engagement roles like "founder" do NOT grant admin portal access —
 * they only grant leadership within a specific war room.
 */
export function useIsAdmin() {
  const { user, loading: sessionLoading } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsAdmin(Boolean(prof?.is_platform_admin));
      setLoading(false);
    }
    if (!sessionLoading) check();
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  return { isAdmin, loading: sessionLoading || loading };
}
