import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { Siren } from "lucide-react";

export const Route = createFileRoute("/_authenticated/writer/submit-sos")({
  head: () => ({ meta: [{ title: "Submit an SOS — Writer Portal" }] }),
  component: WriterSubmitSos,
});

function WriterSubmitSos() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [blocker, setBlocker] = useState("");
  const [who, setWho] = useState("");
  const [resolveBy, setResolveBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !blocker.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("sos_alerts").insert({
      engagement_id: engagement.id,
      submitted_by: user.id,
      submitter_name: member.display_name,
      severity: "High",
      category: "Other",
      description: blocker.trim(),
      owner_name: who || null,
      recommended_action: resolveBy ? `Resolve by: ${resolveBy}` : null,
      status: "Open",
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setBlocker(""); setWho(""); setResolveBy("");
    toast.success("SOS sent — your lead has been alerted");
  }

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <Card className="border-[color:var(--red)]/40 bg-surface p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[color:var(--red)]">
          <Siren className="h-5 w-5" /> Submit an SOS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Use this for blockers that need an immediate response.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="blocker">What's the blocker?</Label>
            <Textarea id="blocker" rows={5} value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Describe the blocker and what's stuck…" />
          </div>
          <div>
            <Label htmlFor="who">Who needs to know?</Label>
            <Input id="who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. PM, Client lead" />
          </div>
          <div>
            <Label htmlFor="resolve">Resolve by</Label>
            <Input id="resolve" value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} placeholder="e.g. End of day Friday" />
          </div>
          <Button type="submit" disabled={submitting || !blocker.trim()} className="w-full">
            {submitting ? "Sending…" : "Send SOS"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
