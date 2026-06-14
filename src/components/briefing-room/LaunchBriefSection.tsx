import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#d4a843";
const CARD = "#13131a";
const BORDER = "#2a2a3a";

export function LaunchBriefSection({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["mission-launch-brief", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_launch_briefs")
        .select("brief_text, created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[launch-brief] fetch error", error.message);
        return null;
      }
      return data;
    },
  });

  if (!data?.brief_text) return null;

  return (
    <section
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: GOLD,
              fontWeight: 600,
            }}
          >
            IRIS Launch Brief — From Past Missions
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{
            color: "rgba(255,255,255,0.55)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div
          className="px-5 pb-5 pt-1 whitespace-pre-wrap"
          style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}
        >
          {data.brief_text}
        </div>
      )}
    </section>
  );
}
