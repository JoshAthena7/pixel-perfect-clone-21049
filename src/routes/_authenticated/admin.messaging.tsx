import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/messaging")({
  component: MessagingPage,
});

function MessagingPage() {
  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <Megaphone className="h-10 w-10 mx-auto mb-4" style={{ color: "#c9a84c" }} />
        <h1 className="text-xl font-semibold text-white">Messaging</h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Broadcast announcements and team alerts. Coming soon.
        </p>
      </div>
    </div>
  );
}
