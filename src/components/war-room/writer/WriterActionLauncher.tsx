import { useEffect, useMemo, useState } from "react";
import { MessageCircle, MessagesSquare, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { useComms } from "@/hooks/use-comms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSchemaForm } from "../useSchemaForm";
import { threadSchema, quickChatSchema } from "../action-schemas";

type TileKey = "thread" | "chat";

type Tile = {
  key: TileKey;
  label: string;
  desc: string;
  icon: typeof MessageCircle;
  color: string;
};

const TILES: Tile[] = [
  { key: "thread", label: "Section Thread", desc: "Post a question or note on your section",       icon: MessageCircle,   color: "#185FA5" },
  { key: "chat",   label: "Quick Chat",     desc: "Start a conversation with a teammate",          icon: MessagesSquare,  color: "#0F6E56" },
];

export function WriterActionLauncher() {
  const [open, setOpen] = useState<TileKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const { unreadChats, openChatWith } = useComms();
  const [sections, setSections] = useState<{ id: string; section_name: string }[]>([]);
  const [teammates, setTeammates] = useState<{ id: string; display_name: string }[]>([]);
  const { isOnline } = useComms();

  // Load writer's assigned sections + teammates
  useEffect(() => {
    if (!engagement || !user) return;
    (async () => {
      const { data: assigns } = await supabase
        .from("section_assignments")
        .select("section_id, heatmap_sections!inner(id, section_name)")
        .eq("engagement_id", engagement.id)
        .eq("user_id", user.id);
      const secs = ((assigns as any[]) ?? [])
        .map((r) => r.heatmap_sections)
        .filter(Boolean)
        .reduce<{ id: string; section_name: string }[]>((acc, s) => {
          if (!acc.find((x) => x.id === s.id)) acc.push(s);
          return acc;
        }, []);
      setSections(secs);

      const { data: mems } = await supabase
        .from("engagement_members")
        .select("id, display_name, user_id")
        .eq("engagement_id", engagement.id);
      setTeammates(
        ((mems as any[]) ?? [])
          .filter((m) => m.user_id !== user.id)
          .map((m) => ({ id: m.id, display_name: m.display_name })),
      );
    })();
  }, [engagement?.id, user?.id]);

  const hasSections = sections.length > 0;

  function selectTile(key: TileKey) {
    if (key === "thread" && !hasSections) return;
    setOpen((prev) => (prev === key ? null : key));
  }

  const activeTile = useMemo(() => TILES.find((t) => t.key === open) ?? null, [open]);

  return (
    <>
      {/* Desktop launcher column */}
      <aside
        className="hidden md:flex w-[200px] shrink-0 flex-col gap-2 border-r border-border bg-[#1a2333] px-2 py-3"
        aria-label="Action launcher"
      >
        <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">
          Quick Actions
        </div>
        {TILES.map((t) => (
          <LauncherTile
            key={t.key}
            tile={t}
            active={open === t.key}
            disabled={t.key === "thread" && !hasSections}
            badge={t.key === "chat" && unreadChats > 0 ? unreadChats : undefined}
            onClick={() => selectTile(t.key)}
          />
        ))}
      </aside>

      {/* Inline form panel (desktop) */}
      {activeTile && (
        <section
          className="hidden md:flex w-[360px] shrink-0 flex-col border-r border-border bg-[#101826]"
          aria-label={activeTile.label}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-border"
            style={{ borderLeft: `3px solid ${activeTile.color}` }}
          >
            <div>
              <div className="text-sm font-bold">{activeTile.label}</div>
              <div className="text-[11px] text-muted-foreground">{activeTile.desc}</div>
            </div>
            <button
              onClick={() => setOpen(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-5">
            <ActiveForm
              tile={activeTile}
              sections={sections}
              teammates={teammates}
              isOnline={isOnline}
              onChat={(id, name, msg) => {
                openChatWith(id, name);
                // Slight delay so panel mounts; pre-fill via custom event
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("quick-chat-prefill", { detail: { memberId: id, message: msg } }),
                  );
                }, 50);
                setOpen(null);
              }}
              onSubmitted={() => setOpen(null)}
              engagementId={engagement?.id ?? ""}
              userId={user?.id ?? ""}
              memberId={member?.id ?? ""}
              memberName={member?.display_name ?? ""}
            />
          </div>
        </section>
      )}

      {/* Mobile floating button + sheet */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-20 left-4 z-40 h-12 w-12 rounded-full bg-[var(--gold)] text-background shadow-xl flex items-center justify-center"
        aria-label="Open quick actions"
      >
        <MessagesSquare className="h-5 w-5" />
        {unreadChats > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[color:var(--red)] text-[9px] font-bold text-white flex items-center justify-center">
            {unreadChats}
          </span>
        )}
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#0f1623]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-bold">Quick Actions</div>
            <button onClick={() => { setMobileOpen(false); setOpen(null); }} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {TILES.map((t) => (
              <LauncherTile
                key={t.key}
                tile={t}
                active={open === t.key}
                disabled={t.key === "thread" && !hasSections}
                badge={t.key === "chat" && unreadChats > 0 ? unreadChats : undefined}
                onClick={() => selectTile(t.key)}
              />
            ))}
          </div>
          {activeTile && (
            <div className="flex-1 overflow-auto border-t border-border bg-[#101826] p-4">
              <ActiveForm
                tile={activeTile}
                sections={sections}
                teammates={teammates}
                isOnline={isOnline}
                onChat={(id, name, msg) => {
                  openChatWith(id, name);
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("quick-chat-prefill", { detail: { memberId: id, message: msg } }),
                    );
                  }, 50);
                  setMobileOpen(false);
                  setOpen(null);
                }}
                onSubmitted={() => { setMobileOpen(false); setOpen(null); }}
                engagementId={engagement?.id ?? ""}
                userId={user?.id ?? ""}
                memberId={member?.id ?? ""}
                memberName={member?.display_name ?? ""}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LauncherTile({
  tile, active, disabled, badge, onClick,
}: {
  tile: Tile;
  active: boolean;
  disabled?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const Icon = tile.icon;
  const btn = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
      className={cn(
        "relative w-full rounded-md px-3 py-2.5 text-left transition border border-transparent",
        "hover:bg-white/[0.04]",
        active && "bg-white/[0.06]",
        disabled && "opacity-60 cursor-not-allowed hover:bg-transparent",
      )}
      style={active ? { borderLeftWidth: 3, borderLeftColor: tile.color, paddingLeft: 9 } : undefined}
    >
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: tile.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-tight">{tile.label}</div>
          <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{tile.desc}</div>
          {disabled && (
            <div className="mt-1 text-[10px] italic text-muted-foreground/80">
              You have no assigned sections yet
            </div>
          )}
        </div>
        {badge !== undefined && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--red)] px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
    </button>
  );
  if (!disabled) return btn;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">Assigned sections required to post a thread</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActiveForm(props: {
  tile: Tile;
  sections: { id: string; section_name: string }[];
  teammates: { id: string; display_name: string }[];
  isOnline: (id: string) => boolean;
  engagementId: string;
  userId: string;
  memberId: string;
  memberName: string;
  onChat: (memberId: string, name: string, message: string) => void;
  onSubmitted: () => void;
}) {
  if (props.tile.key === "thread") return <ThreadForm {...props} />;
  return <ChatForm {...props} />;
}

function Success({ msg }: { msg: string }) {
  return <div className="mt-3 text-xs text-emerald-400">{msg}</div>;
}

function RiskForm({ engagementId, userId, memberName, onSubmitted }: any) {
  const [desc, setDesc] = useState("");
  const [section, setSection] = useState("");
  const [urgency, setUrgency] = useState<"Low" | "Medium" | "High">("Medium");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!desc.trim()) return toast.error("Describe the risk.");
    setBusy(true);
    const title = section.trim() ? `${section.trim()} — ${desc.slice(0, 60)}` : desc.slice(0, 80);
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagementId,
      created_by: userId,
      title,
      description: desc.trim(),
      owner_name: memberName,
      severity: urgency,
      likelihood: "Medium",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
    setDesc(""); setSection(""); setUrgency("Medium");
    setTimeout(() => { setDone(false); onSubmitted(); }, 1800);
  }

  return (
    <div className="space-y-4">
      <Field label="What's the risk?">
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe what could go wrong…" rows={4} />
      </Field>
      <Field label="Section affected">
        <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. LTSS, Behavioral Health" />
      </Field>
      <Field label="Urgency">
        <Select value={urgency} onValueChange={(v: any) => setUrgency(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Button onClick={submit} disabled={busy} className="w-full">Log risk</Button>
      {done && <Success msg="Risk logged — your lead has been notified" />}
    </div>
  );
}

function SosForm({ engagementId, userId, memberName, onSubmitted }: any) {
  const [desc, setDesc] = useState("");
  const [who, setWho] = useState("");
  const [resolveBy, setResolveBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!desc.trim()) return toast.error("Describe the blocker.");
    setBusy(true);
    const { error } = await supabase.from("sos_alerts").insert({
      engagement_id: engagementId,
      submitted_by: userId,
      submitter_name: memberName,
      category: "Blocker",
      severity: "High",
      description: desc.trim(),
      owner_name: who.trim() || null,
      recommended_action: resolveBy.trim() ? `Resolve by ${resolveBy.trim()}` : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
    setDesc(""); setWho(""); setResolveBy("");
    setTimeout(() => { setDone(false); onSubmitted(); }, 1800);
  }

  return (
    <div className="space-y-4">
      <Field label="What's the blocker?">
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the issue clearly…" rows={4} />
      </Field>
      <Field label="Who needs to know?">
        <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name or role" />
      </Field>
      <Field label="Resolve by">
        <Input value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} placeholder="Date or time" />
      </Field>
      <Button onClick={submit} disabled={busy} className="w-full">Send SOS</Button>
      {done && <Success msg="SOS sent — your lead has been alerted" />}
    </div>
  );
}

function ThreadForm({ engagementId, memberId, memberName, sections, onSubmitted }: any) {
  const [sectionId, setSectionId] = useState<string>(sections[0]?.id ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!sectionId) return toast.error("Pick a section.");
    if (!msg.trim()) return toast.error("Write a message.");
    setBusy(true);
    const { error } = await supabase.from("section_threads").insert({
      engagement_id: engagementId,
      section_id: sectionId,
      member_id: memberId,
      author_name: memberName,
      message: msg.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
    setMsg("");
    setTimeout(() => { setDone(false); onSubmitted(); }, 1800);
  }

  return (
    <div className="space-y-4">
      <Field label="Select your section">
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger><SelectValue placeholder="Choose section" /></SelectTrigger>
          <SelectContent>
            {sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Message">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask a question or leave a note…" rows={4} />
      </Field>
      <Button onClick={submit} disabled={busy} className="w-full">Post to thread</Button>
      {done && <Success msg="Posted — your lead will be notified" />}
    </div>
  );
}

function ChatForm({ teammates, isOnline, onChat }: any) {
  const [peerId, setPeerId] = useState<string>("");
  const [msg, setMsg] = useState("");

  function start() {
    if (!peerId) return toast.error("Pick a teammate.");
    if (!msg.trim()) return toast.error("Write a message.");
    const t = teammates.find((x: any) => x.id === peerId);
    onChat(peerId, t?.display_name ?? "Teammate", msg.trim());
    setMsg(""); setPeerId("");
  }

  return (
    <div className="space-y-4">
      <Field label="Select teammate">
        <Select value={peerId} onValueChange={setPeerId}>
          <SelectTrigger><SelectValue placeholder="Choose teammate" /></SelectTrigger>
          <SelectContent>
            {teammates.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: isOnline(t.id) ? "#22c55e" : "#475569" }}
                  />
                  {t.display_name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Message">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Hey, quick question…" rows={4} />
      </Field>
      <Button onClick={start} className="w-full">Start chat</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
