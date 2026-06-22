/**
 * Admin-only first-visit overlay for a mission. Suppressed permanently
 * (per user+mission, via localStorage) once dismissed OR once any of the
 * three setup conditions (RFP uploaded, ≥1 approved signal, ≥1 writer
 * assigned) is met. Writers and other non-admin roles never see it.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMissionAccess } from "@/hooks/useAccess";
import { firstVisitKey } from "@/lib/mission-landing";

const GOLD = "#C49A2B";

export function MissionWelcomeOverlay({ missionId }: { missionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: access } = useMissionAccess(missionId);
  const role = String(access?.role ?? "").toLowerCase();
  const isAdmin = access?.isAdmin ?? false;
  const isWriter = role === "writer" || role === "sme";

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

  // Admin-only. Writers never see this overlay.
  const isAdminVariant = !!access && isAdmin && !isWriter;

  // Check the three setup conditions. If any is already met, suppress
  // permanently — admin is past first-setup, doesn't need the nudge.
  const { data: setup } = useQuery({
    queryKey: ["mission-welcome-setup", missionId],
    enabled: !!userId && isAdminVariant,
    queryFn: async () => {
      const [rfp, signals, writers] = await Promise.all([
        supabase
          .from("mission_documents")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("document_type", "primary_rfp"),
        supabase
          .from("oracle_signals")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .in("status", ["approved", "pushed"]),
        supabase
          .from("mission_team_members")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .in("mission_role", ["writer", "lead_writer"]),
      ]);
      return {
        hasRfp: (rfp.count ?? 0) > 0,
        hasApprovedSignal: (signals.count ?? 0) > 0,
        hasWriter: (writers.count ?? 0) > 0,
      };
    },
  });

  useEffect(() => {
    if (!userId || !missionId || !isAdminVariant || !setup) return;
    const key = firstVisitKey(missionId, userId);
    try {
      if (localStorage.getItem(key)) return;
      // If any setup step is already done, suppress permanently and skip.
      if (setup.hasRfp || setup.hasApprovedSignal || setup.hasWriter) {
        localStorage.setItem(key, "true");
        return;
      }
      setOpen(true);
    } catch { /* ignore */ }
  }, [userId, missionId, isAdminVariant, setup]);

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

  if (!open || !userId || !isAdminVariant) return null;

  const missionCode =
    mission?.short_code || mission?.mission_code || mission?.name || "this mission";

  const persistKey = () => {
    try { localStorage.setItem(firstVisitKey(missionId, userId), "true"); } catch { /* ignore */ }
  };

  const goSignalReview = () => {
    persistKey();
    setOpen(false);
    navigate({ to: "/missions/$missionId/olympus", params: { missionId } });
  };

  const dismissForever = () => {
    persistKey();
    setOpen(false);
  };

  return (
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
        <div style={{ fontSize: 18, fontWeight: 600, color: "white", marginBottom: 16 }}>
          <span style={{ color: GOLD, marginRight: 6 }}>⚡</span>
          {`ATLAS is ready, ${firstName}.`}
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 16 }}>
          {missionCode} is live. Three things to do first:
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {[
            "Upload your RFP — IRIS reads every page automatically.",
            "Review extracted signals — approve what's accurate.",
            "Assign writers — they'll get briefed immediately.",
          ].map((node, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, fontSize: 13, color: "white", lineHeight: 1.8 }}>
              <span style={{ fontSize: 11, color: GOLD, fontFamily: "'Courier New', monospace", textAlign: "right" }}>
                {i + 1}
              </span>
              <span>{node}</span>
            </li>
          ))}
        </ol>
        <button
          onClick={goSignalReview}
          style={{
            marginTop: 20, width: "100%", height: 44,
            background: "rgba(196,154,43,0.9)", color: "#0D1B3E",
            fontSize: 14, fontWeight: 600, border: "none",
            borderRadius: 4, cursor: "pointer",
          }}
        >
          Go to Signal Review →
        </button>
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button
            onClick={dismissForever}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer" }}
          >
            Got it — don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
