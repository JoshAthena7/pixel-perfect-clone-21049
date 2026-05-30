import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useEngagement, type Membership } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Archive, Plus, Siren, Users, FileText, Clock } from "lucide-react";
import { daysUntil } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/select-engagement")({
  head: () => ({ meta: [{ title: "Command Lobby — Athena" }] }),
  component: SelectEngagementPage,
});

// ───────────── design tokens (scoped) ─────────────
const LOBBY_BG = "#0d0d14";
const CARD_BG = "#16161f";
const CARD_BG_HOVER = "#1c1c27";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_STRONG = "rgba(255,255,255,0.12)";
const GOLD = "#C49A2A";
const TEAL = "#5fb8a8";
const PURPLE = "#9b8cc7";
const RED = "#e85d5d";

const HEAT_COLOR: Record<string, string> = {
  Green: "#5fb8a8",
  Yellow: "#e8c46b",
  Orange: "#e89556",
  Red: "#e85d5d",
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  viewer: "Viewer",
};

type Stats = {
  sections: number;
  members: number;
  openSos: number;
  heat: { Green: number; Yellow: number; Orange: number; Red: number };
  mySections?: number;
};

type Horizon = { id: string; name: string; category: string; created_at: string };

const LEADERSHIP_ROLES = new Set(["founder", "pm", "engagement_lead"]);
function routeForRole(role: string): string {
  return LEADERSHIP_ROLES.has(role) ? "/command" : "/writer/my-sections";
}

function SelectEngagementPage() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const { user } = useSession();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [statsById, setStatsById] = useState<Record<string, Stats>>({});
  const [horizon, setHorizon] = useState<Horizon[]>([]);
  const creating = false;

  const active = useMemo(
    () => memberships.filter((m) => m.engagement.status !== "Archived"),
    [memberships],
  );
  const archived = useMemo(
    () => memberships.filter((m) => m.engagement.status === "Archived"),
    [memberships],
  );

  // Single-engagement auto-route — only when arriving from root (?auto=1).
  // Otherwise the lobby always renders so users can manage / add rooms.
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const auto = new URLSearchParams(window.location.search).get("auto");
    if (auto === "1" && active.length === 1) {
      const m = active[0];
      switchEngagement(m.engagement.id);
      navigate({ to: routeForRole(m.role), replace: true });
    }
  }, [loading, active, navigate, switchEngagement]);

  // Per-engagement stat hydration
  useEffect(() => {
    if (loading || active.length === 0) return;
    const ids = active.map((m) => m.engagement.id);
    (async () => {
      const [heatRes, memRes, sosRes, secRes, asnRes] = await Promise.all([
        supabase.from("heatmap_sections").select("engagement_id,status").in("engagement_id", ids),
        supabase.from("engagement_members").select("engagement_id").in("engagement_id", ids),
        supabase.from("sos_alerts").select("engagement_id,status").in("engagement_id", ids).neq("status", "Resolved"),
        supabase.from("heatmap_sections").select("engagement_id").in("engagement_id", ids),
        user
          ? supabase.from("section_assignments").select("engagement_id,user_id").in("engagement_id", ids).eq("user_id", user.id)
          : Promise.resolve({ data: [] as { engagement_id: string; user_id: string }[] }),
      ]);

      const map: Record<string, Stats> = {};
      for (const id of ids) {
        map[id] = { sections: 0, members: 0, openSos: 0, heat: { Green: 0, Yellow: 0, Orange: 0, Red: 0 } };
      }
      for (const r of (heatRes.data as { engagement_id: string; status: string }[] | null) ?? []) {
        const bucket = map[r.engagement_id]; if (!bucket) continue;
        const k = r.status as keyof Stats["heat"];
        if (k in bucket.heat) bucket.heat[k]++;
      }
      for (const r of (memRes.data as { engagement_id: string }[] | null) ?? []) {
        const b = map[r.engagement_id]; if (b) b.members++;
      }
      for (const r of (sosRes.data as { engagement_id: string }[] | null) ?? []) {
        const b = map[r.engagement_id]; if (b) b.openSos++;
      }
      for (const r of (secRes.data as { engagement_id: string }[] | null) ?? []) {
        const b = map[r.engagement_id]; if (b) b.sections++;
      }
      for (const r of (asnRes.data as { engagement_id: string }[] | null) ?? []) {
        const b = map[r.engagement_id]; if (b) b.mySections = (b.mySections ?? 0) + 1;
      }
      setStatsById(map);

      // Horizon: cross-engagement RFP / State Intelligence intel docs
      const { data: h } = await supabase
        .from("intel_documents")
        .select("id,name,category,created_at")
        .in("engagement_id", ids)
        .in("category", ["RFP", "State Intelligence"])
        .order("created_at", { ascending: false })
        .limit(8);
      setHorizon((h as Horizon[]) ?? []);
    })();
  }, [loading, active, user?.id]);

  function pick(m: Membership) {
    switchEngagement(m.engagement.id);
    navigate({ to: routeForRole(m.role), replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function createNewEngagement() {
    navigate({ to: "/engagement/new" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.3em] text-zinc-500" style={{ background: LOBBY_BG }}>
        Authenticating…
      </div>
    );
  }

  const list = showArchived ? archived : active;
  const writerArchivedOnly = active.length === 0 && archived.length > 0 && archived.every((m) => m.role === "writer");

  return (
    <div className="min-h-screen text-zinc-200" style={{ background: LOBBY_BG }}>
      {/* TOP BAR */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md text-lg font-black"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #8a7445)`, color: "#0d0d14" }}
          >
            A
          </div>
          <div className="leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Athena</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.3em] text-zinc-500">Command Center</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ borderColor: BORDER_STRONG, color: GOLD, background: "rgba(201,179,112,0.06)" }}
          >
            {active.length} active room{active.length === 1 ? "" : "s"}
          </span>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: CARD_BG, border: `1px solid ${BORDER_STRONG}`, color: GOLD }}
            title={user?.email ?? ""}
          >
            {(user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-500 transition hover:text-zinc-200"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </header>

      {/* HORIZON BAR */}
      <section className="px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            Opportunities on the Horizon
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">{horizon.length} signal{horizon.length === 1 ? "" : "s"}</div>
        </div>
        {horizon.length === 0 ? (
          <div className="text-[11px] italic text-zinc-600">
            No RFPs or state intelligence on file. Upload to Intel under any room to seed the procurement database.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {horizon.map((h) => {
              const ageDays = Math.floor((Date.now() - new Date(h.created_at).getTime()) / 86_400_000);
              const dot = ageDays > 30 ? RED : ageDays > 14 ? "#e8c46b" : TEAL;
              return (
                <div
                  key={h.id}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]"
                  style={{ background: CARD_BG, border: `1px solid ${BORDER_STRONG}` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
                  <span className="font-medium text-zinc-200">{h.name}</span>
                  <span className="text-zinc-500">· {h.category}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* WAR ROOMS */}
      <section className="px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Active War Rooms</div>
          {archived.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-200"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <Archive className="h-3 w-3" />
              {showArchived ? `Active (${active.length})` : `Archived (${archived.length})`}
            </button>
          )}
        </div>

        {writerArchivedOnly ? (
          <EmptyState
            title="Your war room has been archived"
            body="Contact your engagement lead for next steps."
          />
        ) : list.length === 0 && active.length === 0 && archived.length === 0 ? (
          <EmptyState
            title="No war rooms yet"
            body="Create your first engagement to open a room, or ask a founder to invite you."
          >
            <button
              onClick={createNewEngagement}
              disabled={creating}
              className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ background: GOLD, color: "#0d0d14" }}
            >
              <Plus className="h-3.5 w-3.5" /> Open New Room
            </button>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m, idx) => (
              <DoorCard key={m.engagement.id} m={m} index={idx + 1} stats={statsById[m.engagement.id]} onEnter={() => pick(m)} />
            ))}
            {!showArchived && (
              <button
                onClick={createNewEngagement}
                disabled={creating}
                className="group flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg text-zinc-500 transition hover:text-zinc-200"
                style={{ background: "transparent", border: `1px dashed ${BORDER_STRONG}` }}
              >
                <Plus className="h-6 w-6" />
                <div className="text-[10px] font-bold uppercase tracking-[0.3em]">
                  {creating ? "Opening…" : "New War Room"}
                </div>
              </button>
            )}
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer
        className="mt-6 flex items-center justify-between px-6 py-4 text-[10px] uppercase tracking-[0.3em] text-zinc-600"
        style={{ borderTop: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-5">
          <FooterLink to="/select-engagement" label="RFP Database" disabled />
          <FooterLink to="/select-engagement" label="Pipeline" disabled />
          <FooterLink to="/settings" label="Settings" />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
          Restricted Access · Clearance Verified
        </div>
      </footer>
    </div>
  );
}

// ─────────── components ───────────

function DoorCard({
  m,
  index,
  stats,
  onEnter,
}: {
  m: Membership;
  index: number;
  stats: Stats | undefined;
  onEnter: () => void;
}) {
  const dleft = daysUntil(m.engagement.submission_date);
  const overdue = dleft !== null && dleft < 0 && m.engagement.status !== "Complete" && m.engagement.status !== "Archived";
  const hasSos = (stats?.openSos ?? 0) > 0;
  const isWriter = m.role === "writer";

  const accent = hasSos ? GOLD : isWriter ? PURPLE : TEAL;
  const heat = stats?.heat ?? { Green: 0, Yellow: 0, Orange: 0, Red: 0 };
  const totalHeat = heat.Green + heat.Yellow + heat.Orange + heat.Red;

  // 5-segment bar driven by status distribution
  const segments = buildSegments(heat);

  return (
    <button
      onClick={onEnter}
      className="group relative flex min-h-[260px] flex-col rounded-lg p-5 text-left transition"
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER_STRONG}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = CARD_BG_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.background = CARD_BG)}
    >
      {/* top accent */}
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-lg" style={{ background: accent }} />

      {/* header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="text-[10px] font-mono tracking-[0.3em] text-zinc-600">
          ROOM {String(index).padStart(3, "0")}
        </div>
        <span
          className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{
            borderColor: `color-mix(in oklab, ${accent} 50%, transparent)`,
            color: accent,
            background: `color-mix(in oklab, ${accent} 10%, transparent)`,
          }}
        >
          {ROLE_LABEL[m.role] ?? m.role}
        </span>
      </div>

      {/* name */}
      <div className="mb-1 truncate text-base font-bold text-zinc-100">{m.engagement.name}</div>
      <div className="mb-4 truncate text-xs text-zinc-500">{m.engagement.client}</div>

      {/* stat blocks */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat
          icon={<FileText className="h-3 w-3" />}
          label={isWriter ? "My sections" : "Sections"}
          value={isWriter ? stats?.mySections ?? 0 : stats?.sections ?? 0}
        />
        <Stat icon={<Users className="h-3 w-3" />} label="Members" value={stats?.members ?? 0} />
        <Stat
          icon={<Clock className="h-3 w-3" />}
          label={overdue ? "Overdue" : "To submit"}
          value={dleft === null ? "—" : overdue ? `${Math.abs(dleft)}d` : `${dleft}d`}
          tone={overdue ? RED : dleft !== null && dleft <= 7 ? GOLD : undefined}
        />
      </div>

      {/* 5-segment health bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-zinc-600">
          <span>Health</span>
          <span>{totalHeat > 0 ? `${totalHeat} section${totalHeat === 1 ? "" : "s"}` : "no data"}</span>
        </div>
        <div className="flex gap-1">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-sm"
              style={{ background: seg ?? "rgba(255,255,255,0.06)" }}
            />
          ))}
        </div>
      </div>

      {/* enter hint */}
      <div className="mt-auto flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition group-hover:text-zinc-200">
          Enter Room →
        </div>
        {hasSos && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: RED }}>
            <Siren className="h-3 w-3" />
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: RED }} />
            {stats!.openSos} SOS
          </span>
        )}
      </div>
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-md px-2 py-2" style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}` }}>
      <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold" style={{ color: tone ?? "#e4e4e7" }}>{value}</div>
    </div>
  );
}

function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg p-10 text-center" style={{ background: CARD_BG, border: `1px solid ${BORDER_STRONG}` }}>
      <h2 className="text-base font-bold text-zinc-100">{title}</h2>
      <p className="mt-2 text-xs text-zinc-500">{body}</p>
      {children}
    </div>
  );
}

function FooterLink({ to, label, disabled }: { to: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="opacity-40" title="Coming soon">
        {label}
      </span>
    );
  }
  return (
    <Link to={to} className="transition hover:text-zinc-200">
      {label}
    </Link>
  );
}

// Build a 5-cell bar where each segment is colored by the dominant
// status of that proportional slot.
function buildSegments(heat: Stats["heat"]): (string | null)[] {
  const order: Array<keyof Stats["heat"]> = ["Green", "Yellow", "Orange", "Red"];
  const total = order.reduce((a, k) => a + heat[k], 0);
  if (total === 0) return Array(5).fill(null);
  const out: (string | null)[] = [];
  let remaining = 5;
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    const count = heat[k];
    if (count === 0) continue;
    const isLast = i === order.length - 1 || order.slice(i + 1).every((kk) => heat[kk] === 0);
    const segs = isLast ? remaining : Math.max(1, Math.round((count / total) * 5));
    const take = Math.min(remaining, segs);
    for (let j = 0; j < take; j++) out.push(HEAT_COLOR[k]);
    remaining -= take;
    if (remaining <= 0) break;
  }
  while (out.length < 5) out.push(null);
  return out;
}
