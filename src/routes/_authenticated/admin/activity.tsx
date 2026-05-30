import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({ meta: [{ title: "Activity — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={Activity}
      title="Activity"
      description="Unified platform activity feed."
      comingSoon="Live stream of every meaningful action — edits, decisions, invites, broadcasts — filterable by room, actor, and event type."
    />
  ),
});
