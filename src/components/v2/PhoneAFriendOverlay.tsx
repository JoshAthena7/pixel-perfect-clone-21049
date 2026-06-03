import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { matchExperts, type ExpertMatch } from "@/lib/expertise.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Phone, Sparkles } from "lucide-react";

export function PhoneAFriendOverlay({
  missionId,
  questionId,
  questionNumber,
  meId,
  meName,
  onClose,
}: {
  missionId: string;
  questionId: string;
  questionNumber: string;
  meId: string | null;
  meName: string;
  onClose: () => void;
}) {
  const fetchMatches = useServerFn(matchExperts);
  const { data, isLoading } = useQuery({
    queryKey: ["phone-a-friend", missionId, questionId],
    queryFn: () => fetchMatches({ data: { missionId, questionId } }),
  });

  async function requestCall(expert: ExpertMatch) {
    if (!meId) {
      toast.error("Please sign in to request a call.");
      return;
    }
    const { error } = await supabase.from("question_collaboration").insert({
      question_id: questionId,
      mission_id: missionId,
      author_id: meId,
      author_name: meName,
      entry_type: "phone_a_friend",
      body: `Requested a call with ${expert.display_name ?? "an expert"} about Q${questionNumber}.`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Call requested with ${expert.display_name ?? "expert"}. They'll be notified.`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[14px] border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Phone a Friend · Q{questionNumber}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Finding the right person…</div>
          ) : !data?.primary ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No available experts yet. Try again after teammates set their availability,
              or use SOS to escalate to leadership.
            </div>
          ) : (
            <>
              <PrimaryCard expert={data.primary} irisLine={data.iris_line} onRequest={() => requestCall(data.primary!)} />

              {data.alternatives.length > 0 && (
                <div className="mt-5 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Alternatives
                  </div>
                  {data.alternatives.map((e) => (
                    <AltRow key={e.id} expert={e} onRequest={() => requestCall(e)} />
                  ))}
                </div>
              )}

              <button className="mt-5 w-full rounded-md border border-border bg-surface/60 py-2 text-xs text-muted-foreground hover:text-foreground">
                Search all Athena experts →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PrimaryCard({
  expert,
  irisLine,
  onRequest,
}: {
  expert: ExpertMatch;
  irisLine: string | null;
  onRequest: () => void;
}) {
  const initials = (expert.display_name ?? expert.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-[12px] border p-4"
      style={{
        borderColor: "rgba(59,127,255,0.4)",
        background:
          "linear-gradient(180deg, rgba(59,127,255,0.10), rgba(59,127,255,0.02))",
      }}
    >
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent,#3b7fff)" }}>
        <Sparkles className="h-3 w-3" /> IRIS Recommends
      </div>
      <div className="flex items-start gap-3">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ background: expert.avatar_color ?? "#3b7fff" }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{expert.display_name ?? "Unnamed"}</div>
          <div className="text-[11px] text-muted-foreground">{expert.email}</div>
        </div>
      </div>

      {irisLine && (
        <p className="mt-3 rounded-md bg-background/40 px-3 py-2 text-[12px] italic text-foreground">
          “{irisLine}”
        </p>
      )}

      {expert.expertise_areas.length > 0 && (
        <Section label="Expertise">
          <Chips items={expert.expertise_areas.slice(0, 4)} />
        </Section>
      )}
      {(expert.states_experience.length > 0 || expert.programs_experience.length > 0) && (
        <Section label="Experience">
          <div className="text-[11px] text-foreground">
            {expert.states_experience.length > 0 && <span>{expert.states_experience.join(" · ")}</span>}
            {expert.programs_experience.length > 0 && (
              <div className="text-muted-foreground">{expert.programs_experience.slice(0, 3).join(" · ")}</div>
            )}
          </div>
        </Section>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-emerald-400">Available</span>
      </div>

      <button
        onClick={onRequest}
        className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Request a call with {(expert.display_name ?? "them").split(/\s+/)[0]} →
      </button>
    </div>
  );
}

function AltRow({ expert, onRequest }: { expert: ExpertMatch; onRequest: () => void }) {
  const initials = (expert.display_name ?? expert.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface/60 px-3 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ background: expert.avatar_color ?? "#3b7fff" }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-foreground">{expert.display_name ?? "Unnamed"}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {expert.expertise_areas.slice(0, 2).join(" · ") || expert.email}
        </div>
      </div>
      <button
        onClick={onRequest}
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] hover:bg-surface-hover"
      >
        Request
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-foreground">{i}</span>
      ))}
    </div>
  );
}

/* ───────────────────────── global event listener ───────────────────────── */
/**
 * Mount once near the cockpit to handle ⌘K "Phone a Friend" launches.
 */
export function PhoneAFriendListener({
  missionId,
  questionId,
  questionNumber,
  meId,
  meName,
}: {
  missionId: string;
  questionId: string;
  questionNumber: string;
  meId: string | null;
  meName: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atlas:open-phone-a-friend", onOpen);
    return () => window.removeEventListener("atlas:open-phone-a-friend", onOpen);
  }, []);
  if (!open) return null;
  return (
    <PhoneAFriendOverlay
      missionId={missionId}
      questionId={questionId}
      questionNumber={questionNumber}
      meId={meId}
      meName={meName}
      onClose={() => setOpen(false)}
    />
  );
}
