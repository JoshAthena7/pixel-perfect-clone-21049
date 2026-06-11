import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MyWorkPage } from "@/components/my-work/MyWorkPage";

export const Route = createFileRoute("/_authenticated/my-work")({
  head: () => ({ meta: [{ title: "My Work — ATLAS" }] }),
  component: MyWorkRoute,
});

function MyWorkRoute() {
  // Bridge to the global IRIS Dock via window events (same channel
  // AssistsBar uses through props in _authenticated layout).
  const [, force] = useState(0);
  const openIris = () => {
    window.dispatchEvent(new CustomEvent("atlas:iris:open"));
    force((n) => n + 1);
  };
  const prefillIris = (value: string) => {
    window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: value }));
    force((n) => n + 1);
  };
  return <MyWorkPage onOpenIris={openIris} onPrefillIris={prefillIris} />;
}
