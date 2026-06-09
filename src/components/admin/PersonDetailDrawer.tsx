import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Phone, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getMemberDetail } from "@/lib/atlas-team-detail.functions";
import {
  addAdminNote,
  resetMemberPassword,
  sendAtlasInvite,
  setAtlasRole,
} from "@/lib/atlas-team-actions.functions";
import {
  getCompletenessBand,
  getCompletenessBreakdown,
} from "@/lib/atlas-profile-completeness";
import { useIsAdmin } from "@/hooks/useAccess";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
  { value: "unassigned", label: "Unassigned" },
];

const TD_STYLES: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  pending_onboarding: {
    label: "Pending",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
};

const ATLAS_STYLES: Record<string, { label: string; cls: string }> = {
  not_invited: { label: "Not Invited", cls: "bg-zinc-700/40 text-zinc-200 border-zinc-600/60" },
  invite_sent: { label: "Invite Sent", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  never_logged_in: { label: "Never Logged In", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
  onboarding_incomplete: {
    label: "Onboarding Incomplete",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
};

function initials(first?: string | null, last?: string | null, email?: string) {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase() || "?";
  return (email ?? "?").slice(0, 2).toUpperCase();
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function PersonDetailDrawer({
  memberId,
  open,
  onOpenChange,
  isAdminViewer,
}: {
  memberId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdminViewer?: boolean;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  // Fallback to live admin check when caller didn't pass an explicit flag.
  const showAdmin = isAdminViewer ?? isAdmin;
  const loadDetail = useServerFn(getMemberDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["atlas-member-detail", memberId],
    queryFn: () => loadDetail({ data: { memberId: memberId! } }),
    enabled: !!memberId && open,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["atlas-member-detail", memberId] });
    qc.invalidateQueries({ queryKey: ["atlas-team-members"] });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l-4 border-l-[color:var(--athena-gold,#d4af37)] bg-background p-0 sm:max-w-[480px]"
      >
        {isLoading || !data ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <DrawerBody data={data as any} isAdminViewer={showAdmin} onRefresh={refresh} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  data,
  isAdminViewer,
  onRefresh,
}: {
  data: any;
  isAdminViewer: boolean;
  onRefresh: () => void;
}) {
  const m = data.member;
  const td = TD_STYLES[m.talentdesk_status] ?? { label: "—", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600/60" };
  const atlas =
    ATLAS_STYLES[m.atlas_invite_status] ?? {
      label: m.atlas_invite_status,
      cls: "bg-zinc-700/40 text-zinc-200 border-zinc-600/60",
    };

  const sendInvite = useServerFn(sendAtlasInvite);
  const resetPwd = useServerFn(resetMemberPassword);
  const inviteMut = useMutation({
    mutationFn: (resend: boolean) => sendInvite({ data: { memberId: m.id, resend } }),
    onSuccess: () => {
      toast.success("Invite sent.");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send invite"),
  });
  const resetMut = useMutation({
    mutationFn: () => resetPwd({ data: { memberId: m.id } }),
    onSuccess: () => {
      toast.success("Password reset email sent.");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reset password"),
  });

  const [confirmReset, setConfirmReset] = useState(false);
  const fullName =
    [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email;
  const isActive = m.atlas_invite_status === "active";

  return (
    <>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start gap-3">
          {m.avatar_url ? (
            <img
              src={m.avatar_url}
              alt={fullName}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0b1d3a] text-base font-semibold text-[color:var(--athena-gold,#d4af37)]">
              {initials(m.first_name, m.last_name, m.email)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{fullName}</h2>
            {m.job_title && (
              <p className="truncate text-xs text-muted-foreground">{m.job_title}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <a
                href={`mailto:${m.email}`}
                className="inline-flex items-center gap-1 text-[color:var(--athena-gold,#d4af37)] hover:underline"
              >
                <Mail className="h-3 w-3" /> {m.email}
              </a>
              {m.phone && (
                <a
                  href={`tel:${m.phone}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3 w-3" /> {m.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">TalentDesk:</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider ${td.cls}`}
            >
              {td.label}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">ATLAS:</span>
            <span
              className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-semibold ${atlas.cls}`}
            >
              {atlas.label}
            </span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => inviteMut.mutate(false)}
            disabled={isActive || inviteMut.isPending}
            title={isActive ? "Already active on ATLAS." : undefined}
          >
            Send Invite
          </Button>
          <Button size="sm" variant="outline" disabled title="Use the Assign action from the row menu">
            Assign to Mission
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={!m.email || resetMut.isPending}
          >
            Reset Password
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="p-5">
        <TabsList className="w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          <DrawerTab value="overview">Overview</DrawerTab>
          <DrawerTab value="missions">Mission History</DrawerTab>
          <DrawerTab value="assignments">Assignments</DrawerTab>
          {isAdminViewer && <DrawerTab value="notes">Admin Notes</DrawerTab>}
          <DrawerTab value="activity">Activity Log</DrawerTab>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          <OverviewTab member={m} onRefresh={onRefresh} />
        </TabsContent>

        <TabsContent value="missions" className="mt-4">
          <MissionHistoryTab missions={data.missionHistory} />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <AssignmentsTab assignments={data.assignments} />
        </TabsContent>

        {isAdminViewer && (
          <TabsContent value="notes" className="mt-4">
            <NotesTab memberId={m.id} notes={m.admin_notes ?? []} onRefresh={onRefresh} />
          </TabsContent>
        )}

        <TabsContent value="activity" className="mt-4">
          <ActivityTab entries={data.activityLog} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>
              {fullName} will receive a password reset email at {m.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resetMut.mutate();
                setConfirmReset(false);
              }}
              disabled={resetMut.isPending}
            >
              Send Reset Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DrawerTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-[color:var(--athena-gold,#d4af37)] data-[state=active]:bg-transparent data-[state=active]:text-foreground"
    >
      {children}
    </TabsTrigger>
  );
}

function OverviewTab({ member, onRefresh }: { member: any; onRefresh: () => void }) {
  const pct = Math.max(0, Math.min(100, member.atlas_profile_completeness ?? 0));
  const band = getCompletenessBand(pct);
  const breakdown = getCompletenessBreakdown(member);

  const setRole = useServerFn(setAtlasRole);
  const roleMut = useMutation({
    mutationFn: (role: string) => setRole({ data: { memberId: member.id, role: role as any } }),
    onSuccess: () => {
      toast.success("Role updated.");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update role"),
  });

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          TalentDesk Information
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <Field label="Date joined" value={formatDate(member.talentdesk_date_joined)} />
          <Field label="Invited by" value={member.talentdesk_invited_by ?? "—"} />
          <Field label="TalentDesk ID" value={member.talentdesk_id ?? "—"} />
          <Field label="Address" value={member.address ?? "—"} />
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Skills
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(member.skills ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                (member.skills ?? []).map((s: string) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-full bg-[#0B1E3F] px-2 py-0.5 text-[10px] font-medium text-white"
                  >
                    {s}
                  </span>
                ))
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Languages
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(member.languages ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                (member.languages ?? []).map((l: string) => (
                  <span
                    key={l}
                    className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px]"
                  >
                    {l}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          ATLAS Information
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              ATLAS Role
            </dt>
            <dd className="mt-1">
              <Select
                value={member.atlas_role}
                onValueChange={(v) => roleMut.mutate(v)}
                disabled={roleMut.isPending}
              >
                <SelectTrigger className="h-8 w-56 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
          </div>
          <Field label="Invite sent" value={formatDateTime(member.atlas_invite_sent_at)} />
          <Field label="First login" value={formatDateTime(member.atlas_first_login_at)} />
          <Field label="Last active" value={formatDateTime(member.atlas_last_active_at)} />
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profile completeness
            </dt>
            <dd className="mt-2 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">
                  Profile Score: {pct} / 100
                </span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {band.label}
                </span>
              </div>
              <Progress value={pct} className={`h-1.5 ${band.barClass}`} />
              <ul className="space-y-1 text-[12px]">
                {breakdown.map((it) => (
                  <li
                    key={it.key}
                    className={`flex items-center justify-between gap-2 ${
                      it.ok ? "text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden>{it.ok ? "✓" : "✗"}</span>
                      <span className={it.ok ? "" : "text-foreground/80"}>
                        {it.label}
                      </span>
                      {it.futureOnboarding && !it.ok && (
                        <span className="text-[10px] text-muted-foreground/80">
                          (available after onboarding)
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      {it.points} pts
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

function MissionHistoryTab({ missions }: { missions: any[] }) {
  if (!missions || missions.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-surface/30 p-4 text-center text-xs text-muted-foreground">
        This person has not been assigned to any missions yet.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface/70 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Mission</th>
            <th className="px-2 py-2 text-left font-medium">Role</th>
            <th className="px-2 py-2 text-left font-medium">Status</th>
            <th className="px-2 py-2 text-right font-medium">Q Assigned</th>
            <th className="px-2 py-2 text-right font-medium">Q Done</th>
            <th className="px-2 py-2 text-left font-medium">Assigned</th>
          </tr>
        </thead>
        <tbody>
          {missions.map((m, i) => (
            <tr key={`${m.mission_id}-${i}`} className="border-t border-border/60">
              <td className="px-2 py-2">{m.mission_name}</td>
              <td className="px-2 py-2">{m.role ?? "—"}</td>
              <td className="px-2 py-2 capitalize">{m.status ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{m.questions_assigned}</td>
              <td className="px-2 py-2 text-right tabular-nums">{m.questions_completed}</td>
              <td className="px-2 py-2">{formatDate(m.assigned_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentsTab({ assignments }: { assignments: any[] }) {
  if (!assignments || assignments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-surface/30 p-4 text-center text-xs text-muted-foreground">
        No active assignments.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface/70 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Mission</th>
            <th className="px-2 py-2 text-left font-medium">Section</th>
            <th className="px-2 py-2 text-left font-medium">Question</th>
            <th className="px-2 py-2 text-left font-medium">Due</th>
            <th className="px-2 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="px-2 py-2">{a.mission_name}</td>
              <td className="px-2 py-2">{a.section ?? "—"}</td>
              <td className="px-2 py-2">{a.question ?? "—"}</td>
              <td className="px-2 py-2">{formatDate(a.due_date)}</td>
              <td className="px-2 py-2 capitalize">{a.status.replace(/_/g, " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type NoteEntry = {
  id?: string;
  author?: string;
  author_id?: string;
  timestamp?: string;
  body?: string;
};

function NotesTab({
  memberId,
  notes,
  onRefresh,
}: {
  memberId: string;
  notes: NoteEntry[];
  onRefresh: () => void;
}) {
  const [body, setBody] = useState("");
  const addNote = useServerFn(addAdminNote);
  const mut = useMutation({
    mutationFn: () => addNote({ data: { memberId, body: body.trim() } }),
    onSuccess: () => {
      toast.success("Note saved.");
      setBody("");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save note"),
  });

  const sorted = [...(notes ?? [])].sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );

  const canSave = body.trim().length >= 10 && !mut.isPending;

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface/30 p-4 text-center text-xs text-muted-foreground">
          No admin notes yet.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--athena-gold,#d4af37)]/40">
          {sorted.map((n, i) => (
            <NoteCard key={n.id ?? `${n.timestamp}-${i}`} note={n} />
          ))}
        </ul>
      )}
      <div className="space-y-2 rounded-md border border-border bg-surface/40 p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a private admin note about this person. Notes are visible to admins only and cannot be edited after saving."
          className="min-h-[100px] resize-y text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {body.trim().length < 10
              ? `${Math.max(0, 10 - body.trim().length)} more character${
                  10 - body.trim().length === 1 ? "" : "s"
                } required`
              : `${body.trim().length} characters`}
          </span>
          <Button size="sm" onClick={() => mut.mutate()} disabled={!canSave}>
            {mut.isPending ? "Saving…" : "Save Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: NoteEntry }) {
  const [expanded, setExpanded] = useState(false);
  const body = note.body ?? "";
  const TRUNC = 300;
  const isLong = body.length > TRUNC;
  const shown = !isLong || expanded ? body : body.slice(0, TRUNC).trimEnd() + "…";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-[#0b1d3a] dark:text-[color:var(--athena-gold,#d4af37)]">
          {note.author ?? "Admin"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatDateTime(note.timestamp ?? null)}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-medium text-[color:var(--athena-gold,#d4af37)] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </li>
  );
}

function formatActivityTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const days = diff / 86400000;
  if (days >= 7) {
    const d = new Date(t);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(days);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function formatMetadata(action: string, metadata: any): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  if (metadata.from !== undefined && metadata.to !== undefined) {
    const from = metadata.from ?? "—";
    const to = metadata.to ?? "—";
    return `${from} → ${to}`;
  }
  if (metadata.mission_name) {
    return metadata.role
      ? `${metadata.mission_name} · ${metadata.role}`
      : String(metadata.mission_name);
  }
  if (metadata.email && /invite|password/i.test(action)) {
    return String(metadata.email);
  }
  if (metadata.triggered_by && /password/i.test(action)) {
    return `by ${metadata.triggered_by}`;
  }
  if (metadata.removed_by) {
    return `by ${metadata.removed_by}`;
  }
  return null;
}

function ActivityTab({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-surface/30 p-4 text-center text-xs text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }
  const sorted = [...entries].sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );
  return (
    <ul className="space-y-3">
      {sorted.map((e) => {
        const meta = formatMetadata(e.action, e.metadata);
        return (
          <li key={e.id} className="border-b border-border/60 pb-3 last:border-b-0">
            <div className="text-sm font-medium">
              {e.action}
              {meta && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · {meta}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {e.performed_by ?? "System"} · {formatActivityTime(e.timestamp)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
