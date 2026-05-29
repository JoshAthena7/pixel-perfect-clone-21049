import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Heart, Star, Sparkles, Copy, Gift } from "lucide-react";
import { toast } from "sonner";
import { draftPulseMessage } from "@/lib/ai/pulse.functions";

export type RecognitionMember = {
  id: string;
  display_name: string;
};

export type Pulse = {
  id: string;
  member_id: string;
  star_count: number;
  tlc_count: number;
};

export type FormKind = "tlc" | "star";

const HEALTH = {
  green: "#3B6D11",
  red: "#A32D2D",
  amber: "#BA7517",
};

/** Hook: load pulses for an engagement and expose totals + refresh. */
export function usePulses(engagementId: string | undefined) {
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});

  async function refresh() {
    if (!engagementId) return;
    const { data } = await supabase
      .from("engagement_pulses")
      .select("id, member_id, star_count, tlc_count")
      .eq("engagement_id", engagementId);
    const map: Record<string, Pulse> = {};
    ((data as Pulse[]) ?? []).forEach((p) => { map[p.member_id] = p; });
    setPulses(map);
  }

  useEffect(() => { void refresh(); }, [engagementId]);

  return { pulses, refresh };
}

export function RecognitionSummary({
  members,
  pulses,
}: {
  members: RecognitionMember[];
  pulses: Record<string, Pulse>;
}) {
  const totals = useMemo(() => {
    const enriched = members.map((m) => ({
      ...m,
      stars: pulses[m.id]?.star_count ?? 0,
      tlcs: pulses[m.id]?.tlc_count ?? 0,
    }));
    const totalStars = enriched.reduce((s, m) => s + m.stars, 0);
    const totalTlc = enriched.reduce((s, m) => s + m.tlcs, 0);
    const mostStars = [...enriched].sort((a, b) => b.stars - a.stars)[0];
    const mostTlc = [...enriched].sort((a, b) => b.tlcs - a.tlcs)[0];
    return {
      totalStars,
      totalTlc,
      mostRecognized: mostStars && mostStars.stars > 0 ? mostStars : null,
      needsAttention: mostTlc && mostTlc.tlcs > 0 ? mostTlc : null,
    };
  }, [members, pulses]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard
        label="Total recognitions"
        value={String(totals.totalStars)}
        icon={<Star className="h-4 w-4" />}
        accent={HEALTH.green}
      />
      <MetricCard
        label="Total TLC flags"
        value={String(totals.totalTlc)}
        icon={<Heart className="h-4 w-4" />}
        accent={HEALTH.red}
      />
      <MetricCard
        label="Most recognized"
        value={totals.mostRecognized ? totals.mostRecognized.display_name : "—"}
        sub={totals.mostRecognized ? `${totals.mostRecognized.stars} ★` : "No stars yet"}
        icon={<Sparkles className="h-4 w-4" />}
        accent={HEALTH.green}
      />
      <MetricCard
        label="Needs attention"
        value={totals.needsAttention ? totals.needsAttention.display_name : "—"}
        sub={totals.needsAttention ? `${totals.needsAttention.tlcs} flag${totals.needsAttention.tlcs > 1 ? "s" : ""}` : "All clear"}
        icon={<Heart className="h-4 w-4" />}
        accent={HEALTH.red}
      />
    </div>
  );
}

/** Buttons + inline form for a single member. Render under a member row. */
export function MemberRecognitionPanel({
  member,
  engagementId,
  pulse,
  openForm,
  onOpen,
  onClose,
  onSaved,
}: {
  member: RecognitionMember;
  engagementId: string;
  pulse: Pulse | undefined;
  openForm: FormKind | null;
  onOpen: (kind: FormKind) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const stars = pulse?.star_count ?? 0;
  const tlcs = pulse?.tlc_count ?? 0;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: HEALTH.green }}>
          <Star className="h-3.5 w-3.5 fill-current" />{stars}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: HEALTH.red }}>
          <Heart className="h-3.5 w-3.5 fill-current" />{tlcs}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={openForm === "tlc" ? "default" : "outline"}
            onClick={() => (openForm === "tlc" ? onClose() : onOpen("tlc"))}
            style={openForm === "tlc" ? { background: HEALTH.red } : undefined}
          >
            <Heart className="mr-1.5 h-3.5 w-3.5" />Flag TLC
          </Button>
          <Button
            size="sm"
            variant={openForm === "star" ? "default" : "outline"}
            onClick={() => (openForm === "star" ? onClose() : onOpen("star"))}
            style={openForm === "star" ? { background: HEALTH.green } : undefined}
          >
            <Star className="mr-1.5 h-3.5 w-3.5" />Recognize
          </Button>
        </div>
      </div>

      {openForm && (
        <div className="rounded-lg border border-border bg-background p-4">
          {openForm === "tlc" ? (
            <TlcForm member={member} engagementId={engagementId} onCancel={onClose} onSaved={onSaved} />
          ) : (
            <StarForm member={member} engagementId={engagementId} onCancel={onClose} onSaved={onSaved} />
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <Card className="border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded text-white" style={{ background: accent }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

async function upsertPulse(opts: {
  engagementId: string;
  memberId: string;
  kind: FormKind;
  note: string;
  followUp: string;
}) {
  const { data: existing } = await supabase
    .from("engagement_pulses")
    .select("id, star_count, tlc_count")
    .eq("member_id", opts.memberId)
    .maybeSingle();

  const cur = (existing as { id: string; star_count: number; tlc_count: number } | null) ?? null;

  if (cur) {
    const update: Record<string, unknown> =
      opts.kind === "tlc"
        ? { tlc_count: cur.tlc_count + 1, last_flag_note: opts.note, last_flag_type: opts.followUp }
        : { star_count: cur.star_count + 1, last_recognition_note: opts.note, last_recognition_type: opts.followUp };
    const { error } = await supabase.from("engagement_pulses").update(update as never).eq("id", cur.id);
    if (error) throw error;
  } else {
    const insert: Record<string, unknown> = {
      engagement_id: opts.engagementId,
      member_id: opts.memberId,
      star_count: opts.kind === "star" ? 1 : 0,
      tlc_count: opts.kind === "tlc" ? 1 : 0,
      ...(opts.kind === "tlc"
        ? { last_flag_note: opts.note, last_flag_type: opts.followUp }
        : { last_recognition_note: opts.note, last_recognition_type: opts.followUp }),
    };
    const { error } = await supabase.from("engagement_pulses").insert(insert as never);
    if (error) throw error;
  }
}

function GiftCardChooser({ provider }: { provider: "Giftogram" | "Tremendous" }) {
  const [amount, setAmount] = useState<25 | 50 | 100>(50);
  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-surface-hover/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Gift className="h-3.5 w-3.5" />Gift card
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[25, 50, 100].map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a as 25 | 50 | 100)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition " +
              (amount === a ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-hover")
            }
          >
            ${a}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => toast.info(`Stub: send $${amount} via ${provider} — connect API to enable.`)}
        >
          Send ${amount} via {provider}
        </Button>
      </div>
    </div>
  );
}

function DraftPanel({ draft, loading }: { draft: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface-hover/40 p-3 text-xs text-muted-foreground">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5 animate-pulse" />Drafting message…
      </div>
    );
  }
  if (!draft) return null;
  return (
    <div className="mt-3 rounded-md border border-border bg-surface-hover/40 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span><Sparkles className="mr-1.5 inline h-3.5 w-3.5" />Drafted message</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={() => {
            void navigator.clipboard.writeText(draft);
            toast.success("Copied");
          }}
        >
          <Copy className="mr-1 h-3 w-3" />Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{draft}</p>
    </div>
  );
}

function TlcForm({
  member,
  engagementId,
  onCancel,
  onSaved,
}: {
  member: RecognitionMember;
  engagementId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("Personal check-in message");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const draftFn = useServerFn(draftPulseMessage);
  const isGift = followUp === "Gift card";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return toast.error("Add a note");
    setSaving(true);
    try {
      await upsertPulse({ engagementId, memberId: member.id, kind: "tlc", note, followUp });
      toast.success(`Flagged TLC for ${member.display_name}`);
      setDrafting(true);
      try {
        const { message } = await draftFn({
          data: { engagementId, memberName: member.display_name, tone: "tlc", note, followUp },
        });
        setDraft(message);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't draft message");
      } finally {
        setDrafting(false);
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-sm font-bold" style={{ color: HEALTH.red }}>
        <Heart className="mr-1.5 inline h-4 w-4 fill-current" />Flag TLC for {member.display_name}
      </div>
      <Field label="What's going on?">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required />
      </Field>
      <Field label="Follow-up">
        <Select value={followUp} onValueChange={setFollowUp}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Personal check-in message", "Gift card", "Just flag for my awareness"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {isGift && <GiftCardChooser provider="Giftogram" />}
      <DraftPanel draft={draft} loading={drafting} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Close</Button>
        <Button type="submit" size="sm" disabled={saving} style={{ background: HEALTH.red }}>
          {saving ? "Saving…" : "Flag & draft"}
        </Button>
      </div>
    </form>
  );
}

function StarForm({
  member,
  engagementId,
  onCancel,
  onSaved,
}: {
  member: RecognitionMember;
  engagementId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("Send a thank-you message");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const draftFn = useServerFn(draftPulseMessage);
  const isGift = followUp === "Gift card" || followUp === "All three";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return toast.error("Add a note");
    setSaving(true);
    try {
      await upsertPulse({ engagementId, memberId: member.id, kind: "star", note, followUp });
      toast.success(`Recognized ${member.display_name}`);
      setDrafting(true);
      try {
        const { message } = await draftFn({
          data: { engagementId, memberName: member.display_name, tone: "recognition", note, followUp },
        });
        setDraft(message);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't draft message");
      } finally {
        setDrafting(false);
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-sm font-bold" style={{ color: HEALTH.green }}>
        <Star className="mr-1.5 inline h-4 w-4 fill-current" />Recognize {member.display_name}
      </div>
      <Field label="What did they do?">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required />
      </Field>
      <Field label="How to recognize">
        <Select value={followUp} onValueChange={setFollowUp}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Send a thank-you message", "Gift card", "Shout-out in next huddle", "All three"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {isGift && <GiftCardChooser provider="Tremendous" />}
      <DraftPanel draft={draft} loading={drafting} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Close</Button>
        <Button type="submit" size="sm" disabled={saving} style={{ background: HEALTH.green }}>
          {saving ? "Saving…" : "Draft recognition"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
