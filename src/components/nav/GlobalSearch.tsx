/**
 * Global Search Modal — Cmd+K / Ctrl+K from anywhere.
 *
 * Layered:
 *   1. Intent recognition (Quick Action) — natural-language → modal/navigate/info
 *   2. Database search — questions, team, ORACLE intelligence
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X, Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C49A2B";

/* ───────────────────── Intent layer ───────────────────── */

type ModalKey = "checkin" | "score_me" | "sticky_notes" | "mission_pulse";
type NavKey = "flight_deck" | "atc" | "oracle" | "briefing" | "setup_wizard";

type IntentAction =
  | { type: "open_modal"; modal: ModalKey; label: string; icon: string; description: string }
  | { type: "navigate"; destination: NavKey; label: string; icon: string; description: string }
  | { type: "info"; key: "deadline"; label: string; icon: string; description: string };

const INTENT_PATTERNS: { patterns: string[]; action: IntentAction }[] = [
  { patterns: ["check in", "checkin", "check-in", "status update", "update status"],
    action: { type: "open_modal", modal: "checkin", label: "Open Check-In", icon: "●", description: "Report your status on a question" } },
  { patterns: ["score", "score me", "score my draft", "evaluate", "rate my"],
    action: { type: "open_modal", modal: "score_me", label: "Score My Draft", icon: "🎯", description: "Get IRIS feedback on your draft" } },
  { patterns: ["sticky note", "note", "pin a note", "add note", "leave note"],
    action: { type: "open_modal", modal: "sticky_notes", label: "Open Sticky Notes", icon: "📌", description: "Pin a note to your current question" } },
  { patterns: ["pulse", "signal", "send signal", "mission pulse"],
    action: { type: "open_modal", modal: "mission_pulse", label: "Send Mission Signal", icon: "◉", description: "Share an intel signal with the team" } },
  { patterns: ["sos", "help", "need sme", "stuck", "blocked"],
    action: { type: "navigate", destination: "flight_deck", label: "Go to Flight Deck — Check In as Blocked", icon: "🆘", description: "Flag that you need help" } },
  { patterns: ["atc", "air traffic", "team", "who is working", "radar"],
    action: { type: "navigate", destination: "atc", label: "Open ATC", icon: "⚡", description: "See what the team is doing right now" } },
  { patterns: ["oracle", "intelligence", "intel", "what does iris know"],
    action: { type: "navigate", destination: "oracle", label: "Open ORACLE", icon: "⚡", description: "Browse mission intelligence" } },
  { patterns: ["brief", "briefing", "north star", "win themes", "strategy"],
    action: { type: "navigate", destination: "briefing", label: "Open Briefing Room", icon: "📋", description: "Review mission strategy and brief" } },
  { patterns: ["setup", "wizard", "upload documents", "fuel iris", "analyze"],
    action: { type: "navigate", destination: "setup_wizard", label: "Open Setup Wizard", icon: "🚀", description: "Upload documents and fuel IRIS" } },
  { patterns: ["deadline", "submission", "due date", "how long", "days left"],
    action: { type: "info", key: "deadline", label: "Submission Deadline", icon: "📅", description: "Loading…" } },
];

function parseSearchIntent(query: string): IntentAction | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const { patterns, action } of INTENT_PATTERNS) {
    if (patterns.some((p) => q.includes(p))) return action;
  }
  return null;
}

/* ───────────────────── Mount + hotkey ───────────────────── */

function useMissionIdFromPath(): string | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const m = pathname.match(/\/missions\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onCustom() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("atlas:global-search:open", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas:global-search:open", onCustom);
    };
  }, [open]);

  if (!open) return null;
  return <SearchModal onClose={() => setOpen(false)} />;
}

/* ───────────────────── Modal ───────────────────── */

type Row =
  | { kind: "intent"; action: IntentAction }
  | { kind: "question"; data: any }
  | { kind: "team"; data: any }
  | { kind: "intel"; data: any };

function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const missionId = useMissionIdFromPath();
  const [highlight, setHighlight] = useState(0);
  const [inlineInfo, setInlineInfo] = useState<string | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHighlight(0); setInlineInfo(null); }, [dq]);

  const enabled = dq.trim().length > 0;
  const like = `%${dq.trim()}%`;
  const intent = useMemo(() => parseSearchIntent(dq), [dq]);

  // Mission meta for "deadline" info intent.
  const { data: missionMeta } = useQuery({
    queryKey: ["gsearch-mission-meta", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("submission_deadline, name")
        .eq("id", missionId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["gsearch-questions", missionId, dq],
    enabled: enabled && !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_questions")
        .select("id, question_number, question_text, status")
        .eq("mission_id", missionId!)
        .or(`question_number.ilike.${like},question_text.ilike.${like}`)
        .limit(5);
      return data ?? [];
    },
  });

  const { data: team = [] } = useQuery({
    queryKey: ["gsearch-team", missionId, dq],
    enabled: enabled && !!missionId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("mission_team_members")
        .select("member_id, mission_role, atlas_team_members:member_id(first_name, last_name, email)")
        .eq("mission_id", missionId!);
      const ql = dq.trim().toLowerCase();
      return (rows ?? [])
        .map((r: any) => {
          const a = r.atlas_team_members ?? {};
          const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
          return { id: r.member_id, name: name || "Team Member", email: a.email ?? "", role: r.mission_role };
        })
        .filter((m: any) => m.name.toLowerCase().includes(ql) || (m.email ?? "").toLowerCase().includes(ql))
        .slice(0, 3);
    },
  });

  const { data: intel = [] } = useQuery({
    queryKey: ["gsearch-oracle", missionId, dq],
    enabled,
    queryFn: async () => {
      let qy = supabase
        .from("oracle_signals")
        .select("id, title, what_happened, source_name, category, scope_tier, state_code, mission_id")
        .neq("status", "dismissed")
        .or(`title.ilike.${like},what_happened.ilike.${like},source_name.ilike.${like}`)
        .limit(5);
      if (missionId) qy = qy.or(`scope_tier.eq.platform,state_code.eq.NJ,mission_id.eq.${missionId}`);
      else qy = qy.or(`scope_tier.eq.platform,state_code.eq.NJ`);
      const { data } = await qy;
      return data ?? [];
    },
  });

  // Flat list of selectable rows in render order (for arrow-key nav).
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (intent) out.push({ kind: "intent", action: intent });
    questions.forEach((d: any) => out.push({ kind: "question", data: d }));
    team.forEach((d: any) => out.push({ kind: "team", data: d }));
    intel.forEach((d: any) => out.push({ kind: "intel", data: d }));
    return out;
  }, [intent, questions, team, intel]);

  function go(to: string) { onClose(); navigate({ to }); }

  function runIntent(action: IntentAction) {
    if (action.type === "open_modal") {
      // Custom event — flight-deck assist bar can listen; otherwise navigate
      // user to Flight Deck so the modal is reachable.
      window.dispatchEvent(new CustomEvent(`atlas:assist:${action.modal}`));
      if (missionId) go(`/missions/${missionId}/flight-deck`);
      else onClose();
      return;
    }
    if (action.type === "navigate") {
      if (!missionId && action.destination !== "setup_wizard") { go("/home"); return; }
      const map: Record<NavKey, string> = {
        flight_deck: `/missions/${missionId}/flight-deck`,
        atc: `/missions/${missionId}/war-room`,
        oracle: `/missions/${missionId}/intelligence`,
        briefing: `/missions/${missionId}/briefing`,
        setup_wizard: missionId ? `/missions/${missionId}/setup` : "/home",
      };
      go(map[action.destination]);
      return;
    }
    if (action.type === "info" && action.key === "deadline") {
      const sd = missionMeta?.submission_deadline as string | null | undefined;
      if (!sd) { setInlineInfo("No submission deadline set."); return; }
      const days = Math.max(0, Math.ceil((new Date(sd).getTime() - Date.now()) / 86400000));
      setInlineInfo(`${new Date(sd).toLocaleDateString()} — ${days} day${days === 1 ? "" : "s"} remaining`);
    }
  }

  function selectRow(r: Row) {
    if (r.kind === "intent") return runIntent(r.action);
    if (r.kind === "question") return go(`/missions/${missionId}/flight-deck?q=${r.data.id}`);
    if (r.kind === "team") return go(`/missions/${missionId}/war-room?writer=${r.data.id}`);
    if (r.kind === "intel") return go(missionId ? `/missions/${missionId}/intelligence?signal=${r.data.id}` : "/home");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && rows[highlight]) { e.preventDefault(); selectRow(rows[highlight]); }
  }

  const hasResults = rows.length > 0;
  let idx = 0;
  const nextIdx = () => idx++;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 640,
          background: "#0d1320", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SearchIcon size={18} style={{ color: "rgba(255,255,255,0.5)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or try 'check in', 'score me', 'atc'…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "white", fontSize: 18 }}
          />
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 8 }}>
          {!enabled && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>Try</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                "check in" · "score me" · "find Q4.16" · "who owns section 4" · "atc" · "oracle" · "deadline"
              </div>
            </div>
          )}

          {intent && (
            <div style={{ padding: "6px 4px" }}>
              <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 1.2, color: GOLD, padding: "6px 12px", fontWeight: 700 }}>
                Quick Action
              </div>
              <IntentRow
                action={intent}
                highlighted={highlight === 0}
                onHover={() => setHighlight(0)}
                onClick={() => runIntent(intent)}
              />
              {inlineInfo && (
                <div style={{ padding: "6px 14px 10px", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
                  {inlineInfo}
                </div>
              )}
            </div>
          )}

          {enabled && !hasResults && (
            <div style={{ padding: 20, color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center" }}>
              <div>No results for "{dq}"</div>
              <div style={{ marginTop: 10, fontSize: 10 }}>
                Try: "check in" · "score me" · "find Q4.16" · "who owns section 4" · "deadline"
              </div>
            </div>
          )}

          {questions.length > 0 && (
            <Section label="Questions">
              {questions.map((qu: any) => {
                const i = (intent ? 1 : 0) + nextIdx();
                return (
                  <ResultRow key={qu.id} highlighted={highlight === i} onHover={() => setHighlight(i)}
                    onClick={() => go(`/missions/${missionId}/flight-deck?q=${qu.id}`)}>
                    <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, marginRight: 8 }}>Q{qu.question_number}</span>
                    <span style={{ color: "white", fontSize: 13 }}>{String(qu.question_text ?? "").slice(0, 60)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{qu.status ?? "—"}</span>
                  </ResultRow>
                );
              })}
            </Section>
          )}

          {team.length > 0 && (
            <Section label="Team">
              {team.map((m: any) => {
                const i = (intent ? 1 : 0) + nextIdx();
                return (
                  <ResultRow key={m.id} highlighted={highlight === i} onHover={() => setHighlight(i)}
                    onClick={() => go(`/missions/${missionId}/war-room?writer=${m.id}`)}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, marginRight: 10 }}>
                      {(m.name[0] ?? "?").toUpperCase()}
                    </span>
                    <span style={{ color: "white", fontSize: 13 }}>{m.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{m.role}</span>
                  </ResultRow>
                );
              })}
            </Section>
          )}

          {intel.length > 0 && (
            <Section label="Intelligence">
              {intel.map((s: any) => {
                const i = (intent ? 1 : 0) + nextIdx();
                return (
                  <ResultRow key={s.id} highlighted={highlight === i} onHover={() => setHighlight(i)}
                    onClick={() => go(missionId ? `/missions/${missionId}/intelligence?signal=${s.id}` : "/home")}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: GOLD, background: "rgba(196,154,43,0.12)", border: "1px solid rgba(196,154,43,0.3)", padding: "2px 6px", borderRadius: 3, marginRight: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>ORACLE</span>
                    <span style={{ color: "white", fontSize: 13 }}>{String(s.title ?? "").slice(0, 55)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{s.category ?? ""} · {s.source_name ?? ""}</span>
                  </ResultRow>
                );
              })}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)", padding: "6px 12px" }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({ children, onClick, highlighted, onHover }: { children: React.ReactNode; onClick: () => void; highlighted?: boolean; onHover?: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 4,
        padding: "8px 12px",
        background: highlighted ? "rgba(255,255,255,0.06)" : "transparent",
        border: "none", borderRadius: 6, textAlign: "left", cursor: "pointer", color: "white",
      }}
    >
      {children}
    </button>
  );
}

function IntentRow({ action, highlighted, onClick, onHover }: { action: IntentAction; highlighted: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px",
        background: highlighted ? "rgba(196,154,43,0.16)" : "rgba(196,154,43,0.08)",
        borderLeft: `2px solid ${GOLD}`,
        borderTop: "none", borderRight: "none", borderBottom: "none",
        borderRadius: 4, textAlign: "left", cursor: "pointer", color: "white",
      }}
    >
      <span style={{ color: GOLD, fontSize: 16, lineHeight: 1, width: 18, textAlign: "center" }}>⚡</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>{action.label}</span>
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{action.description}</span>
      </span>
      <span style={{ color: GOLD, fontSize: 16 }}>→</span>
    </button>
  );
}
