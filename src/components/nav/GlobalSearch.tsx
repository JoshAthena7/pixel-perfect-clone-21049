/**
 * Global Search Modal — Cmd+K / Ctrl+K from anywhere.
 *
 * Searches questions (current mission), team members (current mission), and
 * ORACLE intelligence in scope. Mission id is parsed from the URL path.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X, Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C49A2B";

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
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (t?.isContentEditable ?? false);
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (!typing && e.key === "/" && !e.metaKey && !e.ctrlKey && !open) {
        // optional: '/' opens too — skip to keep scope minimal
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

function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const missionId = useMissionIdFromPath();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const enabled = dq.trim().length > 0;
  const like = `%${dq.trim()}%`;

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
      // scope: platform OR NJ OR this mission
      if (missionId) {
        qy = qy.or(`scope_tier.eq.platform,state_code.eq.NJ,mission_id.eq.${missionId}`);
      } else {
        qy = qy.or(`scope_tier.eq.platform,state_code.eq.NJ`);
      }
      const { data } = await qy;
      return data ?? [];
    },
  });

  function go(to: string) {
    onClose();
    navigate({ to });
  }

  const hasResults = (questions.length + team.length + intel.length) > 0;

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
            placeholder="Search questions, team members, or intelligence..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "white", fontSize: 18,
            }}
          />
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 8 }}>
          {!enabled && (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>Quick Access</div>
              <QuickLink label="→ Flight Deck" onClick={() => missionId ? go(`/missions/${missionId}/flight-deck`) : go("/home")} />
              <QuickLink label="→ ATC" onClick={() => missionId ? go(`/missions/${missionId}/atc`) : go("/home")} />
              <QuickLink label="→ ORACLE" onClick={() => missionId ? go(`/missions/${missionId}/intelligence`) : go("/home")} />
            </div>
          )}

          {enabled && !hasResults && (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              No results for "{dq}"
            </div>
          )}

          {questions.length > 0 && (
            <Section label="Questions">
              {questions.map((qu: any) => (
                <ResultRow
                  key={qu.id}
                  onClick={() => go(`/missions/${missionId}/flight-deck?q=${qu.id}`)}
                >
                  <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, marginRight: 8 }}>
                    Q{qu.question_number}
                  </span>
                  <span style={{ color: "white", fontSize: 13 }}>
                    {String(qu.question_text ?? "").slice(0, 60)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                    {qu.status ?? "—"}
                  </span>
                </ResultRow>
              ))}
            </Section>
          )}

          {team.length > 0 && (
            <Section label="Team">
              {team.map((m: any) => (
                <ResultRow
                  key={m.id}
                  onClick={() => go(`/missions/${missionId}/atc?writer=${m.id}`)}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.1)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600, marginRight: 10,
                  }}>
                    {(m.name[0] ?? "?").toUpperCase()}
                  </span>
                  <span style={{ color: "white", fontSize: 13 }}>{m.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                    {m.role}
                  </span>
                </ResultRow>
              ))}
            </Section>
          )}

          {intel.length > 0 && (
            <Section label="Intelligence">
              {intel.map((s: any) => (
                <ResultRow
                  key={s.id}
                  onClick={() => go(missionId ? `/missions/${missionId}/intelligence?signal=${s.id}` : "/home")}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 600, color: GOLD, background: "rgba(196,154,43,0.12)",
                    border: "1px solid rgba(196,154,43,0.3)", padding: "2px 6px", borderRadius: 3,
                    marginRight: 8, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    ORACLE
                  </span>
                  <span style={{ color: "white", fontSize: 13 }}>
                    {String(s.title ?? "").slice(0, 55)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                    {s.category ?? ""} · {s.source_name ?? ""}
                  </span>
                </ResultRow>
              ))}
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
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)", padding: "6px 12px" }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 4,
        padding: "8px 12px", background: "transparent", border: "none",
        borderRadius: 6, textAlign: "left", cursor: "pointer", color: "white",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.7)", textAlign: "left", cursor: "pointer", fontSize: 13, padding: "4px 0" }}>
      {label}
    </button>
  );
}
