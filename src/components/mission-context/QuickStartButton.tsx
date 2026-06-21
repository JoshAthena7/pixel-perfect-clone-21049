/**
 * FIVE-5 Step 7: Quick-start ? button + role-specific side panel.
 * Visible for first 7 days after a user's first login (tracked in localStorage).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMissionAccess } from "@/hooks/useAccess";
import { firstLoginGlobalKey } from "@/lib/mission-landing";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const WRITER_STEPS: Array<[string, string]> = [
  ["Open a question", "Tap any question in My Questions."],
  ["Read your brief", "IRIS briefs you automatically. Takes about 10 seconds."],
  ["Write your draft", "Use Word, SharePoint, or Loopio. Export the brief as your reference."],
  ["Check in", `Tap "Status update" when done or when you need help.`],
  ["Pin a note", "Leave decisions, questions, or blockers on the question. Your lead will see them."],
];
const LEAD_STEPS: Array<[string, string]> = [
  ["Upload the RFP", "Drop it in Signal Review — IRIS reads every page."],
  ["Review extracted signals", "Approve what's accurate, dismiss what isn't."],
  ["Assign writers", "From Mission Control's Team tab."],
  ["Set the North Star", "Pin the win strategy in the Briefing."],
  ["Watch the radar", "Mission Control shows live status, SOS, and momentum."],
];
const ADMIN_STEPS = LEAD_STEPS;

export function QuickStartButton({ missionId }: { missionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { data: access } = useMissionAccess(missionId);
  const role = access?.isAdmin ? "admin" : String(access?.role ?? "").toLowerCase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const key = firstLoginGlobalKey(data.user.id);
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, String(Date.now()));
        }
      } catch { /* ignore */ }
    });
  }, []);

  if (!userId) return null;
  let firstLoginAt = 0;
  try { firstLoginAt = Number(localStorage.getItem(firstLoginGlobalKey(userId)) ?? "0"); } catch { /* ignore */ }
  if (!firstLoginAt) return null;
  if (Date.now() - firstLoginAt > SEVEN_DAYS_MS) return null;

  const steps =
    role === "writer" || role === "sme" ? WRITER_STEPS
    : role === "admin" ? ADMIN_STEPS
    : LEAD_STEPS;

  return (
    <>
      <button
        title="Quick start guide"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 16, left: 16, zIndex: 50,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white", fontSize: 14, cursor: "pointer",
        }}
      >
        ?
      </button>
      {open && (
        <div
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, width: 240, zIndex: 60,
            background: "#050d18",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            color: "white", padding: 20, overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>Quick Start</div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 16 }}
              aria-label="Close"
            >×</button>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {steps.map(([title, body], i) => (
              <li key={i}>
                <div style={{ fontSize: 12, color: "#C49A2B", marginBottom: 2 }}>
                  {["①","②","③","④","⑤"][i] ?? `${i + 1}.`} {title}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{body}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
