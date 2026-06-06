import { createFileRoute, redirect } from "@tanstack/react-router";

// Backward-compat redirect: every old /olympus/* deep link now maps to /admin/*.
// /olympus itself (no trailing path) is the Phase 5 executive view and is
// handled by src/routes/_authenticated/olympus.tsx.
export const Route = createFileRoute("/_authenticated/olympus/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    throw redirect({ to: `/admin/${rest}` as any, replace: true });
  },
});
