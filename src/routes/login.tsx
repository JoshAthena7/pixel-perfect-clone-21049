import { createFileRoute } from "@tanstack/react-router";
import { AtlasLoginPage } from "@/components/AtlasLoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Atlas" }] }),
  component: AtlasLoginPage,
});
