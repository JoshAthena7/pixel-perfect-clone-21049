import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IrisType } from "@/components/v2/polish";

type Screen = "atrium" | "studio" | "brief-room" | "olympus";

const LINES: Record<Screen, (name: string) => string> = {
  atrium: (name) => `${timeGreeting()}, ${name}. The mission continues.`,
  studio: (name) => `${timeGreeting()}, ${name}. Here's what IRIS found.`,
  "brief-room": (name) => `A briefing is waiting for you, ${name}.`,
  olympus: (name) => `Welcome to the command station, ${name}.`,
};

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "there";
  // "Jane Doe" -> "Jane"; "jane.doe@x.com" -> "Jane"
  const head = trimmed.split(/[\s.]+/)[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/**
 * IrisGreeting — atmospheric, room-entering acknowledgement from IRIS.
 * Not a notification. Sets the tone for the screen.
 */
export function IrisGreeting({ screen }: { screen: Screen }) {
  const [name, setName] = useState<string>("there");

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
      const source = meta.full_name || meta.name || data.user.email || "";
      setName(firstName(source));
    });
    return () => { alive = false; };
  }, []);

  const line = LINES[screen](name);

  return (
    <div
      className="iris-greeting flex items-center gap-2.5 text-[12px] tracking-[0.02em]"
      style={{ color: "var(--iris, #5cbdf2)" }}
      aria-live="polite"
    >
      <span
        className="iris-greeting-dot"
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: "currentColor",
          boxShadow: "0 0 12px currentColor",
          display: "inline-block",
        }}
      />
      <IrisType text={line} speed={18} className="" as="span" />
      <style>{`.iris-greeting span:nth-of-type(2) { font-style: italic; opacity: 0.92; }`}</style>
      <style>{`
        .iris-greeting { animation: iris-greeting-fade 900ms ease-out both; }
        .iris-greeting-dot { animation: iris-greeting-pulse 2.8s ease-in-out infinite; }
        @keyframes iris-greeting-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes iris-greeting-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .iris-greeting, .iris-greeting-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default IrisGreeting;
