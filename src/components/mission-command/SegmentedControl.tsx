import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center mb-4", className)}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: 3,
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="rounded-md transition-colors"
            style={{
              background: active ? "rgba(255,255,255,0.1)" : "transparent",
              color: active ? "white" : "rgba(255,255,255,0.55)",
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              padding: "5px 14px",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
