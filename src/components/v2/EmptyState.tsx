import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  DoorOpen,
  Rocket,
  Vault,
  Eye,
  Clipboard,
  CheckCircle2,
  MessageSquare,
  Users,
  GitFork,
  ShieldCheck,
  Lightbulb,
  Phone,
  WifiOff,
  AlertTriangle,
  Inbox,
} from "lucide-react";

type Variant = "default" | "iris" | "green" | "warning";

export type EmptyStateAction = {
  label: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: EmptyStateAction[];
  variant?: Variant;
  className?: string;
}

const iconMap = {
  door: DoorOpen,
  rocket: Rocket,
  vault: Vault,
  oracle: Eye,
  clipboard: Clipboard,
  check: CheckCircle2,
  message: MessageSquare,
  people: Users,
  decision: GitFork,
  shield: ShieldCheck,
  lightbulb: Lightbulb,
  phone: Phone,
  wifi: WifiOff,
  warning: AlertTriangle,
  inbox: Inbox,
} as const;

export type EmptyIconName = keyof typeof iconMap;

export function EmptyIcon({ name }: { name: EmptyIconName }) {
  const Icon = iconMap[name];
  return <Icon size={40} strokeWidth={1.5} />;
}

function ActionButton({ a }: { a: EmptyStateAction }) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors";
  const styles =
    a.variant === "ghost"
      ? "border border-border text-foreground hover:bg-muted/40"
      : "bg-foreground text-background hover:opacity-90";
  const cls = `${base} ${styles}`;
  if (a.to) return <Link to={a.to} className={cls}>{a.label}</Link>;
  if (a.href) return <a href={a.href} className={cls}>{a.label}</a>;
  return <button type="button" onClick={a.onClick} className={cls}>{a.label}</button>;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  variant = "default",
  className = "",
}: EmptyStateProps) {
  const isIris = variant === "iris";
  const isGreen = variant === "green";
  const isWarning = variant === "warning";

  const wrapperStyle: React.CSSProperties = {
    textAlign: "center",
    padding: "48px 24px",
    maxWidth: 320,
    margin: "0 auto",
    ...(isGreen
      ? {
          background: "rgba(34,197,94,0.04)",
          borderRadius: 12,
          padding: 24,
        }
      : {}),
  };

  const titleColor = isIris
    ? "var(--iris)"
    : isGreen
    ? "var(--green)"
    : isWarning
    ? "var(--amber, #f59e0b)"
    : "var(--foreground)";

  return (
    <div className={className} style={wrapperStyle}>
      {isIris ? (
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <span
            className="iris-pulse-dot"
            style={{ width: 14, height: 14, borderRadius: 999, display: "inline-block" }}
            aria-hidden
          />
        </div>
      ) : icon ? (
        <div
          style={{
            marginBottom: 16,
            opacity: 0.4,
            color: "var(--muted-foreground)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: titleColor,
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: 13,
            color: isIris ? "var(--iris)" : "var(--muted-foreground)",
            lineHeight: 1.6,
            marginBottom: actions && actions.length ? 20 : 0,
            opacity: isIris ? 0.9 : 1,
          }}
        >
          {description}
        </div>
      )}

      {actions && actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {actions.map((a, i) => (
            <ActionButton key={i} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
