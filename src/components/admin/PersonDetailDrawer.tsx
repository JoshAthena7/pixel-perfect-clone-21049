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
  isAdminViewer = true,
}: {
  memberId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdminViewer?: boolean;
}) {
  const qc = useQueryClient();
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
          <DrawerBody data={data as any} isAdminViewer={isAdminViewer} onRefresh={refresh} />
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
  const completeness = [
    { label: "Name", ok: !!(member.first_name && member.last_name) },
    { label: "Email", ok: !!member.email },
    { label: "Phone", ok: !!member.phone },
    { label: "Job title", ok: !!member.job_title },
    { label: "Resume", ok: !!member.atlas_resume_url },
    { label: "HIPAA Acknowledgment", ok: !!member.atlas_hipaa_acknowledged },
  ];
  const pct = member.atlas_profile_completeness ?? 0;

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
                    className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px]"
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
            <dd className="mt-1 space-y-2">
              <div className="flex items-center gap-2">
                <Progress
                  value={pct}
                  className={`h-1.5 flex-1 ${
                    pct <= 40
                      ? "[&>div]:bg-red-500"
                      : pct <= 75
                        ? "[&>div]:bg-amber-500"
                        : "[&>div]:bg-emerald-500"
                  }`}
                />
                <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {completeness.map((c) => (
                  <span
                    key={c.label}
                    className={c.ok ? "text-emerald-400" : "text-muted-foreground"}
                  >
                    {c.ok ? "✓" : "✗"} {c.label}
                  </span>
                ))}
              </div>
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

function NotesTab({
  memberId,
  notes,
  onRefresh,
}: {
  memberId: string;
  notes: Array<{ author: string; timestamp: string; body: string }>;
  onRefresh: () => void;
}) {
  const [body, setBody] = useState("");
  const addNote = useServerFn(addAdminNote);
  const mut = useMutation({
    mutationFn: () => addNote({ data: { memberId, body: body.trim() } }),
    onSuccess: () => {
      toast.success("Note added.");
      setBody("");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add note"),
  });

  const sorted = [...(notes ?? [])].sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No admin notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((n, i) => (
            <li key={i} className="border-b border-border/60 pb-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold">{n.author}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(n.timestamp)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a private admin note..."
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={!body.trim() || mut.isPending}
          >
            {mut.isPending ? "Saving…" : "Save Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity recorded yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="border-b border-border/60 pb-3 last:border-b-0">
          <div className="text-sm font-medium">
            {e.action}
            {e.metadata?.from && e.metadata?.to && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({e.metadata.from} → {e.metadata.to})
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {e.performed_by ?? "System"} · {formatDateTime(e.timestamp)}
          </div>
        </li>
      ))}
    </ul>
  );
}
