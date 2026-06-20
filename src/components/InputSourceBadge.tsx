import { Eye, User, CheckCircle2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type InputSource = "iris" | "you" | "iris-with-fallback";

const TOOLTIPS: Record<InputSource, string> = {
  iris: "IRIS generates this automatically — no input needed from you.",
  you: "You need to provide this — IRIS cannot determine it automatically.",
  "iris-with-fallback": "IRIS will draft this from available data. Review and edit before continuing.",
};

const IRIS_STYLE: React.CSSProperties = {
  background: "rgba(127,119,221,0.12)",
  border: "1px solid rgba(127,119,221,0.3)",
  color: "rgba(200,195,255,0.9)",
};
const YOU_STYLE: React.CSSProperties = {
  background: "rgba(196,154,43,0.12)",
  border: "1px solid rgba(196,154,43,0.3)",
  color: "#C49A2B",
};

export function InputSourceBadge({
  source,
  className,
}: {
  source: InputSource;
  className?: string;
}) {
  const isIris = source === "iris" || source === "iris-with-fallback";
  const label = isIris ? "IRIS" : "You";
  const style = isIris ? IRIS_STYLE : YOU_STYLE;
  const Icon = isIris ? Eye : User;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium shrink-0",
              className,
            )}
            style={{
              ...style,
              fontSize: 10,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 20,
              lineHeight: 1.2,
            }}
          >
            <Icon size={12} strokeWidth={2} />
            {label}
            {source === "iris-with-fallback" && (
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#C49A2B",
                  marginLeft: 2,
                }}
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          style={{
            background: "rgba(10,22,40,0.95)",
            color: "#fff",
            fontSize: 11,
            borderRadius: 6,
            padding: "6px 10px",
            maxWidth: 220,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {TOOLTIPS[source]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** A label row that flexes badge to the right and includes optional helper text below */
export function LabeledField({
  label,
  source,
  helper,
  filled,
  children,
  className,
}: {
  label: React.ReactNode;
  source: InputSource;
  helper?: string;
  /** If true, the helper text is hidden (because the field now has a value). */
  filled?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-[var(--athena-gold)] font-medium">
          {label}
        </span>
        <InputSourceBadge source={source} />
      </div>
      {helper && !filled && (
        <p className="hidden md:block text-[12px] italic text-muted-foreground">{helper}</p>
      )}
      {children}
    </div>
  );
}

/** Purple-tinted "what IRIS does" info card */
export function IrisInfoCard({
  title,
  items,
  className,
}: {
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-lg", className)}
      style={{
        background: "rgba(127,119,221,0.06)",
        border: "1px solid rgba(127,119,221,0.15)",
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Eye size={12} style={{ color: "rgba(200,195,255,0.9)" }} />
        <span style={{ color: "rgba(200,195,255,0.9)", fontSize: 11, fontWeight: 500 }}>
          {title}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[12px] text-muted-foreground flex gap-2">
            <span style={{ color: "rgba(200,195,255,0.7)" }}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Subtle "this step is all you" bar */
export function HumanOnlyInfoBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 16,
      }}
    >
      <User size={14} className="text-muted-foreground shrink-0" />
      <span className="text-[12px] text-muted-foreground">{children}</span>
    </div>
  );
}

/** Two pill meta-indicator: "X IRIS auto · Y you provide" */
export function StepMetaIndicator({
  irisCount,
  youCount,
  allYou,
  className,
}: {
  irisCount: number;
  youCount: number;
  allYou?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[12px]", className)}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
        style={IRIS_STYLE}
      >
        <Eye size={11} />
        {irisCount} IRIS auto
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
        style={YOU_STYLE}
      >
        <User size={11} />
        {allYou ? "all you" : `${youCount} you provide`}
      </span>
    </div>
  );
}

/** Green reactive confirmation bar (e.g. Territory) */
export function ConfirmationBar({
  ok,
  okText,
  pendingText,
}: {
  ok: boolean;
  okText: string;
  pendingText: string;
}) {
  if (ok) {
    return (
      <div
        className="flex items-center gap-2 text-[12px]"
        style={{
          background: "rgba(26,122,74,0.08)",
          border: "1px solid rgba(26,122,74,0.2)",
          borderRadius: 6,
          padding: "8px 12px",
          color: "rgba(120,220,170,0.95)",
        }}
      >
        <CheckCircle2 size={14} />
        <span>{okText}</span>
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-2 text-[12px]"
      style={{
        background: "rgba(196,154,43,0.06)",
        border: "1px solid rgba(196,154,43,0.2)",
        borderRadius: 6,
        padding: "8px 12px",
        color: "#C49A2B",
      }}
    >
      <AlertCircle size={14} />
      <span>{pendingText}</span>
    </div>
  );
}
