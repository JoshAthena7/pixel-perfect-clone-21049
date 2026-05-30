import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={Settings}
      title="Settings"
      description="Platform configuration."
      comingSoon="Manage roles, integrations, AI source toggles, branding, and global defaults for every war room."
    />
  ),
});
