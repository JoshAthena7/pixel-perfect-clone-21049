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


export const Route = createFileRoute("/_authenticated/writer/submit-risk")({
  head: () => ({ meta: [{ title: "Submit a Risk — Writer Portal" }] }),
  component: WriterSubmitRisk,
});

const URGENCY = ["Low", "Medium", "High"] as const;
const URGENCY_TO_SEV: Record<(typeof URGENCY)[number], string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
};

function WriterSubmitRisk() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [risk, setRisk] = useState("");
  const [section, setSection] = useState("");
  const [urgency, setUrgency] = useState<(typeof URGENCY)[number]>("Medium");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !risk.trim()) return;
    setSubmitting(true);
    const title = risk.trim().split("\n")[0].slice(0, 120);
    const description = section ? `Section: ${section}\n\n${risk.trim()}` : risk.trim();
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagement.id,
      title,
      description,
      severity: URGENCY_TO_SEV[urgency],
      likelihood: "Possible",
      status: "Open",
      owner_name: member.display_name,
      created_by: user.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    notifySlack({
      data: {
        engagementId: engagement.id,
        event: "risk",
        title: `[${urgency}] ${title}`,
        body: risk.trim(),
        fields: section ? [{ label: "Section", value: section }] : undefined,
        author: member.display_name,
      },
    }).catch(() => {});
    setRisk(""); setSection(""); setUrgency("Medium");
    toast.success("Risk logged — your lead has been notified");
  }

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <Card className="border-border bg-surface p-6">
        <h1 className="text-xl font-bold">Submit a Risk</h1>
        <p className="mt-1 text-sm text-muted-foreground">Flag something that could bite us later. Leadership will be notified.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="risk">What's the risk?</Label>
            <Textarea id="risk" rows={5} value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Describe the risk and potential impact…" />
          </div>
          <div>
            <Label htmlFor="section">Section affected</Label>
            <Input id="section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. LTSS, Care Management" />
          </div>
          <div>
            <Label>Urgency</Label>
            <div className="mt-1 flex gap-2">
              {URGENCY.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    urgency === u ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={submitting || !risk.trim()} className="w-full">
            {submitting ? "Submitting…" : "Submit Risk"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
