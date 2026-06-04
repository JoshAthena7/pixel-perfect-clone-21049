import { useEffect, useState } from "react";

const STORAGE_KEY = "atlas_welcome_seen_v1";

function hasSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function AtlasWelcomeMount() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeen()) setOpen(true);
  }, []);

  if (!open) return null;

  const dismiss = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto"
      style={{ background: "#050810" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-welcome-title"
    >
      <style>{`
        @keyframes atlas-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div
        className="relative flex w-full max-w-[520px] flex-col px-8 py-14"
        style={{ animation: "atlas-fade-up 0.6s ease-out forwards" }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.24em] mb-6"
          style={{ color: "#5eead4" }}
        >
          ● ATHENA INTERNAL
        </div>

        <h1
          id="atlas-welcome-title"
          className="text-2xl font-semibold mb-6"
          style={{ color: "#fff", letterSpacing: "-0.01em" }}
        >
          Welcome to ATLAS.
        </h1>

        <div
          className="space-y-5 text-[15px]"
          style={{ color: "#d1d5db", lineHeight: 1.75 }}
        >
          <p>
            ATLAS is Athena&#x2019;s internal platform for mission management,
            collaboration, and intelligence. It is not a client-facing system.
          </p>
          <p>
            Everything you do here &#x2014; comments, threads, briefings,
            assignments &#x2014; is internal to Athena. Your clients will never
            see it.
          </p>
          <p>
            When you&#x2019;re working on an engagement, you&#x2019;ll move
            between two environments: the client system (where deliverables
            live and client feedback comes in) and ATLAS (where Athena&#x2019;s
            internal review, strategy, and quality work happens). Keep them
            separate.
          </p>
        </div>

        <button
          onClick={dismiss}
          className="mt-10 w-full rounded-md text-sm font-medium transition-colors"
          style={{
            height: 52,
            background: "#5eead4",
            color: "#050810",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#7ff0dc")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#5eead4")}
        >
          Got it &#x2014; take me to ATLAS
        </button>
      </div>
    </div>
  );
}
