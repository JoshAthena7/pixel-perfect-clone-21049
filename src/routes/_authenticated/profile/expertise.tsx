import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/profile/expertise")({
  component: MyExpertisePage,
});

function MyExpertisePage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Expertise</h1>
      <p className="mt-3 text-sm text-muted-foreground">Expertise profiles are being rebuilt after the legacy cleanup.</p>
    </div>
  );
}

