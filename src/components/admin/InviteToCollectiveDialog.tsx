import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";

const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "pm", label: "Program Manager" },
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "Subject Matter Expert" },
  { value: "reviewer", label: "Reviewer" },
  { value: "advisor", label: "Advisor" },
  { value: "viewer", label: "Viewer" },
];

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  display_name: z.string().trim().min(1, "Name is required").max(120),
  title: z.string().trim().max(120).optional(),
  role: z.string().min(1, "Pick a role"),
  engagement_id: z.string().uuid("Pick an engagement"),
});

type EngagementOpt = { id: string; name: string };

export function InviteToCollectiveDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited?: () => void;
}) {
  const [engagements, setEngagements] = useState<EngagementOpt[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("writer");
  const [engagementId, setEngagementId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select("id,name")
        .order("name");
      if (error) {
        toast.error("Couldn't load engagements", { description: error.message });
        return;
      }
      setEngagements(data ?? []);
      if (!engagementId && data && data.length > 0) setEngagementId(data[0].id);
    })();
  }, [open, engagementId]);

  const reset = () => {
    setEmail("");
    setName("");
    setTitle("");
    setRole("writer");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({
      email,
      display_name: name,
      title: title || undefined,
      role,
      engagement_id: engagementId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) throw new Error("Not signed in");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      const { error } = await supabase.from("engagement_invites").insert({
        engagement_id: parsed.data.engagement_id,
        email: parsed.data.email,
        display_name: parsed.data.display_name,
        title: parsed.data.title ?? null,
        role: parsed.data.role,
        invited_by: user.id,
        invited_by_name: profile?.display_name ?? user.email ?? "Admin",
      });
      if (error) throw error;

      toast.success("Invitation sent", {
        description: `${parsed.data.display_name} invited as ${parsed.data.role}.`,
      });
      reset();
      onOpenChange(false);
      onInvited?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invite";
      toast.error("Invite failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] border-border/60 bg-[#16161f]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--gold)]" />
            Invite to Collective
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add a new member to a war room. They'll get an invite link to accept.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <fieldset disabled={submitting} className="space-y-3 disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Full Name
              </Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Jane Doe"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="invite-email" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="jane@example.com"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="invite-title" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Title <span className="text-muted-foreground/60 normal-case">(optional)</span>
              </Label>
              <Input
                id="invite-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Senior Policy Advisor"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="invite-role" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Role
                </Label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-9 text-sm rounded-md border border-input bg-background px-3 text-foreground disabled:cursor-not-allowed"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="invite-engagement" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Engagement
                </Label>
                <select
                  id="invite-engagement"
                  value={engagementId}
                  onChange={(e) => setEngagementId(e.target.value)}
                  className="h-9 text-sm rounded-md border border-input bg-background px-3 text-foreground disabled:cursor-not-allowed"
                  required
                >
                  {engagements.length === 0 && <option value="">No engagements</option>}
                  {engagements.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>


          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !engagementId} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" /> Send Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
