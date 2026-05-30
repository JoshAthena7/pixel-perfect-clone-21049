import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/messaging")({
  head: () => ({ meta: [{ title: "Global Messaging — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={Megaphone}
      title="Global Messaging"
      description="Broadcast announcements to one, several, or all war rooms."
      comingSoon="Compose multi-room broadcasts, schedule sends, and track read receipts across the collective."
    />
  ),
});
