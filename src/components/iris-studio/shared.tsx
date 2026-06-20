// Shared types and styling tokens for IRIS Studio tabs.
export const GOLD = "#C49A2B";
export const STUDIO_CARD =
  "bg-white/[0.03] border border-white/10 rounded-lg p-4";

export type TabSaveFn = (patch: Record<string, unknown>) => void;

export type IrisConfig = Record<string, unknown> & {
  mission_id: string;
};

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <div className=" tracking-[0.12em] text-[11px]" style={{ color: GOLD }}>
        {title}
      </div>
      {subtitle && <p className="text-[11px] text-white/50 mt-1">{subtitle}</p>}
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className=" tracking-[0.1em] text-[11px] mb-1.5" style={{ color: GOLD }}>
      {children}
    </div>
  );
}

export function FieldDesc({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-white/45 mb-2">{children}</p>;
}
