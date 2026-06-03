import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SOSModal } from "@/components/v2/SOSButton";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";

/**
 * Mission-level mount for global quick-action modals (SOS, Score Me, Phone a Friend).
 * Listens for `atlas:open-sos`, `atlas:open-score-me`, `atlas:open-phone-a-friend`
 * so they work from anywhere in a mission (command palette, top bar, etc).
 */
export function MissionQuickActionsMount({ missionId }: { missionId: string }) {
  const [sosOpen, setSosOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  // Pick a sensible default question for Score Me / Phone a Friend (writer's first urgent assigned).
  const { data: me } = useQuery({
    queryKey: ["mqa-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: defaultQ } = useQuery({
    queryKey: ["mqa-default-q", missionId, me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,assigned_writer_id,health,pens_down_date")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", me!)
        .order("pens_down_date", { ascending: true });
      const list = data ?? [];
      const rank = (h: string | null) => (h === "red" ? 0 : h === "yellow" ? 1 : 2);
      list.sort((a: any, b: any) => rank(a.health) - rank(b.health));
      return (list[0] ?? null) as { id: string; question_number: string } | null;
    },
  });

  const { data: meName } = useQuery({
    queryKey: ["mqa-me-name", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", me!).maybeSingle();
      return data?.display_name || data?.email || "";
    },
  });

  useEffect(() => {
    const onSOS = () => setSosOpen(true);
    const onScore = () => setScoreOpen(true);
    const onPhone = () => setPhoneOpen(true);
    window.addEventListener("atlas:open-sos", onSOS);
    window.addEventListener("atlas:open-score-me", onScore);
    window.addEventListener("atlas:open-phone-a-friend", onPhone);
    return () => {
      window.removeEventListener("atlas:open-sos", onSOS);
      window.removeEventListener("atlas:open-score-me", onScore);
      window.removeEventListener("atlas:open-phone-a-friend", onPhone);
    };
  }, []);

  return (
    <>
      {sosOpen && <SOSModal missionId={missionId} onClose={() => setSosOpen(false)} />}
      <ScoreMeOverlay open={scoreOpen} onClose={() => setScoreOpen(false)} missionId={missionId} lockedQuestionId={defaultQ?.id} />
      {phoneOpen && defaultQ && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={defaultQ.id}
          questionNumber={defaultQ.question_number}
          meId={me ?? null}
          meName={meName ?? ""}
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </>
  );
}
