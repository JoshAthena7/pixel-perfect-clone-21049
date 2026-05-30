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
import { MilestonesCard } from "@/components/war-room/MilestonesCard";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Athena" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { engagement, isLeadership, refresh } = useEngagement();
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
  }, [engagement?.id, isLeadership]);

  if (!engagement) return null;

  async function save() {
    if (!engagement) return;
    setSaving(true);
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
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isLeadership} />
          </div>
          <div>
            <Label htmlFor="client">Client</Label>
            <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} disabled={!isLeadership} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Input id="status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!isLeadership} />
          </div>
          <div>
            <Label>Submission date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!isLeadership}
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

        {!isLeadership && (
          <p className="text-xs text-muted-foreground">Only founders and PMs can edit engagement settings.</p>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !isLeadership}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card className="border-border bg-surface p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Slack notifications</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Get real-time pings for SOS alerts, sections turning Red, and new broadcasts.
            Create an{" "}
            <a className="underline" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">
              Incoming Webhook
            </a>{" "}
            in Slack and paste the URL below.
          </p>
        </div>
        <div>
          <Label htmlFor="slack">Webhook URL</Label>
          <Input
            id="slack"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            disabled={!isLeadership}
            type="url"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !isLeadership} variant="outline">
            {saving ? "Saving…" : "Save webhook"}
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
