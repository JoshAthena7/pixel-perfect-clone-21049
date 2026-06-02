import { createFileRoute } from "@tanstack/react-router";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/users")({
  component: UsersPage,
});

function UsersPage() {
  return (
    <SectionStub
      eyebrow="Users (Admin)"
      title="Firm-Wide User Management"
      description="All users across Athena Command. Invite, edit firm role, suspend, remove. Firm role is the user's default; their per-mission role is set in the Team section of each mission."
      phase="Phase 6"
    />
  );
}
