import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Home,
  Megaphone,
  ListChecks,
  FileText,
  Sparkles,
  Library,
  PenLine,
  Feather,
} from "lucide-react";

export const BRAND = {
  navy: "#152540",
  gold: "#B8933C",
  bg: "#FAFAF8",
  text: "#1E1E1E",
  border: "#E8E3D8",
  fill: "#EAEEF4",
};

export const serif = { fontFamily: '"Cormorant Garamond", Georgia, serif' };

const NAV: Array<{ to: string; label: string; icon: any; badge?: number }> = [
  { to: "/demo", label: "Home", icon: Home },
  { to: "/demo/communications", label: "Leadership", icon: Megaphone, badge: 2 },
  { to: "/demo/queue", label: "Work Queue", icon: ListChecks },
  { to: "/demo/assignment", label: "Assignment", icon: FileText },
  { to: "/demo/workspace", label: "Workspace", icon: PenLine },
  { to: "/demo/intelligence", label: "IRIS", icon: Sparkles },
  { to: "/demo/archive", label: "Archive", icon: Library },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside
      className="fixed left-0 top-0 flex h-screen w-[180px] flex-col text-white"
      style={{ background: BRAND.navy }}
    >
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center gap-2">
          <Feather className="h-5 w-5" style={{ color: BRAND.gold }} />
          <div style={serif} className="text-2xl leading-none">ATLAS</div>
        </div>
        <div
          className="mt-2 text-[10px] font-medium tracking-[0.18em]"
          style={{ color: BRAND.gold }}
        >
          ATHENA STRATEGY GROUP
        </div>
      </div>
      <nav className="flex-1 px-2">
        {NAV.map((item) => {
          const active =
            item.to === "/demo"
              ? pathname === "/demo"
              : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="relative mb-0.5 flex items-center gap-3 rounded-sm px-4 py-2.5 text-[13px] transition-colors"
              style={
                active
                  ? {
                      background: "#fff",
                      color: BRAND.navy,
                      borderLeft: `3px solid ${BRAND.gold}`,
                      paddingLeft: "13px",
                    }
                  : { color: "rgba(255,255,255,0.78)" }
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                  style={{ background: BRAND.gold, color: BRAND.navy }}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-5 text-[10px] tracking-[0.16em] text-white/40">
        EST. MMXIX
      </div>
    </aside>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: BRAND.bg, color: BRAND.text }}>
      <Sidebar />
      <main className="ml-[180px]">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-8 border-b pb-6" style={{ borderColor: BRAND.border }}>
      {eyebrow ? (
        <div className="mb-2 text-[10px] font-semibold tracking-[0.22em]" style={{ color: BRAND.gold }}>
          {eyebrow}
        </div>
      ) : null}
      <h1 style={{ ...serif, color: BRAND.navy }} className="text-4xl leading-tight">
        {title}
      </h1>
      {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
    </header>
  );
}

export function Avatar({ name, tone = "navy" }: { name: string; tone?: "navy" | "gold" | "muted" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const bg = tone === "gold" ? BRAND.gold : tone === "muted" ? "#9CA9BD" : BRAND.navy;
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: bg }}
    >
      {initials}
    </span>
  );
}
