import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Save, Send, Copy, Mail, Phone, MapPin, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getAtlasTeamMember, updateAtlasTeamMember } from "@/lib/atlas-team-admin.functions";
import { updateAtlasTeamRole, sendAtlasInvite } from "@/lib/atlas-team-invite.functions";

const ROLE_OPTIONS = [
  { value: "unassigned", label: "Unassigned" },
  { value: "admin", label: "Admin" },
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
] as const;

export const Route = createFileRoute("/_authenticated/admin/team/$memberId")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) {
      throw redirect({ to: "/my-work" });
    }
  },
  component: MemberProfilePage,
});

function MemberProfilePage() {
  const { memberId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchMember = useServerFn(getAtlasTeamMember);
  const updateFn = useServerFn(updateAtlasTeamMember);
  const roleFn = useServerFn(updateAtlasTeamRole);
  const inviteFn = useServerFn(sendAtlasInvite);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["atlas-team-member", memberId],
    queryFn: () => fetchMember({ data: { id: memberId } }),
  });

  const member = data?.member;
  const activity = data?.activity ?? [];

  const [form, setForm] = useState({
    first_name: "", last_name: "", job_title: "", phone: "", address: "",
    skills: "", languages: "", atlas_resume_url: "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!member) return;
    setForm({
      first_name: member.first_name ?? "",
      last_name: member.last_name ?? "",
      job_title: member.job_title ?? "",
      phone: member.phone ?? "",
      address: member.address ?? "",
      skills: (member.skills ?? []).join(", "),
      languages: (member.languages ?? []).join(", "),
      atlas_resume_url: member.atlas_resume_url ?? "",
    });
    setDirty(false);
  }, [member]);

  const update = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: memberId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        job_title: form.job_title.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
        atlas_resume_url: form.atlas_resume_url.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Profile saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["atlas-team-member", memberId] });
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const roleMut = useMutation({
    mutationFn: (atlas_role: string) => roleFn({ data: { id: memberId, atlas_role } }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["atlas-team-member", memberId] });
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update role"),
  });

  const inviteMut = useMutation({
    mutationFn: () => inviteFn({ data: { id: memberId } }),
    onSuccess: async (r: any) => {
      const url = `${window.location.origin}/auth?invite=${r.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invite sent · link copied to clipboard");
      } catch {
        toast.success("Invite sent", { description: url });
      }
      qc.invalidateQueries({ queryKey: ["atlas-team-member", memberId] });
      qc.invalidateQueries({ queryKey: ["atlas-team-roster"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send invite"),
  });

  const fullName = useMemo(
    () => [form.first_name, form.last_name].filter(Boolean).join(" ") ||
          [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
          member?.email || "Team member",
    [form, member],
  );
  const initials = useMemo(() => {
    const a = (form.first_name || member?.first_name || "").trim()[0] ?? "";
    const b = (form.last_name || member?.last_name || "").trim()[0] ?? "";
    return (a + b).toUpperCase() || (member?.email?.[0]?.toUpperCase() ?? "?");
  }, [form, member]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-8 py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (isError || !member) {
    return (
      <div className="min-h-screen bg-background px-8 py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/team" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to roster
          </Button>
          <p className="text-sm text-destructive">Failed to load member.</p>
        </div>
      </div>
    );
  }

  const invited = member.atlas_invite_status === "invite_sent" || member.atlas_invite_status === "active";
  const currentRole = ROLE_OPTIONS.some((r) => r.value === member.atlas_role) ? member.atlas_role : "unassigned";

  return (
    <div className="min-h-screen bg-background px-8 py-8 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to="/admin/team" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to roster
        </Link>

        {/* Header */}
        <div className="rounded-lg border p-6 flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold">
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
              : initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{fullName}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {ROLE_OPTIONS.find((r) => r.value === currentRole)?.label ?? "Unassigned"}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {member.email}</span>
              {member.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {member.phone}</span>}
              {member.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {member.address}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{member.atlas_invite_status}</Badge>
              <Badge variant="outline" className="text-[10px]">Profile {member.atlas_profile_completeness}%</Badge>
              {member.atlas_onboarding_complete && <Badge className="text-[10px]">Onboarded</Badge>}
              {member.atlas_hipaa_acknowledged && <Badge variant="secondary" className="text-[10px]">HIPAA ack</Badge>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="w-48">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Atlas role</Label>
              <Select
                value={currentRole}
                disabled={roleMut.isPending}
                onValueChange={(v) => { if (v !== currentRole) roleMut.mutate(v); }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" disabled={inviteMut.isPending} onClick={() => inviteMut.mutate()}>
              {inviteMut.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : invited ? <Copy className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
              {invited ? "Resend invite" : "Send invite"}
            </Button>
          </div>
        </div>

        {/* Editable details */}
        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile details</h2>
            <Button size="sm" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First name</Label>
              <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Job title</Label>
              <Input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div>
              <Label>Resume URL</Label>
              <Input value={form.atlas_resume_url} placeholder="https://…"
                     onChange={(e) => update("atlas_resume_url", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div>
              <Label>Skills <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.skills} onChange={(e) => update("skills", e.target.value)} />
            </div>
            <div>
              <Label>Languages <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.languages} onChange={(e) => update("languages", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Read-only system info */}
        <div className="grid grid-cols-2 gap-4">
          <InfoCard label="Email">{member.email}</InfoCard>
          <InfoCard label="TalentDesk ID">{member.talentdesk_id || "—"}</InfoCard>
          <InfoCard label="Invite sent">{fmt(member.atlas_invite_sent_at)}</InfoCard>
          <InfoCard label="First login">{fmt(member.atlas_first_login_at)}</InfoCard>
          <InfoCard label="Last active">{fmt(member.atlas_last_active_at)}</InfoCard>
          <InfoCard label="Joined">{fmt(member.created_at)}</InfoCard>
        </div>

        {member.atlas_resume_url && (
          <a href={member.atlas_resume_url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <FileText className="h-4 w-4" /> View resume
          </a>
        )}

        {/* Activity */}
        <div className="rounded-lg border p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a: any) => (
                <li key={a.id} className="flex items-start justify-between gap-4 text-sm border-b last:border-0 pb-2">
                  <span>{a.action}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm break-words">{children}</div>
    </div>
  );
}

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString(); } catch { return v; }
}
