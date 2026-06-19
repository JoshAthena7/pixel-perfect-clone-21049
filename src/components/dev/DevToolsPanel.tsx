/**
 * ATLAS Developer Tools — admin-only floating panel.
 *
 * Renders nothing for non-admins (gated by user_roles 'admin' check via the
 * existing has_role RPC). Lives below the PulseBar (z 9999) at z 9998 and
 * provides screen previews + quick actions an admin would otherwise be
 * redirected away from while signed in.
 */
import { useEffect, useMemo, useState } from "react";
import { Code, X } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/splash/SplashScreen";

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? "https://hqtmulghixcirvamdcol.supabase.co";

type ScreenCard = {
  id: string;
  name: string;
  description: string;
  kind: "iframe" | "navigate" | "splash";
  href?: string;
};

const SCREENS: ScreenCard[] = [
  { id: "login", name: "Login Screen", description: "Auth UI new users see", kind: "iframe", href: "/login?preview=1" },
  { id: "welcome", name: "Welcome", description: "Post-login welcome route (token-bound)", kind: "iframe", href: "/login?preview=1" },
  { id: "splash", name: "Splash Screen", description: "Constellation load animation", kind: "splash" },
  { id: "empty-mission", name: "Empty Mission", description: "Mission with zero setup — uses current mission", kind: "navigate" },
  { id: "empty-oracle", name: "Empty ORACLE", description: "Olympus with zero intel", kind: "navigate", href: "/olympus" },
  { id: "empty-flight-deck", name: "Empty Flight Deck", description: "Flight Deck with nothing assigned", kind: "navigate" },
];

const ROLE_KEY = "atlas_preview_role";
const SPLASH_KEY = "atlas_splash_shown";
const ROLES = ["Admin", "Engagement Lead", "Project Manager", "Writer", "SME", "Reviewer"] as const;
type Role = (typeof ROLES)[number];

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.rpc("has_role" as any, {
        _user_id: u.user.id,
        _role: "admin" as any,
      });
      if (alive) setIsAdmin(Boolean(data));
    })();
    return () => { alive = false; };
  }, []);
  return isAdmin;
}

function currentMissionId(pathname: string): string | null {
  const m = pathname.match(/\/missions\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function DevToolsPanel() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ScreenCard | null>(null);
  const [playSplash, setPlaySplash] = useState(false);
  const { pathname } = useLocation();
  const missionId = useMemo(() => currentMissionId(pathname), [pathname]);
  const [activeRole, setActiveRole] = useState<Role>("Admin");

  useEffect(() => {
    try {
      const r = sessionStorage.getItem(ROLE_KEY) as Role | null;
      if (r && ROLES.includes(r)) setActiveRole(r);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open && !preview && !playSplash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playSplash) setPlaySplash(false);
      else if (preview) setPreview(null);
      else if (open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, preview, playSplash]);

  if (!isAdmin) return null;

  const handleScreen = (s: ScreenCard) => {
    if (s.kind === "splash") {
      try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
      setPlaySplash(true);
      return;
    }
    if (s.kind === "navigate") {
      let href = s.href;
      if (!href) {
        if (!missionId) {
          toast.error("Open a mission first — that preview needs a mission context.");
          return;
        }
        if (s.id === "empty-mission") href = `/missions/${missionId}/briefing`;
        if (s.id === "empty-flight-deck") href = `/missions/${missionId}/flight-deck`;
      }
      if (href) window.location.assign(href);
      return;
    }
    setPreview(s);
  };

  const clearSplash = () => {
    try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
    toast.success("Splash will play on next page load.");
  };

  const resetSessionFlags = () => {
    try {
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("atlas_"));
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    toast.success("All session flags cleared.");
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied.`),
      () => toast.error("Clipboard unavailable."),
    );
  };

  const setRole = (role: Role) => {
    try {
      if (role === "Admin") sessionStorage.removeItem(ROLE_KEY);
      else sessionStorage.setItem(ROLE_KEY, role);
    } catch {}
    setActiveRole(role);
    if (role === "Admin") {
      toast.success("Reset to Admin. Reloading…");
      setTimeout(() => window.location.reload(), 400);
    } else {
      toast.success(`Now previewing as ${role}. Refresh to see role-specific UI.`);
    }
  };

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        aria-label="Developer Tools (Admin only)"
        title="Developer Tools (Admin only)"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9998,
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(196,154,43,0.15)",
          border: "1px solid rgba(196,154,43,0.4)",
          borderRadius: 6,
          cursor: "pointer",
          color: "#c9a84c",
        }}
      >
        <Code size={16} />
      </button>

      {/* Drawer */}
      <div
        role="dialog"
        aria-hidden={!open}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 460,
          background: "#050d18",
          borderTop: "1px solid rgba(196,154,43,0.3)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 200ms ease-out",
          zIndex: 9998,
          color: "rgba(255,255,255,0.85)",
          overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <span style={{ color: "#c9a84c", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
              ⚙ ATLAS Developer Tools
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
              Admin only · Not visible to writers
            </span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: "rgba(255,255,255,0.7)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <Section label="Screen Previewer" hint="Preview screens you can't normally see while logged in.">
            <div className="grid grid-cols-3 gap-2">
              {SCREENS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleScreen(s)}
                  className="text-left"
                  style={{
                    width: "100%",
                    minHeight: 72,
                    padding: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(196,154,43,0.6)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                >
                  <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, marginTop: 2 }}>{s.description}</div>
                  <div style={{ color: "#c9a84c", fontSize: 9, marginTop: 4 }}>Preview →</div>
                </button>
              ))}
            </div>
          </Section>

          <Section label="Quick Actions">
            <div className="flex flex-wrap gap-2">
              <Pill onClick={clearSplash}>Clear splash seen</Pill>
              <Pill onClick={resetSessionFlags}>Reset all dev flags</Pill>
              <Pill onClick={() => missionId ? copy(missionId, "Mission ID") : toast.error("Open a mission first.")}>
                Copy mission ID
              </Pill>
              <Pill onClick={() => copy(SUPABASE_URL, "Supabase URL")}>Copy Supabase URL</Pill>
              <Pill onClick={() => window.open("/ATLAS-ARCHITECTURE.md", "_blank")}>View ATLAS Architecture</Pill>
            </div>
          </Section>

          <Section label="Role Simulator" hint="Sets a sessionStorage flag. Components that consume it will render in that role. Resets on reload to Admin.">
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => {
                const active = activeRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      fontSize: 11,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: active ? "rgba(196,154,43,0.18)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? "rgba(196,154,43,0.6)" : "rgba(255,255,255,0.12)"}`,
                      color: active ? "#c9a84c" : "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
              <Pill onClick={() => setRole("Admin")}>Reset to Admin</Pill>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
              Note: only components wired to read <code>sessionStorage.atlas_preview_role</code> will respond. Real RLS is unchanged.
            </div>
          </Section>
        </div>
      </div>

      {/* Iframe preview overlay */}
      {preview && preview.kind === "iframe" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9997,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="flex items-center justify-between px-4"
            style={{ height: 48, background: "#0a0e1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div style={{ color: "white", fontSize: 13 }}>{preview.name}</div>
            <div className="flex items-center gap-3">
              <a
                href={preview.href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#c9a84c", fontSize: 11 }}
              >
                Open in new tab →
              </a>
              <button onClick={() => setPreview(null)} style={{ color: "white", fontSize: 11 }}>
                Close Preview
              </button>
            </div>
          </div>
          <iframe
            src={preview.href}
            title={preview.name}
            data-preview-mode="true"
            style={{ flex: 1, width: "100%", border: 0, background: "#000" }}
          />
        </div>
      )}

      {/* Splash playback */}
      {playSplash && <SplashScreen onDone={() => setPlaySplash(false)} />}
    </>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4, marginBottom: 8 }}>{hint}</div>}
      {!hint && <div style={{ height: 8 }} />}
      {children}
    </div>
  );
}

function Pill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "5px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.85)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
