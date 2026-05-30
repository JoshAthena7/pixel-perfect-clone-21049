import { useEffect, useState } from "react";
import { HandHelping } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

const COOLDOWN_MS = 30 * 60 * 1000;
const storageKey = (sectionId: string) => `stuck:${sectionId}`;

export function StuckButton({ sectionId, sectionName }: { sectionId: string; sectionName: string }) {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  useEffect(() => {
    const v = Number(localStorage.getItem(storageKey(sectionId)) ?? 0);
    if (v && Date.now() < v) setCooldownUntil(v);
  }, [sectionId]);

  const onCooldown = Date.now() < cooldownUntil;

  async function send() {
    if (!engagement || !member || !user || sending || onCooldown) return;
    setSending(true);
    const firstName = (member.display_name || "").split(/\s+/)[0] || member.display_name;
    const { error } = await supabase.from("stuck_flags").insert({
      engagement_id: engagement.id,
      member_id: member.id,
      user_id: user.id,
      section_id: sectionId,
      section_name: sectionName,
      writer_name: firstName,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    const until = Date.now() + COOLDOWN_MS;
    localStorage.setItem(storageKey(sectionId), String(until));
    setCooldownUntil(until);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 3000);
  }

  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400/90">
        Your lead has been notified
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={sending || onCooldown}
      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
      title={onCooldown ? "Already flagged — reset in 30 minutes" : "Tell your lead you're stuck on this section"}
    >
      <HandHelping className="h-3.5 w-3.5" />
      {onCooldown ? "Lead notified" : "I'm stuck on this section"}
    </button>
  );
}
