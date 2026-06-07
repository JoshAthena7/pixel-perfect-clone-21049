import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// L-10: Branded loading state shown during route transitions.
function AtlasPendingScreen() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "#060b14",
        color: "#E6EDF7",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "0.32em",
          color: "#E0B341",
        }}
      >
        ATLAS
      </div>
      <div
        aria-hidden
        style={{
          width: 140,
          height: 3,
          borderRadius: 999,
          background: "rgba(224,179,65,0.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "40%",
            background: "linear-gradient(90deg, transparent, #E0B341, transparent)",
            animation: "atlas-pending-shimmer 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes atlas-pending-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: AtlasPendingScreen,
    defaultPendingMs: 400,
    defaultPendingMinMs: 200,
  });

  return router;
};
