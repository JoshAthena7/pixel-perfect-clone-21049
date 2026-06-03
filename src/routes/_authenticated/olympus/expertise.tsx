import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users as UsersIcon, Sparkles } from "lucide-react";
import { ExpertiseProfileEditor } from "@/components/v2/ExpertiseProfileEditor";

export const Route = createFileRoute("/_authenticated/olympus/expertise")({
  component: ExpertisePage,
});

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: string | null;
  expertise_areas: string[];
  states_experience: string[];
  programs_experience: string[];
  availability_status: "available" | "pens_down" | "unavailable" | "pto";
  availability_until: string | null;
  profile_completed: boolean;
};

function ExpertisePage() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["olympus-expertise-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id,display_name,email,avatar_color,expertise_areas,states_experience,programs_experience,availability_status,availability_until,profile_completed",
        )
        .order("profile_completed", { ascending: true })
        .order("display_name", { ascending: true });
      return (data ?? []) as Profile[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        p.expertise_areas.some((e) => e.toLowerCase().includes(q)) ||
        p.states_experience.some((s) => s.toLowerCase().includes(q)),
    );
  }, [profiles, search]);

  const completed = profiles.filter((p) => p.profile_completed).length;
  const total = profiles.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Users</div>
          <h1 className="h1-display mt-1">Expertise Profiles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            IRIS uses these profiles to recommend the right person via Phone a Friend.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, expertise, state…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </header>

      {/* Toggle */}
      <div className="mb-4 inline-flex items-center gap-0.5 rounded-lg border bg-white/[0.04] p-[3px]" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <Link
          to="/olympus/users"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-4 text-[12px] font-semibold tracking-wide text-muted-foreground hover:text-foreground"
        >
          <UsersIcon className="h-3 w-3" /> Users
        </Link>
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-4 text-[12px] font-semibold tracking-wide text-foreground"
          style={{ borderColor: "var(--border-default, rgba(255,255,255,0.08))" }}
        >
          <Sparkles className="h-3 w-3" /> Expertise
        </span>
      </div>

      {/* Completion bar */}
      <div className="mb-5 rounded-md border border-border bg-surface/60 px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-foreground">{completed} of {total} profiles complete</span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-40 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          No profiles match.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((p) => (
            <ProfileCard key={p.id} p={p} onEdit={() => setEditingId(p.id)} />
          ))}
        </div>
      )}

      {editingId && (
        <ExpertiseProfileEditor profileId={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

function ProfileCard({ p, onEdit }: { p: Profile; onEdit: () => void }) {
  const initials = (p.display_name ?? p.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-[12px] border bg-surface p-4"
      style={{ borderColor: p.profile_completed ? "var(--border)" : "rgba(245,158,11,0.4)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: p.avatar_color ?? "#3b7fff" }}
          >
            {initials}
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">{p.display_name ?? "Unnamed"}</div>
            <div className="text-[11px] text-muted-foreground">{p.email}</div>
          </div>
        </div>
        <AvailabilityBadge status={p.availability_status} until={p.availability_until} />
      </div>

      {!p.profile_completed && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          ⚠ Profile incomplete
        </div>
      )}

      <Row label="Expertise" items={p.expertise_areas} accent />
      <Row label="States" items={p.states_experience} />
      <Row label="Programs" items={p.programs_experience} />

      <button
        onClick={onEdit}
        className="mt-4 w-full rounded-md border border-border bg-surface/60 py-1.5 text-[12px] font-medium hover:bg-surface-hover"
      >
        Edit Profile →
      </button>
    </div>
  );
}

function Row({ label, items, accent }: { label: string; items: string[]; accent?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.slice(0, 6).map((i) => (
          <span
            key={i}
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={
              accent
                ? { background: "rgba(59,127,255,0.12)", color: "var(--accent,#3b7fff)" }
                : { background: "rgba(255,255,255,0.06)", color: "var(--foreground)" }
            }
          >
            {i}
          </span>
        ))}
        {items.length > 6 && (
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
            +{items.length - 6}
          </span>
        )}
      </div>
    </div>
  );
}

function AvailabilityBadge({ status, until }: { status: Profile["availability_status"]; until: string | null }) {
  const cfg = {
    available: { dot: "bg-emerald-500", color: "text-emerald-400", label: "Available" },
    pens_down: { dot: "bg-amber-500", color: "text-amber-400", label: "Pens Down" },
    pto: { dot: "bg-muted-foreground", color: "text-muted-foreground", label: "PTO" },
    unavailable: { dot: "bg-muted-foreground", color: "text-muted-foreground", label: "Unavailable" },
  }[status];
  const untilStr =
    until && (status === "pens_down" || status === "pto")
      ? ` · until ${new Date(until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${cfg.color}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {cfg.label}{untilStr}
    </span>
  );
}
