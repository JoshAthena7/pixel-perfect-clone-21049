// Phase 3 — first-login orientation tooltip. Bottom-left, non-blocking,
// auto-dismiss after 10s, persists has_seen_orientation=true.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { RoutingRole } from "@/lib/routing-role";

const TEXT_BY_ROLE: Record<string, string> = {
  writer:
    "This is your Cockpit — your personal workspace showing only the sections assigned to you. When your PM assigns sections, they'll appear here automatically.",
  sme:
    "This is your Cockpit, filtered to sections where your input is needed. Open any section to see what the writing team is waiting on from you.",
  reviewer:
    "This is your review queue — sections that are ready for your approval. Open any section to review the draft and leave feedback or approve.",
  pm:
    "You're at Athena HQ. The panel above shows everything IRIS has flagged across your missions. Items are sorted by severity — critical issues first.",
  engagement_lead_single:
    "This is your mission's command center. The IRIS health score at the top tells you the state of the mission at a glance — alignment, completeness, and risk.",
  engagement_lead:
    "You're at Athena HQ. Your missions are sorted by IRIS health score — the most at-risk mission surfaces first. Click any card to enter the mission.",
  executive_sponsor:
    "You're in Olympus — the strategic portfolio view. IRIS surfaces cross-mission patterns here that aren't visible from inside any single mission. Use the Atrium for operational detail.",
};

export function OrientationTooltip() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("has_seen_orientation")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile?.has_seen_orientation) return;
        const key = "engagement_lead";
        const msg = TEXT_BY_ROLE[key];
        if (!msg) return;
        setText(msg);
        // Persist immediately so it never re-appears even if user closes tab.
        await supabase
          .from("profiles")
          .update({ has_seen_orientation: true })
          .eq("id", data.user.id);
        timer = window.setTimeout(() => setText(null), 10_000);
      } catch { /* noop */ }
    })();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!text) return null;
  return (
    <div
      className="fixed bottom-6 left-6 z-50 max-w-sm rounded-[10px] border bg-card px-4 py-3 shadow-xl"
      style={{ borderColor: "rgba(99,102,241,0.4)" }}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2 w-2 rounded-full" style={{ background: "#6366F1" }} />
        <p className="flex-1 text-[13px] leading-relaxed text-foreground/90">{text}</p>
        <button
          onClick={() => setText(null)}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Re-export for callers that want the role type.
export type { RoutingRole };
