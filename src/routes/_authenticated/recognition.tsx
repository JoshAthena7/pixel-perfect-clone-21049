import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
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

export const Route = createFileRoute("/_authenticated/recognition")({
  head: () => ({ meta: [{ title: "Recognition — Athena" }] }),
  component: RecognitionGate,
});

function RecognitionGate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/team" replace />;
  return <RecognitionPage />;
}

type Member = {
  id: string;
  display_name: string;
  title: string | null;
  role: string;
};

type Pulse = {
  id: string;
  member_id: string;
  star_count: number;
  tlc_count: number;
};

type FilterKey = "all" | "tlc" | "recognized";
type FormKind = "tlc" | "star";

const HEALTH = {
  green: "#3B6D11",
  red: "#A32D2D",
  amber: "#BA7517",
};

const AVATAR_COLORS = ["#185FA5", "#0F6E56", "#533AB7", "#A32D2D", "#BA7517", "#993C1D", "#3B6D11", "#1F4F70"];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function healthColor(stars: number, tlcs: number) {
  if (stars >= 3 && tlcs === 0) return HEALTH.green;
  if (tlcs >= 2 && stars === 0) return HEALTH.red;
  if (stars > 0 && tlcs > 0) return HEALTH.amber;
  return "var(--border)";
}

function RecognitionPage() {
  const { engagement } = useEngagement();
  const [members, setMembers] = useState<Member[]>([]);
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openForm, setOpenForm] = useState<{ memberId: string; kind: FormKind } | null>(null);

  useEffect(() => {
    if (!engagement) return;
    void load(engagement.id);
  }, [engagement?.id]);

  async function load(eid: string) {
    const [mRes, pRes] = await Promise.all([
      supabase.from("engagement_members").select("id, display_name, title, role").eq("engagement_id", eid).order("display_name"),
      supabase.from("engagement_pulses").select("id, member_id, star_count, tlc_count").eq("engagement_id", eid),
    ]);
    setMembers((mRes.data as Member[]) ?? []);
    const map: Record<string, Pulse> = {};
    ((pRes.data as Pulse[]) ?? []).forEach((p) => { map[p.member_id] = p; });
    setPulses(map);
  }

  const enriched = useMemo(() => {
    return members.map((m) => {
      const p = pulses[m.id];
      return {
        ...m,
        stars: p?.star_count ?? 0,
        tlcs: p?.tlc_count ?? 0,
      };
    });
  }, [members, pulses]);

  const maxStars = useMemo(() => Math.max(1, ...enriched.map((m) => m.stars)), [enriched]);

  const totals = useMemo(() => {
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
  }, [enriched]);

  const filtered = useMemo(() => {
    if (filter === "tlc") return enriched.filter((m) => m.tlcs > 0);
    if (filter === "recognized") return enriched.filter((m) => m.stars > 0);
    return enriched;
  }, [enriched, filter]);

  async function refresh() {
    if (engagement) await load(engagement.id);
  }

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recognition</h1>
        <p className="text-xs text-muted-foreground">Stars, TLC flags, and team pulse — cumulative across the engagement.</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["all", "All"],
          ["tlc", "Needs TLC"],
          ["recognized", "Recognized"],
        ] as [FilterKey, string][]).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {enriched.length} teammate{enriched.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            {enriched.length === 0
              ? "No team members yet — add them in Team Roster to start tracking recognition."
              : "No teammates match this filter."}
          </Card>
        )}
        {filtered.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            stars={m.stars}
            tlcs={m.tlcs}
            maxStars={maxStars}
            openForm={openForm?.memberId === m.id ? openForm.kind : null}
            onOpen={(kind) => setOpenForm({ memberId: m.id, kind })}
            onClose={() => setOpenForm(null)}
            onSaved={async () => { setOpenForm(null); await refresh(); }}
            engagementId={engagement.id}
          />
        ))}
      </div>
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

function MemberRow({
  member,
  stars,
  tlcs,
  maxStars,
  openForm,
  onOpen,
  onClose,
  onSaved,
  engagementId,
}: {
  member: Member;
  stars: number;
  tlcs: number;
  maxStars: number;
  openForm: FormKind | null;
  onOpen: (kind: FormKind) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
  engagementId: string;
}) {
  const avatarColor = colorFor(member.display_name);
  const barPct = Math.round((stars / maxStars) * 100);
  const indicator = healthColor(stars, tlcs);

  return (
    <Card className="relative overflow-hidden border-border bg-surface p-4 pr-6">
      <div className="absolute inset-y-0 right-0 w-[6px]" style={{ background: indicator }} />

      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: avatarColor }}
        >
          {initials(member.display_name)}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <div className="truncate text-sm font-bold">{member.display_name}</div>
            <div className="truncate text-xs text-muted-foreground">{member.title || member.role}</div>
          </div>

          {/* Relative recognition bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, background: HEALTH.green }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: HEALTH.green }}>
              <Star className="h-3.5 w-3.5 fill-current" />
              {stars}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: HEALTH.red }}>
              <Heart className="h-3.5 w-3.5 fill-current" />
              {tlcs}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
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
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          {openForm === "tlc" ? (
            <TlcForm
              member={member}
              engagementId={engagementId}
              onCancel={onClose}
              onSaved={onSaved}
            />
          ) : (
            <StarForm
              member={member}
              engagementId={engagementId}
              onCancel={onClose}
              onSaved={onSaved}
            />
          )}
        </div>
      )}
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
    const update =
      opts.kind === "tlc"
        ? { tlc_count: cur.tlc_count + 1, last_flag_note: opts.note, last_flag_type: opts.followUp }
        : { star_count: cur.star_count + 1, last_recognition_note: opts.note, last_recognition_type: opts.followUp };
    const { error } = await supabase.from("engagement_pulses").update(update).eq("id", cur.id);
    if (error) throw error;
  } else {
    const insert =
      opts.kind === "tlc"
        ? {
            engagement_id: opts.engagementId,
            member_id: opts.memberId,
            star_count: 0,
            tlc_count: 1,
            last_flag_note: opts.note,
            last_flag_type: opts.followUp,
          }
        : {
            engagement_id: opts.engagementId,
            member_id: opts.memberId,
            star_count: 1,
            tlc_count: 0,
            last_recognition_note: opts.note,
            last_recognition_type: opts.followUp,
          };
    const { error } = await supabase.from("engagement_pulses").insert(insert);
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

function DraftPanel({
  draft,
  loading,
}: {
  draft: string;
  loading: boolean;
}) {
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
  member: Member;
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
      await onSavedRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  // Refresh summary counts in parent without closing the form (so the user can read the draft)
  async function onSavedRefresh() {
    await onSaved();
    // onSaved closes the form by default — but we want the draft visible. Re-open by parent flow.
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
  member: Member;
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
