import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/iris-demo")({
  beforeLoad: () => {
    throw redirect({ to: "/home", search: { "iris-demo": "1" } as never });
  },
  component: () => null,
});
