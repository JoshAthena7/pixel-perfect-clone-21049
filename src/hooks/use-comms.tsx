import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "./use-engagement";
import { useSession } from "./use-session";
import { toast } from "sonner";

const ONLINE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

type PresenceRow = { member_id: string; last_seen: string };
type NudgeRow = { id: string; sender_id: string; sender_name: string; recipient_id: string; created_at: string; read: boolean };
type ChatRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  message: string;
  created_at: string;
  expires_at: string;
  read: boolean;
};

type Ctx = {
  presence: Record<string, string>; // member_id -> last_seen ISO
  isOnline: (memberId: string) => boolean;
  openChatWith: (memberId: string, displayName: string) => void;
  closeChat: () => void;
  chatOpenWith: { memberId: string; displayName: string } | null;
  unreadChats: number;
  unreadNudges: NudgeRow[];
  sendNudge: (recipientId: string, recipientName: string) => Promise<void>;
  markNudgesRead: () => Promise<void>;
};

const CommsContext = createContext<Ctx | null>(null);

export function CommsProvider({ children }: { children: ReactNode }) {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadNudges, setUnreadNudges] = useState<NudgeRow[]>([]);
  const [chatOpenWith, setChatOpenWith] = useState<{ memberId: string; displayName: string } | null>(null);
  const lastNudgeAtRef = useRef<Record<string, number>>({});

  // Heartbeat
  useEffect(() => {
    if (!engagement || !member || !user) return;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await supabase.from("presence").upsert(
        { member_id: member!.id, engagement_id: engagement!.id, user_id: user!.id, last_seen: new Date().toISOString() },
        { onConflict: "member_id" },
      );
    }
    tick();
    const i = setInterval(tick, HEARTBEAT_MS);
    return () => { cancelled = true; clearInterval(i); };
  }, [engagement?.id, member?.id, user?.id]);

  // Load + subscribe presence
  useEffect(() => {
    if (!engagement) return;
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("presence")
        .select("member_id, last_seen")
        .eq("engagement_id", engagement!.id);
      if (!active) return;
      const map: Record<string, string> = {};
      (data as PresenceRow[] | null)?.forEach((r) => { map[r.member_id] = r.last_seen; });
      setPresence(map);
    }
    load();
    const ch = supabase
      .channel(`presence-table:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence", filter: `engagement_id=eq.${engagement.id}` }, (payload) => {
        const row = (payload.new ?? payload.old) as PresenceRow;
        if (!row) return;
        setPresence((prev) => ({ ...prev, [row.member_id]: row.last_seen }));
      })
      .subscribe();
    // Re-evaluate online state every 30s
    const tick = setInterval(() => setPresence((p) => ({ ...p })), 30_000);
    return () => { active = false; supabase.removeChannel(ch); clearInterval(tick); };
  }, [engagement?.id]);

  // Load + subscribe unread chats and nudges for me
  useEffect(() => {
    if (!engagement || !member) return;
    let active = true;
    async function loadUnread() {
      const [{ count }, { data: nudges }] = await Promise.all([
        supabase.from("quick_chats").select("id", { count: "exact", head: true })
          .eq("engagement_id", engagement!.id).eq("recipient_id", member!.id).eq("read", false).gt("expires_at", new Date().toISOString()),
        supabase.from("nudges").select("id, sender_id, sender_name, recipient_id, created_at, read")
          .eq("engagement_id", engagement!.id).eq("recipient_id", member!.id).eq("read", false)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setUnreadChats(count ?? 0);
      setUnreadNudges((nudges as NudgeRow[]) ?? []);
    }
    loadUnread();
    const ch = supabase
      .channel(`comms:${member.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quick_chats", filter: `recipient_id=eq.${member.id}` }, () => loadUnread())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quick_chats", filter: `recipient_id=eq.${member.id}` }, () => loadUnread())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nudges", filter: `recipient_id=eq.${member.id}` }, async (payload) => {
        const n = payload.new as NudgeRow;
        toast.message(`👋 ${n.sender_name} is asking if you have a minute`, {
          action: { label: "Open chat", onClick: () => openChatWith(n.sender_id, n.sender_name) },
        });
        loadUnread();
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [engagement?.id, member?.id]);

  const isOnline = (memberId: string) => {
    const ts = presence[memberId];
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < ONLINE_MS;
  };

  const openChatWith = (memberId: string, displayName: string) => {
    setChatOpenWith({ memberId, displayName });
  };
  const closeChat = () => setChatOpenWith(null);

  const sendNudge = async (recipientId: string, recipientName: string) => {
    if (!engagement || !member) return;
    const last = lastNudgeAtRef.current[recipientId] ?? 0;
    if (Date.now() - last < 10 * 60 * 1000) {
      toast.error("You already nudged this person in the last 10 minutes.");
      return;
    }
    const { error } = await supabase.from("nudges").insert({
      engagement_id: engagement.id,
      sender_id: member.id,
      sender_name: member.display_name,
      recipient_id: recipientId,
    });
    if (error) { toast.error(error.message); return; }
    lastNudgeAtRef.current[recipientId] = Date.now();
    toast.success(`Nudge sent to ${recipientName}`);
  };

  const markNudgesRead = async () => {
    if (!member || unreadNudges.length === 0) return;
    const ids = unreadNudges.map((n) => n.id);
    await supabase.from("nudges").update({ read: true }).in("id", ids);
    setUnreadNudges([]);
  };

  const value = useMemo<Ctx>(() => ({
    presence, isOnline, openChatWith, closeChat, chatOpenWith, unreadChats, unreadNudges, sendNudge, markNudgesRead,
  }), [presence, chatOpenWith, unreadChats, unreadNudges]);

  return <CommsContext.Provider value={value}>{children}</CommsContext.Provider>;
}

export function useComms() {
  const ctx = useContext(CommsContext);
  if (!ctx) throw new Error("useComms must be inside CommsProvider");
  return ctx;
}

export type { NudgeRow, ChatRow };
