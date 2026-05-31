import { useState } from "react";
import { X } from "lucide-react";

type Env = "mission-control" | "mission" | "command-center";

const CONFIG: Record<Env, { emoji: string; title: string; body: string }> = {
  "mission-control": {
    emoji: "🎯",
    title: "Mission Control",
    body: "This is where missions are activated and intelligence is managed. Upload documents here — IRIS processes them automatically and updates Mission Brain.",
  },
  "mission": {
    emoji: "⚡",
    title: "Mission Workspace",
    body: "This is where execution happens. Submit signals, track section progress, manage risks, and raise SOS alerts.",
  },
  "command-center": {
    emoji: "◉",
    title: "Command Center",
    body: "This is where leadership monitors mission health and consumes intelligence. Review your morning brief and act on what IRIS surfaces.",
  },
};

interface Props { env: Env; }

export function EnvironmentBanner({ env }: Props) {
  const key = `athena_env_banner_${env}`;
  const [show, setShow] = useState(() => !localStorage.getItem(key));
  const cfg = CONFIG[env];

  function dismiss() { localStorage.setItem(key, "1"); setShow(false); }

  if (!show) return null;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      margin: "16px 20px 0",
      padding: "12px 14px",
      borderRadius: 8,
      border: "0.5px solid rgba(196,154,42,0.2)",
      background: "rgba(196,154,42,0.05)",
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{cfg.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, margin: 0, marginBottom: 3 }}>{cfg.title}</p>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>{cfg.body}</p>
      </div>
      <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer",
        color: "var(--muted-foreground)", padding: 2, flexShrink: 0 }}>
        <X style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}
