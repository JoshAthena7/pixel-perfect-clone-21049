import { useEffect, useState, type ReactNode } from "react";
import { Shield, X } from "lucide-react";

/**
 * Persistent label shown at the top of every comment thread.
 * Drop this directly above any comment list/input.
 */
export function CommentPanelLabel() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.18em] border-b"
      style={{
        background: "rgba(94,234,212,0.06)",
        borderColor: "rgba(94,234,212,0.18)",
        color: "#5eead4",
      }}
    >
      <Shield className="h-3 w-3" />
      <span>ATHENA INTERNAL</span>
      <span style={{ color: "rgba(94,234,212,0.5)" }}>·</span>
      <span style={{ color: "rgba(229,231,235,0.7)" }}>Not visible to clients</span>
    </div>
  );
}

/**
 * Recommended placeholder text for the comment input.
 */
export const COMMENT_PLACEHOLDER =
  "Leave an internal note, flag a question, or @mention a teammate. This thread is Athena-only.";

const NOTICE_KEY = "atlas_comment_panel_notice_v1";

/**
 * First-time notice shown when a user opens the comment panel.
 * One-time dismiss (per user, per browser).
 */
export function CommentPanelFirstNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(NOTICE_KEY) !== "1") setShow(true);
    } catch {
      // ignore
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div
      className="relative px-4 py-3 text-[12px] leading-relaxed border-b"
      style={{
        background: "rgba(94,234,212,0.04)",
        borderColor: "rgba(94,234,212,0.15)",
        color: "#d1d5db",
      }}
      role="note"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 rounded hover:bg-white/5"
        style={{ color: "#9ca3af" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="font-medium mb-1" style={{ color: "#fff" }}>
        These comments are internal to Athena.
      </p>
      <p className="mb-3" style={{ color: "rgba(229,231,235,0.75)" }}>
        They are separate from any feedback in the client system. Do not share
        comment thread content externally.
      </p>
      <button
        onClick={dismiss}
        className="rounded-md text-[11px] font-medium px-3 py-1.5 transition-colors"
        style={{ background: "#5eead4", color: "#050810" }}
      >
        Understood
      </button>
    </div>
  );
}

const IRIS_TOOLTIP_KEY = "atlas_iris_mention_tooltip_v1";

/**
 * First-use tooltip for @IRIS. Wrap the comment textarea (or any trigger area)
 * with this so a small popover appears once.
 */
export function IrisMentionTooltip({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(IRIS_TOOLTIP_KEY) !== "1") setShow(true);
    } catch {
      // ignore
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(IRIS_TOOLTIP_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div className="relative">
      {children}
      {show && (
        <div
          className="absolute z-20 -top-2 right-2 -translate-y-full max-w-[280px] rounded-md border p-3 text-[11px] shadow-lg"
          style={{
            background: "#0b1220",
            borderColor: "rgba(94,234,212,0.35)",
            color: "#e5e7eb",
            lineHeight: 1.55,
          }}
          role="tooltip"
        >
          <div
            className="text-[10px] uppercase tracking-[0.18em] mb-1"
            style={{ color: "#5eead4" }}
          >
            ● IRIS
          </div>
          Type <span className="font-mono" style={{ color: "#5eead4" }}>@IRIS</span>{" "}
          to ask IRIS a question about this assignment &#x2014; terminology, RFP
          alignment, win themes. IRIS responds inline. All @IRIS queries are
          logged.
          <button
            onClick={dismiss}
            className="mt-2 block text-[10px] underline"
            style={{ color: "#9ca3af" }}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
