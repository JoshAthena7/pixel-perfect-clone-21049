import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { HomePage } from "@/components/home/HomePage";

function HomeRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <HomePage />
    </Suspense>
  );
}

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRoute,
});
