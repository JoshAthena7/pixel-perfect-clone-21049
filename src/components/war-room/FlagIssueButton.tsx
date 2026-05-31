import { useEffect, useState } from "react";

export function openFlagIssue() {
  window.dispatchEvent(new Event("athena:open-flag-issue"));
}
import { Flag, AlertTriangle } from "lucide-react";
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
import { useSchemaForm } from "./useSchemaForm";
import { flagIssueSchema } from "./action-schemas";

const SEVERITIES: { key: IssueSeverity; emoji: string; label: string; cssVar: string }[] = [
  { key: "Yellow", emoji: "🟡", label: "Yellow", cssVar: "--yellow" },
  { key: "Orange", emoji: "🟠", label: "Orange", cssVar: "--orange" },
  { key: "Red", emoji: "🔴", label: "Red", cssVar: "--red" },
];

const TYPES: { key: IssueType; title: string; sub: string }[] = [
  { key: "sos", title: "I need immediate help", sub: "Active blocker — surfaces to leadership now" },
  { key: "risk", title: "I see a risk ahead", sub: "Something that could bite us if not tracked" },
];

const FLAG_COLUMNS = {
  description: "description",
  recommended_action: "action",
  severity: "severity",
  category: "type",
} as const;

export function FlagIssueButton() {
  const { engagement, member, canWrite, can, isArchived } = useEngagement();
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("athena:open-flag-issue", handler);
    return () => window.removeEventListener("athena:open-flag-issue", handler);
  }, []);

  if (!engagement || !member || !user) return null;
  // Hide on archived engagements; otherwise show for any role with at least
  // read access to escalations (writer/sme/pm/lead). exec & partner are out.
  if (isArchived) return null;
  if (!canWrite && !can("escalations")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[color:var(--red)] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-xl transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[color:var(--red)]/50"
        aria-label="Flag an issue"
      >
        <Flag className="h-4 w-4" />
        Raise a Signal™
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a Signal™</DialogTitle>
            <DialogDescription>One form for blockers and risks. Takes 30 seconds.</DialogDescription>
          </DialogHeader>

          {open && (
            <FlagIssueForm
              engagementId={engagement.id}
              userId={user.id}
              memberName={member.display_name}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FlagIssueForm({
  engagementId,
  userId,
  memberName,
  onClose,
}: {
  engagementId: string;
  userId: string;
  memberName: string;
  onClose: () => void;
}) {
  const f = useSchemaForm<{
    severity: IssueSeverity;
    type: IssueType;
    description: string;
    action: string;
  }>({
    schema: flagIssueSchema,
    initialValues: { severity: "Orange", type: "sos", description: "", action: "" },
    columnMap: FLAG_COLUMNS,
    errorToast: "Couldn't raise signal",
    successLabel: "signal-raised",
    resetTo: { severity: "Orange", type: "sos", description: "", action: "" },
    onSuccess: () => {
      toast.success(
        f.values.type === "sos"
          ? "🚨 Flagged — leadership has been notified."
          : "Risk logged — it's on the radar.",
      );
      onClose();
    },
    onSubmit: async (data) => {
      return createIssue({
        type: data.type,
        severity: data.severity,
        description: data.description,
        recommendedAction: data.action,
        engagementId,
        userId,
        memberName,
      });
    },
  });

  return (
    <form onSubmit={f.handleSubmit} className="space-y-5" noValidate>
      {f.formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[color:var(--red)]/40 bg-[color:color-mix(in_oklab,var(--red)_10%,transparent)] px-3 py-2 text-xs text-[color:var(--red)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{f.formError}</span>
        </div>
      )}

      <div>
        <Label className="mb-2 block">Severity</Label>
        <div className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((s) => {
            const active = f.values.severity === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => f.setField("severity", s.key)}
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
            const active = f.values.type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => f.setField("type", t.key)}
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
          rows={3}
          value={f.values.description}
          onChange={(e) => f.setField("description", e.target.value)}
          onBlur={() => f.mark("description")}
          placeholder="Plain language — who, what, when, impact."
        />
        {f.err("description") && (
          <p className="mt-1 text-[11px] font-medium text-[color:var(--red)]">{f.err("description")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="flag-action">Recommended action (optional)</Label>
        <Textarea
          id="flag-action"
          rows={2}
          value={f.values.action}
          onChange={(e) => f.setField("action", e.target.value)}
          onBlur={() => f.mark("action")}
          placeholder="What should leadership do?"
        />
        {f.err("action") && (
          <p className="mt-1 text-[11px] font-medium text-[color:var(--red)]">{f.err("action")}</p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={f.saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={f.saving || !f.valid}>
          {f.saving ? "Flagging…" : f.values.type === "sos" ? "🚨 Flag now" : "Log risk"}
        </Button>
      </DialogFooter>
    </form>
  );
}
