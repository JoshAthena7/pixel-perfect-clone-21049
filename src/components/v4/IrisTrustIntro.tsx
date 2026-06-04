import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "atlas:iris-trust-intro-dismissed-v1";

export function IrisTrustIntro() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      setHidden(!!dismissed);
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    setHidden(true);
  };

  return (
    <section
      aria-label="Meet IRIS"
      className="relative rounded-[12px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] px-6 py-5"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
        </span>
        Meet IRIS
      </div>

      <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
        IRIS doesn't write proposals. You do.
      </h3>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
        IRIS reads your draft the way a smart colleague would — looking for gaps,
        compliance flags, and anything an evaluator might mark down. It asks
        questions. It never rewrites your work. The expertise is yours. IRIS just
        makes sure nothing gets missed before Red Team.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border bg-background/50 px-2.5 py-1">
          Reads drafts when you ask
        </span>
        <span className="rounded-full border border-border bg-background/50 px-2.5 py-1">
          Surfaces gaps, never verdicts
        </span>
        <span className="rounded-full border border-border bg-background/50 px-2.5 py-1">
          Your name on every win
        </span>
      </div>

      <button
        onClick={dismiss}
        className="mt-4 text-[11px] font-medium text-[color:var(--iris,#22d3ee)] hover:underline"
      >
        Got it →
      </button>
    </section>
  );
}
