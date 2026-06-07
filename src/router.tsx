import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import atlasWordmark from "@/assets/atlas-wordmark-optical.png";
import athenaMark from "@/assets/athena-mark-v3.png.asset.json";

// L-10: Branded loading state shown during route transitions.
function AtlasPendingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        background: "radial-gradient(ellipse at top, #0a1228 0%, #05070d 60%, #000 100%)",
        color: "#E6EDF7",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <img
          src={athenaMark.url}
          alt=""
          aria-hidden
          draggable={false}
          style={{ height: 80, width: 80, objectFit: "contain", userSelect: "none", marginTop: -8, marginBottom: -8 }}
        />
        <span className="atlas-gold-dot" aria-hidden style={{ width: 8, height: 8 }} />
        <img
          src={atlasWordmark}
          alt="ATLAS"
          draggable={false}
          style={{
            height: 24,
            width: "auto",
            objectFit: "contain",
            userSelect: "none",
            filter: "brightness(1.12) drop-shadow(0 0 8px rgba(201,168,76,0.28))",
          }}
        />
      </div>
      <div
        aria-hidden
        style={{
          width: 160,
          height: 2,
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
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.32em",
          color: "rgba(224,179,65,0.55)",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Loading mission intelligence
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
