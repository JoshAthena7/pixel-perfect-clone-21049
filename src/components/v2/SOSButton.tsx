import { useState, useMemo } from "react";
import { PersonFirstHint } from "@/components/v2/PersonFirstHint";
import { AlertOctagon, X, Compass, Vote, Handshake, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { wisdomLine } from "@/lib/wisdom";

type SosKind = "direction" | "decision" | "help" | "air_cover";

const KINDS: Array<{ key: SosKind; icon: typeof Compass; title: string; sub: string }> = [
  { key: "direction", icon: Compass, title: "Direction", sub: "I need strategic guidance" },
  { key: "decision", icon: Vote, title: "Decision", sub: "I need a decision made" },
  { key: "help", icon: Handshake, title: "Help", sub: "I need someone to help me" },
  { key: "air_cover", icon: Shield, title: "Air Cover", sub: "I need leadership support" },
];

const TYPE_MAP: Record<SosKind, string> = {
  direction: "sme_request",
  decision: "decision_needed",
  help: "sme_request",
  air_cover: "air_cover",
};

export function SOSButton({ missionId, questionId }: { missionId: string; questionId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="sos-pulse rounded-md border px-5 py-2 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
        style={{
          background: "rgba(239,68,68,0.10)",
          borderColor: "rgba(239,68,68,0.30)",
          color: "var(--red, #ef4444)",
        }}
        aria-label="SOS — request help. You're not alone."
        title="You're not alone. Help is one click away."
      >
        <AlertOctagon className="h-3.5 w-3.5" /> SOS
      </button>
      <style>{`
        .sos-pulse {
          box-shadow: 0 0 0 0 rgba(239,68,68,0.35);
          animation: sos-breath 3.6s ease-in-out infinite;
        }
        .sos-pulse:hover { animation: none; box-shadow: 0 0 0 4px rgba(239,68,68,0.18); }
        @keyframes sos-breath {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.0); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0.12); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sos-pulse { animation: none; }
        }
      `}</style>
      {open && <SOSModal missionId={missionId} questionId={questionId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SOSModal({ missionId, questionId, onClose }: { missionId: string; questionId?: string; onClose: () => void }) {
  const [kind, setKind] = useState<SosKind | null>(null);
  const [headline, setHeadline] = useState("");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  // One supportive line per modal session — chosen once, doesn't flicker.
  const supportiveLine = useMemo(() => wisdomLine("support"), []);

  async function submit() {
    if (!kind || !headline.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = prof?.display_name || prof?.email?.split("@")[0] || "Writer";

      if (questionId) {
        const { error } = await supabase.from("question_collaboration").insert({
          question_id: questionId,
          mission_id: missionId,
          author_id: user.id,
          author_name: name,
          entry_type: TYPE_MAP[kind],
          body: `${headline.trim()}${detail.trim() ? `\n\n${detail.trim()}` : ""}`,
        });
        if (error) throw error;
      }

      await supabase.from("signals").insert({
        mission_id: missionId,
        source_module: "studio_sos",
        signal_type: kind === "air_cover" ? "air_cover" : kind === "decision" ? "decision_needed" : "sme_request",
        signal_title: `SOS · ${KINDS.find((k) => k.key === kind)!.title} — ${name}`,
        signal_summary: headline.trim(),
        severity: "high",
        related_question_id: questionId ?? null,
        user_id: user.id,
      });

      toast.success("Sent. Leadership notified.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-surface relative w-full max-w-md overflow-hidden rounded-[14px] p-6"
        style={{ borderColor: "rgba(239,68,68,0.25)" }}>
        <button onClick={onClose} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X size={16} /></button>
        <div className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: "var(--red, #ef4444)" }}>● SOS</div>
        <h2 className="mt-2 text-xl font-semibold">You're not alone.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what's happening.</p>

        {!kind ? (
          <div className="mt-5 grid grid-cols-1 gap-2">
            {KINDS.map(({ key, icon: Icon, title, sub }) => (
              <button key={key} onClick={() => setKind(key)}
                className="flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left hover:border-[color:var(--red,#ef4444)]/40 hover:bg-[color:var(--red,#ef4444)]/[0.04] transition-colors">
                <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {KINDS.find((k) => k.key === kind)!.title}
            </div>
            <input
              autoFocus
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="In one line — what do you need?"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              placeholder="Optional — context, what you've tried, what would unblock you"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <PersonFirstHint value={detail} onChange={setDetail} />
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setKind(null)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              <button onClick={submit} disabled={sending || !headline.trim()}
                className="rounded-md px-5 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--red, #ef4444)", color: "white" }}>
                {sending ? "Sending…" : "Send SOS"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
