import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

export type Engagement = {
  id: string;
  name: string;
  client: string;
  status: string;
  submission_date: string | null;
  created_by: string | null;
};

export type Member = {
  role: string;
  display_name: string;
};

type Ctx = {
  loading: boolean;
  engagement: Engagement | null;
  engagements: Engagement[];
  setEngagementId: (id: string) => void;
  member: Member | null;
  isLeadership: boolean;
  refresh: () => Promise<void>;
};

const EngagementContext = createContext<Ctx | null>(null);

const LEADERSHIP = new Set(["founder", "pm", "engagement_lead"]);

export function EngagementProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(uid: string) {
    setLoading(true);
    // List engagements user is a member of
    const { data: mems } = await supabase
      .from("engagement_members")
      .select("engagement_id, role, display_name")
      .eq("user_id", uid);

    let list: Engagement[] = [];
    if (mems && mems.length > 0) {
      const ids = mems.map((m) => m.engagement_id);
      const { data: engs } = await supabase
        .from("engagements")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });
      list = (engs as Engagement[]) ?? [];
    }

    // Bootstrap default engagement if user has none
    if (list.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .single();
      const { data: newEng, error } = await supabase
        .from("engagements")
        .insert({
          name: "Indiana Medicaid Pursuit",
          client: "Indiana FSSA",
          status: "Active",
          submission_date: null,
          created_by: uid,
        })
        .select()
        .single();
      if (!error && newEng) {
        list = [newEng as Engagement];
        // Update founder display_name if profile exists
        if (profile?.display_name) {
          await supabase
            .from("engagement_members")
            .update({ display_name: profile.display_name })
            .eq("engagement_id", newEng.id)
            .eq("user_id", uid);
        }
      }
    }

    setEngagements(list);
    const current = list[0] ?? null;
    setEngagement(current);
    if (current) {
      const { data: m } = await supabase
        .from("engagement_members")
        .select("role, display_name")
        .eq("engagement_id", current.id)
        .eq("user_id", uid)
        .single();
      setMember((m as Member) ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setEngagement(null);
      setEngagements([]);
      setMember(null);
      setLoading(false);
      return;
    }
    load(user.id);
  }, [user, sessionLoading]);

  function setEngagementId(id: string) {
    const e = engagements.find((x) => x.id === id);
    if (e) setEngagement(e);
  }

  return (
    <EngagementContext.Provider
      value={{
        loading,
        engagement,
        engagements,
        setEngagementId,
        member,
        isLeadership: !!member && LEADERSHIP.has(member.role),
        refresh: async () => {
          if (user) await load(user.id);
        },
      }}
    >
      {children}
    </EngagementContext.Provider>
  );
}

export function useEngagement() {
  const ctx = useContext(EngagementContext);
  if (!ctx) throw new Error("useEngagement must be used within EngagementProvider");
  return ctx;
}
