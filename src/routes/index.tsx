import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Front door — auth gate runs in _authenticated; pass ?auto=1 so single-engagement
    // users get fast-routed past the lobby, while explicit /select-engagement always shows it.
    throw redirect({ to: "/select-engagement", search: { auto: "1" } as never });
  },
});
