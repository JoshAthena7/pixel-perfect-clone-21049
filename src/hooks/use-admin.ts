import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

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
      const [{ data: prof }, { data: founderRows }] = await Promise.all([
        supabase.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle(),
        supabase
          .from("engagement_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "founder")
          .limit(1),
      ]);
      if (cancelled) return;
      setIsAdmin(Boolean(prof?.is_platform_admin) || (founderRows?.length ?? 0) > 0);
      setLoading(false);
    }
    if (!sessionLoading) check();
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  return { isAdmin, loading: sessionLoading || loading };
}
