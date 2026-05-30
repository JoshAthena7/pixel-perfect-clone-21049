import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
  id: string;
  role: string;
  display_name: string;
};

export type Membership = {
  member_id: string;
  role: string;
  display_name: string;
  engagement: Engagement;
};

type Ctx = {
  loading: boolean;
  engagement: Engagement | null;
  engagements: Engagement[]; // back-compat: same data as memberships' engagements
  memberships: Membership[];
  setEngagementId: (id: string) => void; // back-compat alias for switchEngagement
  switchEngagement: (id: string) => void;
  member: Member | null;
  role: string | null;
  isLeadership: boolean;
  canWrite: boolean;
  isWriter: boolean;
  isViewer: boolean;
  refresh: () => Promise<void>;
};

const EngagementContext = createContext<Ctx | null>(null);

const LEADERSHIP = new Set(["founder", "pm", "engagement_lead"]);
const LS_KEY = "athena.currentEngagementId";

export function EngagementProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    // One query: memberships joined with engagements (non-archived)
    const { data } = await supabase
      .from("engagement_members")
      .select("id, role, display_name, engagement:engagements!inner(id, name, client, status, submission_date, created_by)")
      .eq("user_id", uid)
      .neq("engagements.status", "Archived");

    let list: Membership[] = ((data as any[]) ?? [])
      .filter((row) => row.engagement)
      .map((row) => ({
        member_id: row.id as string,
        role: row.role as string,
        display_name: row.display_name as string,
        engagement: row.engagement as Engagement,
      }));

    // Bootstrap a default engagement for brand-new founders with zero memberships
    if (list.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .single();
      const { data: newEng } = await supabase
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
      if (newEng) {
        if (profile?.display_name) {
          await supabase
            .from("engagement_members")
            .update({ display_name: profile.display_name })
            .eq("engagement_id", (newEng as Engagement).id)
            .eq("user_id", uid);
        }
        // Re-fetch memberships to pick up the seed trigger's founder row
        const { data: again } = await supabase
          .from("engagement_members")
          .select("id, role, display_name, engagement:engagements!inner(id, name, client, status, submission_date, created_by)")
          .eq("user_id", uid)
          .neq("engagements.status", "Archived");
        list = ((again as any[]) ?? [])
          .filter((r) => r.engagement)
          .map((r) => ({
            member_id: r.id,
            role: r.role,
            display_name: r.display_name,
            engagement: r.engagement,
          }));
      }
    }

    setMemberships(list);

    // Pick current: localStorage if still valid, else single membership, else none
    const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (stored && list.some((m) => m.engagement.id === stored)) {
      setCurrentId(stored);
    } else if (list.length === 1) {
      setCurrentId(list[0].engagement.id);
      if (typeof window !== "undefined") localStorage.setItem(LS_KEY, list[0].engagement.id);
    } else {
      setCurrentId(null);
      if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setMemberships([]);
      setCurrentId(null);
      setLoading(false);
      if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
      return;
    }
    load(user.id);
  }, [user, sessionLoading, load]);

  const switchEngagement = useCallback((id: string) => {
    setMemberships((prev) => {
      if (prev.some((m) => m.engagement.id === id)) {
        setCurrentId(id);
        if (typeof window !== "undefined") localStorage.setItem(LS_KEY, id);
      }
      return prev;
    });
  }, []);

  const currentMembership = memberships.find((m) => m.engagement.id === currentId) ?? null;
  const engagement = currentMembership?.engagement ?? null;
  const member: Member | null = currentMembership
    ? {
        id: currentMembership.member_id,
        role: currentMembership.role,
        display_name: currentMembership.display_name,
      }
    : null;
  const role = member?.role ?? null;
  const isLeadership = !!role && LEADERSHIP.has(role);
  const canWrite = isLeadership;
  const isWriter = role === "writer";
  const isViewer = role === "viewer";

  return (
    <EngagementContext.Provider
      value={{
        loading,
        engagement,
        engagements: memberships.map((m) => m.engagement),
        memberships,
        setEngagementId: switchEngagement,
        switchEngagement,
        member,
        role,
        isLeadership,
        canWrite,
        isWriter,
        isViewer,
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

export function useCanWrite() {
  return useEngagement().canWrite;
}
