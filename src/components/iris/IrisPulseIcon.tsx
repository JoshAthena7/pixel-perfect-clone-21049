import type { IrisState } from "@/lib/iris/iris-types";
const COLOR: Record<IrisState, string> = {
  stable: "#22c55e", attention: "#f59e0b", intervention: "#ef4444", neutral: "#556070",
};
interface Props { state?: IrisState; size?: number; className?: string; }
export function IrisPulseIcon({ state = "neutral", size = 20, className = "" }: Props) {
  const c = COLOR[state];
  return (
    <span className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}>
      <span className="iris-ring-1 absolute inset-0 rounded-full border" style={{ borderColor: c, opacity: 0.4 }} />
      <span className="iris-ring-2 absolute inset-0 rounded-full border" style={{ borderColor: c, opacity: 0.2 }} />
      <span className="iris-core relative rounded-full" style={{
        width: size * 0.45, height: size * 0.45, background: c,
        boxShadow: `0 0 ${size * 0.5}px ${size * 0.15}px ${c}44`,
      }} />
    </span>
  );
}
