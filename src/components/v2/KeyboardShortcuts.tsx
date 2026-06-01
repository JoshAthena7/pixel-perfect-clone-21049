import { useEffect, useState } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function isTyping(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (open) setOpen(false);
        return;
      }

      if (e.key.toLowerCase() === "g") {
        gPressed = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 1200);
        return;
      }

      if (gPressed) {
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
        const k = e.key.toLowerCase();
        if (k === "h") navigate({ to: "/home" });
        else if (k === "q" && params.missionId) navigate({ to: "/missions/$missionId/questions", params: { missionId: params.missionId } });
        else if (k === "v" && params.missionId) navigate({ to: "/missions/$missionId/library", params: { missionId: params.missionId } });
        else if (k === "o" && params.missionId) navigate({ to: "/missions/$missionId/briefing", params: { missionId: params.missionId } });
        return;
      }

      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="earch" i]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [open, navigate, params.missionId, path]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl rounded-[12px] border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Reference</div>
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 p-5 text-sm">
          <Group title="Navigation">
            <Row keys={["g", "h"]} label="Go to The Atrium" />
            <Row keys={["g", "q"]} label="Go to Questions" />
            <Row keys={["g", "v"]} label="Go to The Vault" />
            <Row keys={["g", "o"]} label="Go to The Oracle" />
            <Row keys={["/"]} label="Focus search" />
          </Group>
          <Group title="Questions list">
            <Row keys={["J"]} label="Next question" />
            <Row keys={["K"]} label="Previous question" />
            <Row keys={["↵"]} label="Open selected" />
          </Group>
          <Group title="The Studio">
            <Row keys={["N"]} label="New note" />
            <Row keys={["R"]} label="Raise risk / flag" />
            <Row keys={["Esc"]} label="Back to Questions" />
          </Group>
          <Group title="Global">
            <Row keys={["?"]} label="Show this dialog" />
            <Row keys={["Esc"]} label="Close modal" />
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground/85 text-[13px]">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1.5 text-[10px] font-mono text-foreground/80">{k}</kbd>
        ))}
      </span>
    </div>
  );
}

export function ShortcutsHint() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 select-none rounded-full border border-border/60 bg-surface/80 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
      Shortcuts · Press <kbd className="ml-1 rounded border border-border bg-background px-1 font-mono">?</kbd>
    </div>
  );
}
