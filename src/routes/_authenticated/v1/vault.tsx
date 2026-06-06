import { createFileRoute } from "@tanstack/react-router";
import { MissionVault } from "@/components/v1/MissionVault";

export const Route = createFileRoute("/_authenticated/v1/vault")({
  head: () => ({ meta: [{ title: "Mission Vault — NJ CSOC" }] }),
  component: MissionVault,
});
