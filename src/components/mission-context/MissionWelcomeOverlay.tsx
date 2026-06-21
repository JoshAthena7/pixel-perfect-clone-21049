/**
 * FIVE-5 Steps 3-5: Role-specific first-login overlay.
 * Shown once per (user, mission) pair. Reads/writes localStorage.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMissionAccess } from "@/hooks/useAccess";
import { firstVisitKey, getMissionLandingSlug } from "@/lib/mission-landing";

const GOLD = "#C49A2B";

export function MissionWelcomeOverlay({ missionId }: { missionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: access } = useMissionAccess(missionId);
  const role = String(access?.role ?? "").toLowerCase();
  const isAdmin = access?.isAdmin ?? false;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      const { data: p } = await supabase
        .from("profiles").select("display_name").eq("id", u.id).maybeSingle();
      const name = (p?.display_name ?? u.email ?? "").split(" ")[0].split("@")[0];
      setFirstName(name || "there");
    })();
  }, []);

  useEffect(() => {
    if (!userId || !missionId) return;
    if (!access) return;
    try {
      const seen = localStorage.getItem(firstVisitKey(missionId, userId));
      if (!seen) setOpen(true);
    } catch { /* ignore */ }
  }, [userId, missionId, access]);

  const { data: mission } = useQuery({
    queryKey: ["mission-welcome-meta", missionId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name, short_code, mission_code")
        .eq("id", missionId)
        .maybeSingle();
      return data as { name?: string | null; short_code?: string | null; mission_code?: string | null } | null;
    },
  });

  const { data: leadName } = useQuery({
    queryKey: ["mission-lead-name", missionId],
    enabled: open && (role === "writer" || role === "sme"),
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", missionId)
        .eq("mission_role", "engagement_lead")
        .limit(1)
        .maybeSingle();
      if (!tm?.member_id) return null;
      const { data: prof } = await supabase
        .from("profiles").select("display_name").eq("id", tm.member_id).maybeSingle();
      return (prof?.display_name as string | undefined) ?? null;
    },
  });

  if (!open || !userId) return null;

  // Resolve effective role for which overlay to show.
  const effectiveRole = isAdmin ? "admin" : role;
  const variant: "writer" | "lead" | "admin" =
    effectiveRole === "writer" || effectiveRole === "sme" ? "writer"
    : effectiveRole === "engagement_lead" || effectiveRole === "project_manager" || effectiveRole === "lead" || effectiveRole === "pm" ? "lead"
    : "admin";

  const missionCode =
    mission?.short_code || mission?.mission_code || mission?.name || "this mission";

  const persistAndGo = (slug: string) => {
    try { localStorage.setItem(firstVisitKey(missionId, userId), "true"); } catch { /* ignore */ }
    setOpen(false);
    if (slug === "olympus") {
      navigate({ to: "/missions/$missionId/olympus", params: { missionId } });
    } else if (slug === "war-room") {
      navigate({ to: "/missions/$missionId/war-room", params: { missionId } });
    } else if (slug === "flight-deck") {
      navigate({ to: "/missions/$missionId/flight-deck", params: { missionId } });
    } else {
      navigate({ to: "/missions/$missionId/briefing", params: { missionId } });
    }
  };

  const dismissOnly = () => setOpen(false);

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          width: 460, maxWidth: "calc(100vw - 32px)",
          background: "#000308",
          border: `1px solid rgba(196,154,43,0.3)`,
          borderRadius: 8, padding: 32, color: "white",
        }}
      >
        {variant === "writer" && (
          <WriterContent
            firstName={firstName}
            missionCode={missionCode}
            leadName={leadName ?? null}
            onPrimary={() => persistAndGo("flight-deck")}
            onRemind={dismissOnly}
          />
        )}
        {variant === "lead" && (
          <LeadContent
            firstName={firstName}
            missionCode={missionCode}
            onPrimary={() => persistAndGo("war-room")}
            onRemind={dismissOnly}
          />
        )}
        {variant === "admin" && (
          <AdminContent
            firstName={firstName}
            missionCode={missionCode}
            onPrimary={() => persistAndGo("olympus")}
            onRemind={dismissOnly}
          />
        )}
      </div>
    </div>
  );

  return overlay;
}

function StepList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((node, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, fontSize: 13, color: "white", lineHeight: 1.8 }}>
          <span style={{ fontSize: 11, color: GOLD, fontFamily: "'Courier New', monospace", textAlign: "right" }}>
            {i + 1}
          </span>
          <span>{node}</span>
        </li>
      ))}
    </ol>
  );
}

function CheckList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((node, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, fontSize: 13, color: "white", lineHeight: 1.8 }}>
          <span style={{ fontSize: 12, color: "rgba(196,154,43,0.6)", textAlign: "right" }}>☐</span>
          <span>{node}</span>
        </li>
      ))}
    </ul>
  );
}

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 20, width: "100%", height: 44,
        background: "rgba(196,154,43,0.9)", color: "#0D1B3E",
        fontSize: 14, fontWeight: 600, border: "none",
        borderRadius: 4, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Remind({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ marginTop: 10, textAlign: "center" }}>
      <button
        onClick={onClick}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 9, cursor: "pointer" }}
      >
        Remind me on my next visit
      </button>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 18, fontWeight: 600, color: "white", marginBottom: 16 }}>
      <span style={{ color: GOLD, marginRight: 6 }}>⚡</span>{title}
    </div>
  );
}

function WriterContent({
  firstName, missionCode, leadName, onPrimary, onRemind,
}: {
  firstName: string; missionCode: string; leadName: string | null;
  onPrimary: () => void; onRemind: () => void;
}) {
  return (
    <>
      <Header title={`Welcome, ${firstName}.`} />
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 16 }}>
        You're a writer on {missionCode}.
      </p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
        Here's how this works:
      </p>
      <StepList items={[
        <>Your questions are assigned by {leadName ?? "your Engagement Lead"}.</>,
        <>Open a question — IRIS will brief you automatically.</>,
        <>Write your draft in Word or your usual tool.</>,
        <>Check in when you're done, stuck, or need help.</>,
      ]} />
      <PrimaryButton label="Go to My Questions →" onClick={onPrimary} />
      <Remind onClick={onRemind} />
    </>
  );
}

function LeadContent({
  firstName, missionCode, onPrimary, onRemind,
}: {
  firstName: string; missionCode: string;
  onPrimary: () => void; onRemind: () => void;
}) {
  return (
    <>
      <Header title={`Welcome to Mission Control, ${firstName}.`} />
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 16 }}>
        {missionCode} is live and ready.
      </p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
        Start here:
      </p>
      <CheckList items={[
        "Upload the RFP in Signal Review",
        "Assign questions to writers",
        "Set your North Star in the Briefing",
        "Share the mission link with your team",
      ]} />
      <PrimaryButton label="Open Mission Control →" onClick={onPrimary} />
      <Remind onClick={onRemind} />
    </>
  );
}

function AdminContent({
  firstName, missionCode, onPrimary, onRemind,
}: {
  firstName: string; missionCode: string;
  onPrimary: () => void; onRemind: () => void;
}) {
  return (
    <>
      <Header title={`ATLAS is ready, ${firstName}.`} />
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 16 }}>
        {missionCode} is live. Three things to do first:
      </p>
      <StepList items={[
        "Upload your RFP — IRIS reads every page automatically.",
        "Review extracted signals — approve what's accurate.",
        "Assign writers — they'll get briefed immediately.",
      ]} />
      <PrimaryButton label="Go to Signal Review →" onClick={onPrimary} />
      <Remind onClick={onRemind} />
    </>
  );
}
