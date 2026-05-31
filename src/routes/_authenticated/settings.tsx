import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { daysUntil } from "@/lib/time";
import { logActivity } from "@/lib/activity-log";
import { MilestonesCard } from "@/components/war-room/MilestonesCard";
import { PageGate } from "@/components/war-room/PageGate";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configuration — Mission Control" }] }),
  component: () => <PageGate page="settings"><SettingsPage /></PageGate>,
});


// ── Mission Setup Checklist ──────────────────────────────────────
// Appears in Mission Control → Configuration until setup is complete.
function MissionSetupChecklist({ engagementId }: { engagementId: string }) {
  const [status, setStatus] = useState({ hasDate: false, hasDoc: false, hasTeam: false, checked: false });

  useEffect(() => {
    if (!engagementId) return;
    (async () => {
      const [eng, docs, members] = await Promise.all([
        supabase.from("engagements").select("submission_date").eq("id", engagementId).single(),
        supabase.from("intel_documents").select("id").eq("engagement_id", engagementId).limit(1),
        supabase.from("engagement_members").select("id").eq("engagement_id", engagementId).limit(3),
      ]);
      setStatus({
        hasDate: !!eng.data?.submission_date,
        hasDoc: (docs.data?.length ?? 0) > 0,
        hasTeam: (members.data?.length ?? 0) > 1,
        checked: true,
      });
    })();
  }, [engagementId]);

  if (!status.checked) return null;
  if (status.hasDate && status.hasDoc && status.hasTeam) return null;

  const steps = [
    { done: status.hasDate, icon: "📅", label: "Set your submission date", sub: "Enables the T-Minus countdown and deadline alerts", action: "Set it below →", href: null },
    { done: status.hasDoc, icon: "📄", label: "Upload your first RFP document", sub: "IRIS processes it and populates Mission Brain automatically", action: "Go to Documents →", href: "/library" },
    { done: status.hasTeam, icon: "👥", label: "Invite your first team member", sub: "Each role sees exactly what they need to do their job", action: "Go to Team →", href: "/section-assignments" },
  ].filter(s => !s.done);

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold">Mission setup</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
          {steps.length} step{steps.length > 1 ? "s" : ""} remaining
        </span>
      </div>
      <div className="space-y-2">
        {steps.map(s => (
          s.href
            ? <a key={s.label} href={s.href} className="flex items-start gap-3 rounded-md border border-border/40 bg-background/50 p-3 hover:border-primary/30 transition-colors no-underline">
                <span className="text-lg flex-shrink-0">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
                <span className="text-xs text-primary flex-shrink-0 mt-0.5">{s.action}</span>
              </a>
            : <div key={s.label} className="flex items-start gap-3 rounded-md border border-border/40 bg-background/50 p-3">
                <span className="text-lg flex-shrink-0">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">{s.action}</span>
              </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPage() {
  const { engagement, canEdit, refresh } = useEngagement();
  const canEditSettings = canEdit("settings");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("Active");
  const [date, setDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!engagement) return;
    setName(engagement.name);
    setClient(engagement.client);
    setStatus(engagement.status);
    setDate(engagement.submission_date ? new Date(engagement.submission_date) : undefined);
  }, [engagement?.id, canEditSettings]);

  if (!engagement) return null;
  if (!canEditSettings) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
      {engagement && <MissionSetupChecklist engagementId={engagement.id} />}
          <p className="mt-1 text-sm text-muted-foreground">Engagement configuration and submission timeline.</p>
        </div>
        <Card className="border-border bg-surface p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Engagement</h2>
          <div className="mt-3 space-y-1 text-sm">
            <div><span className="text-muted-foreground">Name:</span> {engagement.name}</div>
            <div><span className="text-muted-foreground">Client:</span> {engagement.client}</div>
            <div><span className="text-muted-foreground">Status:</span> {engagement.status}</div>
            <div><span className="text-muted-foreground">Submission date:</span> {engagement.submission_date ?? "—"}</div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Only founders and PMs can edit engagement settings.</p>
        </Card>
        <Card className="border-border bg-surface p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Session</h2>
          <Button
            variant="outline"
            className="mt-4"
            onClick={async () => { await supabase.auth.signOut(); }}
          >
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  async function save() {
    if (!engagement) return;
    setSaving(true);
    const prevStatus = engagement.status;
    const { error } = await supabase
      .from("engagements")
      .update({
        name,
        client,
        status,
        submission_date: date ? format(date, "yyyy-MM-dd") : null,
      })
      .eq("id", engagement.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Engagement updated");
    if (status !== prevStatus && status === "Archived") {
      const { data: u } = await supabase.auth.getUser();
      logActivity({
        engagementId: engagement.id,
        userId: u.user?.id ?? null,
        actorName: u.user?.email ?? "Unknown",
        action: "engagement_archived",
        targetTable: "engagements",
        targetId: engagement.id,
      });
    }
    refresh();
  }

  const dleft = daysUntil(date ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Engagement configuration and submission timeline.</p>
      </div>

      <Card className="border-border bg-surface p-6 space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Engagement</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div>
            <Label htmlFor="client">Client</Label>
            <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Input id="status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div>
            <Label>Submission date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canEditSettings}
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            {dleft !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {dleft > 0 ? `${dleft} days until submission` : dleft === 0 ? "Submission day" : `${Math.abs(dleft)} days past submission`}
              </p>
            )}
          </div>
        </div>

        {!canEditSettings && (
          <p className="text-xs text-muted-foreground">Only founders and PMs can edit engagement settings.</p>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !canEditSettings}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>


      <MilestonesCard />



      <Card className="border-border bg-surface p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Session</h2>
        <Button
          variant="outline"
          className="mt-4"
          onClick={async () => {
            await supabase.auth.signOut();
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}
