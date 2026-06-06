import { createFileRoute } from "@tanstack/react-router";
import { DataPrivacyPanel } from "@/components/v2/DataPrivacyPanel";

export const Route = createFileRoute("/_authenticated/command/security")({
  component: DataPrivacyPanel,
  head: () => ({
    meta: [
      { title: "Security & Ephemeral Processing — Atlas" },
      {
        name: "description",
        content:
          "How Atlas processes draft content: in memory, scored, and discarded. No storage, no training, contractually binding.",
      },
    ],
  }),
});
