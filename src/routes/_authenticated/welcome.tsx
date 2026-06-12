import { createFileRoute } from "@tanstack/react-router";
import { IrisOnboardingMount } from "@/components/onboarding/IrisOnboarding";

export const Route = createFileRoute("/_authenticated/welcome")({
  component: WelcomeRoute,
});

function WelcomeRoute() {
  return (
    <div className="min-h-screen" style={{ background: "#07101e" }}>
      <IrisOnboardingMount />
    </div>
  );
}
