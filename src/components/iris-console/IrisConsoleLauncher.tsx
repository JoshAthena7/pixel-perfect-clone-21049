/**
 * IRIS Console Launcher — floating gold ⚡ button mounted globally.
 *
 * Only appears on mission pages (/missions/:id/*) and only for users
 * with platform admin OR mission role of engagement_lead / lead /
 * project_manager. Writers, SMEs, and reviewers never see it.
 *
 * Click opens the IrisConsolePanel slide-up. Open/minimized state
 * persists in sessionStorage per mission so the panel survives page
 * navigation within the same session.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisConsolePanel } from "./IrisConsolePanel";

const GOLD = "#c9a84c";
const ACCESS_ROLES = new Set(["admin", "lead", "engagement_lead", "project_manager"]);

function useMissionIdFromPath(): string | null {
  const pathname = useLocation({ select: (l) => l.pathname });
  return useMemo(() => {
    const m = pathname.match(/\/missions\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }, [pathname]);
}

function useHasConsoleAccess(missionId: string | null): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    setAllowed(false);
    if (!missionId) return;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user?.id) return;
        const { data: adminRow } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
        if (alive && adminRow) { setAllowed(true); return; }
        const { data: memberRow } = await supabase
          .from("mission_team_members").select("mission_role")
          .eq("member_id", u.user.id).eq("mission_id", missionId).maybeSingle();
        const role = (memberRow?.mission_role as string | null) ?? "";
        if (alive && ACCESS_ROLES.has(role)) setAllowed(true);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [missionId]);
  return allowed;
}

type PanelState = "closed" | "open" | "minimized";

export function IrisConsoleLauncher() {
  const missionId = useMissionIdFromPath();
  const allowed = useHasConsoleAccess(missionId);
  const storageKey = missionId ? `iris-console:${missionId}` : null;
  const [state, setState] = useState<PanelState>("closed");

  // Restore per-mission persisted state
  useEffect(() => {
    if (!storageKey) { setState("closed"); return; }
    try {
      const v = sessionStorage.getItem(storageKey) as PanelState | null;
      setState(v === "open" || v === "minimized" ? v : "closed");
    } catch { setState("closed"); }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try { sessionStorage.setItem(storageKey, state); } catch { /* ignore */ }
  }, [storageKey, state]);

  if (!missionId || !allowed) return null;

  return (
    <>
      <style>{`
        @keyframes iris-launcher-pulse {
          0%, 100% { border-radius: 50%; box-shadow: 0 0 0 0 rgba(201,168,76,0.5); }
          50%      { border-radius: 56%; box-shadow: 0 0 0 6px rgba(201,168,76,0.05); }
        }
      `}</style>

      {state !== "open" && (
        <button
          type="button"
          aria-label="IRIS Quick Intel — Ask anything about this RFP."
          title="IRIS Quick Intel — Ask anything about this RFP."
          onClick={() => setState("open")}
          style={{
            position: "fixed", bottom: 80, right: 20, zIndex: 9990,
            width: 48, height: 48,
            background: "rgba(201,168,76,0.9)",
            color: "#070f1c",
            border: "1px solid rgba(201,168,76,0.9)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            animation: "iris-launcher-pulse 2s ease-in-out infinite",
          }}
        >
          <Zap size={20} strokeWidth={2.5} />
        </button>
      )}

      {state === "minimized" && (
        <div
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 9989,
            width: 280, height: 40,
            background: "#000308",
            border: `1px solid rgba(201,168,76,0.3)`,
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 12px", cursor: "pointer", color: "white",
          }}
          onClick={() => setState("open")}
        >
          <span style={{ color: GOLD, fontSize: 9, letterSpacing: "0.15em", fontFamily: "'Courier New', monospace", textTransform: "", fontWeight: 600 }}>
            ⚡ IRIS QUICK INTEL
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Click to reopen</span>
        </div>
      )}

      {state === "open" && (
        <IrisConsolePanel
          missionId={missionId}
          onMinimize={() => setState("minimized")}
          onClose={() => setState("closed")}
        />
      )}
    </>
  );
}
