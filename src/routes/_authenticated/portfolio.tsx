import { createFileRoute } from "@tanstack/react-router";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — ATLAS" }] }),
  component: PortfolioRoute,
});

function PortfolioRoute() {
  const openIris = () => window.dispatchEvent(new CustomEvent("atlas:iris:open"));
  return <PortfolioPage onOpenIris={openIris} />;
}
