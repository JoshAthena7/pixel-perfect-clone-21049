import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const KEY = (missionId: string, id: string) => `atlas_overview_section_${missionId}_${id}`;

export function CollapsibleSection({
  id,
  title,
  missionId,
  defaultOpen = true,
  right,
  badge,
  children,
}: {
  id: string;
  title: string;
  missionId: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const raw =
        typeof window !== "undefined" ? window.localStorage.getItem(KEY(missionId, id)) : null;
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY(missionId, id), open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, id, missionId]);

  return (
    <section
      id={id}
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 16,
      }}
    >
      <header
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-white/50" />
        ) : (
          <ChevronRight className="h-4 w-4 text-white/50" />
        )}
        <h2 className="text-white text-[14px] font-medium tracking-tight">{title}</h2>
        {badge}
        <div className="flex-1" />
        {right && (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
            {right}
          </div>
        )}
      </header>
      {open && <div className="p-4">{children}</div>}
    </section>
  );
}
