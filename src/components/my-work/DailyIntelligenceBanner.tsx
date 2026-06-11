/**
 * Daily Intelligence Banner — slim 44px gold-tinted banner shown once per
 * day at the top of My Work. Pulls today's key_intelligence_summary from
 * daily_intelligence_briefs or generates one inline. Dismissed via X or
 * "View full brief →"; both persist to localStorage keyed by user+date.
 * Hidden on viewports below 768px.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { getDailyBannerSummary } from "@/lib/daily-banner.functions";

const GOLD = "#C9A55C";
const BG = "rgba(196,154,43,0.12)";
const BORDER = "rgba(196,154,43,0.25)";

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lsKey(userId: string): string {
  return `atlas_daily_banner_${userId}_${todayLocalISO()}`;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function DailyIntelligenceBanner() {
  const [userId, setUserId] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const fetchSummary = useServerFn(getDailyBannerSummary);

  // Decide visibility once user is known.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const existing = safeGet(lsKey(uid));
      if (!existing) {
        setShow(true);
        // Mark shown after render commit.
        safeSet(lsKey(uid), "shown");
      }
    });
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => { active = false; window.removeEventListener("resize", onResize); };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["daily-banner-summary", userId, todayLocalISO()],
    enabled: !!userId && show && !isMobile,
    staleTime: 60 * 60_000,
    queryFn: () => fetchSummary(),
  });

  const dismiss = (reason: "dismissed" | "seen") => {
    if (userId) safeSet(lsKey(userId), reason);
    setCollapsing(true);
    window.setTimeout(() => setShow(false), 220);
  };

  if (!show || isMobile) return null;

  const firstName = data?.firstName ?? null;
  const summary = data?.summary ?? null;
  const hasAssignments = data?.hasAssignments ?? true;
  const fallbackText = hasAssignments
    ? `Good morning${firstName ? ` ${firstName}` : ""}. Your work is ready.`
    : "Welcome back. No assignments yet — check with your Engagement Lead.";
  const displayText = summary ?? fallbackText;
  const showBriefLink = hasAssignments;

  return (
    <div
      style={{
        height: collapsing ? 0 : 44,
        opacity: collapsing ? 0 : 1,
        overflow: "hidden",
        transition: "height 200ms ease, opacity 200ms ease",
        background: BG,
        borderBottom: `1px solid ${BORDER}`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="h-[44px] flex items-center gap-3" style={{ padding: "0 20px" }}>
        <IrisMark className="h-[14px] w-[14px] shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(201,165,92,0.4))" }} />
        <div className="min-w-0 flex-1 overflow-hidden">
          {isLoading && !data ? (
            <div
              className="h-[14px] rounded animate-pulse"
              style={{ width: 200, background: "rgba(255,255,255,0.08)" }}
              aria-label="Loading daily brief"
            />
          ) : (
            <div
              className="text-white whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ fontSize: 13, animation: "atlas-banner-fadein 150ms ease-out" }}
              title={displayText}
            >
              <span style={{ color: GOLD, fontWeight: 600 }}>IRIS</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}> · </span>
              {displayText}
            </div>
          )}
        </div>
        {showBriefLink && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: "Give me my daily brief" }));
              dismiss("seen");
            }}
            className="shrink-0"
            style={{ color: GOLD, fontSize: 12, background: "transparent", border: "none", cursor: "pointer" }}
          >
            View full brief →
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss daily brief"
          onClick={() => dismiss("dismissed")}
          className="shrink-0 inline-flex items-center justify-center"
          style={{ color: "rgba(255,255,255,0.4)", background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>
      <style>{`@keyframes atlas-banner-fadein { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
