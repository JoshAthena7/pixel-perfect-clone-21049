/**
 * Feed ATLAS — the unified intel-loading drawer.
 *
 * Slides down from the ORACLE page header (push, not modal). Three tabs:
 *   1. Documents   — upload + tag + Analyze with IRIS
 *   2. Manual Item — inline form → oracle_signals (needs_review)
 *   3. State Pack  — admin-only state intel summary
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAccess";
import { DocumentsTab } from "./feed/DocumentsTab";
import { ManualItemTab } from "./feed/ManualItemTab";
import { StatePackTab } from "./feed/StatePackTab";

export type FeedAtlasTab = "documents" | "manual" | "state";

const GOLD = "#C49A2B";

export function FeedAtlasDrawer({
  open,
  onOpenChange,
  missionId,
  activeTab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  activeTab: FeedAtlasTab;
  onTabChange: (t: FeedAtlasTab) => void;
}) {
  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="w-full"
      style={{
        background: "#0a121f",
        borderBottom: "1px solid rgba(196,154,43,0.25)",
        boxShadow: "0 12px 28px -10px rgba(0,0,0,0.6)",
      }}
    >
      {/* Drawer header bar */}
      <div
        className="flex items-center justify-between px-4"
        style={{
          height: 40,
          background: "#070f1c",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="text-[13px] text-white" style={{ letterSpacing: "0.04em" }}>
          <span style={{ color: GOLD, fontWeight: 600 }}>FEED ATLAS</span>
          <span className="text-white/40 mx-2">—</span>
          <span className="text-white/75">Load Intelligence</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-white/40 hover:text-white/80"
          aria-label="Close drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex items-center px-4 gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <TabButton active={activeTab === "documents"} onClick={() => onTabChange("documents")}>
          Documents
        </TabButton>
        <TabButton active={activeTab === "manual"} onClick={() => onTabChange("manual")}>
          Manual Item
        </TabButton>
        {isAdmin && (
          <TabButton active={activeTab === "state"} onClick={() => onTabChange("state")}>
            State Pack
          </TabButton>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-5 max-w-5xl mx-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {activeTab === "documents" && <DocumentsTab missionId={missionId} />}
        {activeTab === "manual" && (
          <ManualItemTab missionId={missionId} onSubmitted={() => onTabChange("manual")} />
        )}
        {activeTab === "state" && isAdmin && <StatePackTab missionId={missionId} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors"
      style={{
        background: "transparent",
        border: "none",
        padding: "10px 14px",
        fontSize: 12,
        color: active ? GOLD : "rgba(255,255,255,0.55)",
        fontWeight: active ? 600 : 500,
        borderBottom: `2px solid ${active ? GOLD : "transparent"}`,
        marginBottom: -1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
