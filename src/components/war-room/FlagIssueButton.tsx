import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { createIssue, type IssueSeverity, type IssueType } from "@/lib/flag-issue";

const SEVERITIES: { key: IssueSeverity; emoji: string; label: string; cssVar: string }[] = [
  { key: "Yellow", emoji: "🟡", label: "Yellow", cssVar: "--yellow" },
  { key: "Orange", emoji: "🟠", label: "Orange", cssVar: "--orange" },
  { key: "Red", emoji: "🔴", label: "Red", cssVar: "--red" },
];

const TYPES: { key: IssueType; title: string; sub: string }[] = [
  { key: "sos", title: "I need immediate help", sub: "Active blocker — surfaces to leadership now" },
  { key: "risk", title: "I see a risk ahead", sub: "Something that could bite us if not tracked" },
];

export function FlagIssueButton() {
  const { engagement, member, canWrite } = useEngagement();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<IssueSeverity>("Orange");
  const [type, setType] = useState<IssueType>("sos");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!engagement || !member || !user) return null;
  // Archived engagements: keep button hidden so users don't try to write
  if (!canWrite && member.role !== "writer") return null;

  function reset() {
    setSeverity("Orange");
    setType("sos");
    setDescription("");
    setAction("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Tell us what's wrong");
    setSubmitting(true);
    const { error } = await createIssue({
      type,
      severity,
      description,
      recommendedAction: action,
      engagementId: engagement!.id,
      userId: user!.id,
      memberName: member!.display_name,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(
      type === "sos"
        ? "🚨 Flagged — leadership has been notified."
        : "Risk logged — it's on the radar.",
    );
    reset();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[color:var(--red)] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-xl transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[color:var(--red)]/50"
        aria-label="Flag an issue"
      >
        <Flag className="h-4 w-4" />
        Flag an Issue
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Flag an Issue</DialogTitle>
            <DialogDescription>One form for blockers and risks. Takes 30 seconds.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label className="mb-2 block">Severity</Label>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITIES.map((s) => {
                  const active = severity === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSeverity(s.key)}
                      className={`flex flex-col items-center justify-center rounded-lg border-2 px-3 py-3 text-xs font-bold uppercase tracking-wide transition ${
                        active
                          ? `border-[color:var(${s.cssVar})] bg-[color:color-mix(in_oklab,var(${s.cssVar})_20%,transparent)] text-[color:var(${s.cssVar})] ring-2 ring-[color:var(${s.cssVar})]/40`
                          : "border-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <span className="text-xl">{s.emoji}</span>
                      <span className="mt-1">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Type</Label>
              <div className="grid gap-2">
                {TYPES.map((t) => {
                  const active = type === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={`rounded-md border-2 px-4 py-3 text-left transition ${
                        active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="text-sm font-semibold">{t.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{t.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="flag-desc">What's wrong?</Label>
              <Textarea
                id="flag-desc"
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Plain language — who, what, when, impact."
              />
            </div>

            <div>
              <Label htmlFor="flag-action">Recommended action (optional)</Label>
              <Textarea
                id="flag-action"
                rows={2}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="What should leadership do?"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !description.trim()}>
                {submitting ? "Flagging…" : type === "sos" ? "🚨 Flag now" : "Log risk"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
