import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapNarrativeStructure } from "@/lib/oracle/map-narrative-structure.functions";
import { pregenerateNarrativeBriefs } from "@/lib/oracle/generate-narrative-brief.functions";

const GOLD = "#C9972B";
const BLUE = "#7aa7d6";
const GREEN = "#22c55e";
const PURPLE = "#a78bfa";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const STEEL = "rgba(255,255,255,0.55)";
const PANEL = "#071322";
const CARD = "#0a1828";

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  opens_thread:    { label: "OPENS",   color: "#0b0b0b", bg: GOLD },
  advances_thread: { label: "BUILDS",  color: BLUE,    bg: "transparent" },
  closes_thread:   { label: "CLOSES",  color: GREEN,   bg: "transparent" },
  bridges:         { label: "BRIDGES", color: PURPLE,  bg: "transparent" },
  standalone:      { label: "FORM",    color: STEEL,   bg: "transparent" },
};

type WinTheme = { title: string; description: string };
type Question = {
  id: string;
  question_number: string | null;
  question_text: string | null;
  primary_win_theme: string | null;
  secondary_win_theme: string | null;
  narrative_role: string | null;
  evaluation_weight: number | null;
  point_value: number | null;
  section_id: string | null;
  is_withdrawn: boolean | null;
};

function parseWinThemes(raw: unknown): WinTheme[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any, i: number) => {
    if (typeof t === "string") {
      const [title, ...rest] = t.split(/\s+[—–-]\s+/);
      return { title: (title ?? `Theme ${i + 1}`).trim(), description: rest.join(" — ").trim() };
    }
    const text =
      typeof t?.text === "string" ? t.text
      : typeof t?.title === "string" ? t.title
      : typeof t?.label === "string" ? t.label
      : "";
    const [tp, ...rest] = text.split(/\s+[—–-]\s+/);
    return {
      title: (tp ?? `Theme ${i + 1}`).trim(),
      description:
        rest.join(" — ").trim() ||
        (typeof t?.description === "string" ? t.description : "") ||
        (typeof t?.rationale === "string" ? t.rationale : ""),
    };
  });
}

function roleOrder(role: string | null): number {
  if (role === "opens_thread") return 0;
  if (role === "advances_thread") return 1;
  if (role === "bridges") return 2;
  if (role === "closes_thread") return 3;
  return 9;
}

export function StoryMapTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const mapFn = useServerFn(mapNarrativeStructure);
  const pregenFn = useServerFn(pregenerateNarrativeBriefs);
  const [running, setRunning] = useState<null | "map" | "briefs">(null);
  const [status, setStatus] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["story-map", missionId],
    queryFn: async () => {
      const [{ data: qs }, { data: cfg }, { data: nodes }, { data: edges }] = await Promise.all([
        supabase
          .from("mission_questions")
          .select(
            "id, question_number, question_text, primary_win_theme, secondary_win_theme, narrative_role, evaluation_weight, point_value, section_id, is_withdrawn",
          )
          .eq("mission_id", missionId)
          .eq("is_withdrawn", false),
        supabase
          .from("oracle_engagement_config")
          .select("win_themes, north_star, central_claim")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase
          .from("intelligence_graph_nodes")
          .select("id, node_type, metadata")
          .eq("mission_id", missionId)
          .eq("node_type", "requirement")
          .eq("is_active", true),
        supabase
          .from("intelligence_graph_edges")
          .select("source_node_id, target_node_id, relationship_type, strength")
          .eq("mission_id", missionId)
          .eq("relationship_type", "shares_narrative_thread"),
      ]);
      return {
        questions: (qs ?? []) as Question[],
        themes: parseWinThemes((cfg as any)?.win_themes),
        northStar: (cfg as any)?.north_star ?? "",
        centralClaim: (cfg as any)?.central_claim ?? "",
        nodes: (nodes ?? []) as any[],
        edges: (edges ?? []) as any[],
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const { questions, themes } = data;

    // Group questions by primary theme (case-insensitive title match)
    const themesByKey = new Map<string, WinTheme>();
    themes.forEach((t) => themesByKey.set(t.title.toLowerCase(), t));

    const columns = themes.map((t) => ({
      theme: t,
      questions: questions
        .filter((q) => (q.primary_win_theme ?? "").toLowerCase() === t.title.toLowerCase())
        .sort((a, b) => {
          const r = roleOrder(a.narrative_role) - roleOrder(b.narrative_role);
          if (r !== 0) return r;
          return (a.question_number ?? "").localeCompare(b.question_number ?? "", undefined, { numeric: true });
        }),
    }));

    const unmapped = questions.filter(
      (q) =>
        !q.primary_win_theme ||
        !themesByKey.has(q.primary_win_theme.toLowerCase()),
    );

    // Thread peers map: questionId -> Set<questionId>
    const qIdByNodeId = new Map<string, string>();
    data.nodes.forEach((n: any) => {
      const qid = n?.metadata?.question_id;
      if (typeof qid === "string") qIdByNodeId.set(n.id, qid);
    });
    const peers = new Map<string, Set<string>>();
    data.edges.forEach((e: any) => {
      const a = qIdByNodeId.get(e.source_node_id);
      const b = qIdByNodeId.get(e.target_node_id);
      if (!a || !b) return;
      if (!peers.has(a)) peers.set(a, new Set());
      if (!peers.has(b)) peers.set(b, new Set());
      peers.get(a)!.add(b);
      peers.get(b)!.add(a);
    });

    const totalMapped = questions.filter((q) => q.primary_win_theme).length;
    const threadCount = columns.filter((c) => c.questions.length > 0).length;

    return { columns, unmapped, peers, totalQuestions: questions.length, totalMapped, threadCount };
  }, [data]);

  async function handleRemap() {
    if (running) return;
    setRunning("map");
    setStatus("Mapping story structure…");
    try {
      const r = await mapFn({ data: { missionId, force: true } });
      setStatus(`Mapped ${(r as any).mapped ?? 0} questions. Pre-generating briefs…`);
      qc.invalidateQueries({ queryKey: ["story-map", missionId] });
      toast.success("Story structure re-mapped");
    } catch (e: any) {
      toast.error(e?.message ?? "Re-map failed");
    } finally {
      setRunning(null);
      setStatus("");
    }
  }

  async function handleGenerateBriefs() {
    if (running) return;
    setRunning("briefs");
    setStatus("Generating narrative briefs…");
    try {
      const r: any = await pregenFn({ data: { missionId } });
      toast.success(`Generated ${r?.generated ?? 0} briefs (${r?.skipped ?? 0} cached)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Brief generation failed");
    } finally {
      setRunning(null);
      setStatus("");
    }
  }

  if (isLoading || !data || !view) {
    return <div style={{ padding: 32, color: STEEL }}>Loading story map…</div>;
  }

  // Empty states
  if (data.themes.length === 0) {
    return (
      <EmptyBox
        title="Win themes not configured"
        body="Win themes must be configured in Strategy Setup before IRIS can map the story structure."
      />
    );
  }
  if (view.totalMapped === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>
          Story mapping hasn't run yet.
        </div>
        <div style={{ color: STEEL, maxWidth: 480, margin: "0 auto 20px", fontSize: 13, lineHeight: 1.6 }}>
          IRIS needs to read your questions and map them to your win themes before the story
          architecture is visible.
        </div>
        <button onClick={handleRemap} disabled={running !== null} style={goldBtn(true)}>
          ⚡ {running === "map" ? "Mapping…" : "Map Story Structure Now"}
        </button>
        {status && <div style={{ marginTop: 12, color: STEEL, fontSize: 11 }}>{status}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 8px", color: "rgba(255,255,255,0.92)" }}>
      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.18em", color: GOLD, textTransform: "", marginBottom: 8 }}>
          The One Story
        </div>
        <div
          style={{
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            color: GOLD,
            fontSize: 22,
            lineHeight: 1.4,
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          {data.centralClaim || data.northStar || "(central claim not set)"}
        </div>
        <div
          style={{
            height: 1,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            margin: "18px auto 12px",
            maxWidth: 600,
          }}
        />
        <div style={{ fontSize: 11, color: STEEL, letterSpacing: "0.06em" }}>
          {view.totalQuestions} questions · {data.themes.length} win themes · {view.threadCount} narrative threads
        </div>
      </div>

      {/* COLUMNS */}
      <div
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          paddingBottom: 14,
          marginBottom: 32,
        }}
        className="story-map-columns"
      >
        {view.columns.map((col) => (
          <ThemeColumn
            key={col.theme.title}
            theme={col.theme}
            questions={col.questions}
            peers={view.peers}
            onRemap={handleRemap}
            running={running}
          />
        ))}
        {view.unmapped.length > 0 && (
          <UnmappedColumn questions={view.unmapped} />
        )}
      </div>

      {/* THREAD ANALYSIS */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: GOLD, textTransform: "", marginBottom: 4 }}>
          Thread Analysis
        </div>
        <div style={{ fontSize: 12, color: STEEL, marginBottom: 14 }}>
          How strong is each narrative thread?
        </div>
        <ThreadTable columns={view.columns} />
      </div>

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={handleRemap} disabled={running !== null} style={goldBtn(false)}>
          ⚡ {running === "map" ? "Re-mapping…" : "Re-map All Questions"}
        </button>
        <button onClick={handleGenerateBriefs} disabled={running !== null} style={goldBtn(false)}>
          📖 {running === "briefs" ? "Generating…" : "Generate All Narrative Briefs"}
        </button>
        {status && <span style={{ fontSize: 11, color: STEEL }}>{status}</span>}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .story-map-columns { flex-direction: column !important; overflow-x: visible !important; }
        }
      `}</style>
    </div>
  );
}

function ThemeColumn({
  theme,
  questions,
  peers,
  onRemap,
  running,
}: {
  theme: WinTheme;
  questions: Question[];
  peers: Map<string, Set<string>>;
  onRemap: () => void;
  running: null | "map" | "briefs";
}) {
  const nonStandalone = questions.filter((q) => q.narrative_role !== "standalone");
  const opens = questions.some((q) => q.narrative_role === "opens_thread");
  const closes = questions.some((q) => q.narrative_role === "closes_thread");
  const idx = (id: string) => questions.findIndex((q) => q.id === id);

  return (
    <div
      style={{
        flex: "0 0 280px",
        background: PANEL,
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 700, color: GOLD }}>{theme.title}</div>
      {theme.description && (
        <div
          style={{
            fontSize: 11,
            color: STEEL,
            lineHeight: 1.4,
            marginBottom: 8,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {theme.description}
        </div>
      )}
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "",
          color: STEEL,
          marginBottom: 12,
        }}
      >
        {questions.length} question{questions.length === 1 ? "" : "s"}
      </div>

      {questions.length === 0 ? (
        <div style={{ fontSize: 11, color: STEEL, fontStyle: "italic", padding: "8px 0" }}>No questions yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          {/* render non-standalone first */}
          {nonStandalone.map((q) => {
            const peerSet = peers.get(q.id);
            const hasPeerHere = peerSet ? Array.from(peerSet).some((pid) => idx(pid) > -1) : false;
            return <QCard key={q.id} q={q} threadIndicator={hasPeerHere} />;
          })}
          {questions.some((q) => q.narrative_role === "standalone") &&
            nonStandalone.length > 0 && (
              <div
                style={{
                  margin: "6px 0",
                  height: 1,
                  background: "rgba(255,255,255,0.08)",
                }}
              />
            )}
          {questions
            .filter((q) => q.narrative_role === "standalone")
            .map((q) => (
              <QCard key={q.id} q={q} threadIndicator={false} />
            ))}
        </div>
      )}

      {/* Gap indicator */}
      <div style={{ marginTop: 10 }}>
        {questions.length === 0 && (
          <GapPill color={RED} text="No questions mapped here" actionLabel="Map questions →" onAction={onRemap} disabled={running !== null} />
        )}
        {questions.length > 0 && questions.length < 2 && (
          <GapPill color={AMBER} text="Thin coverage" />
        )}
        {questions.length >= 2 && (!opens || !closes) && (
          <GapPill color={AMBER} text={!opens ? "No opening" : "No closing"} />
        )}
        {questions.length > 0 && nonStandalone.length === 0 && (
          <GapPill color={RED} text="All standalone — no narrative" />
        )}
      </div>
    </div>
  );
}

function QCard({ q, threadIndicator }: { q: Question; threadIndicator: boolean }) {
  const meta = ROLE_META[q.narrative_role ?? "standalone"] ?? ROLE_META.standalone;
  return (
    <div
      style={{
        background: CARD,
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: "8px 10px",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "2px 6px",
            borderRadius: 3,
            background: meta.bg === "transparent" ? "transparent" : meta.bg,
            color: meta.color,
            border: meta.bg === "transparent" ? `1px solid ${meta.color}88` : "none",
          }}
        >
          {meta.label}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            border: `1px solid ${GOLD}55`,
            color: GOLD,
            borderRadius: 3,
          }}
        >
          {q.question_number ?? "?"}
        </span>
        {(q.evaluation_weight ?? q.point_value) != null && (
          <span style={{ fontSize: 9, color: STEEL }}>
            {q.evaluation_weight ?? q.point_value} pts
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.85)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={q.question_text ?? ""}
      >
        {(q.question_text ?? "").slice(0, 90)}
        {q.question_text && q.question_text.length > 90 ? "…" : ""}
      </div>
      {q.secondary_win_theme && (
        <div style={{ marginTop: 6 }}>
          <span
            style={{
              fontSize: 8,
              padding: "1px 5px",
              border: `1px solid ${AMBER}77`,
              color: AMBER,
              borderRadius: 3,
              letterSpacing: "0.04em",
            }}
            title={`Also serves: ${q.secondary_win_theme}`}
          >
            +{q.secondary_win_theme.slice(0, 18)}
          </span>
        </div>
      )}
      {threadIndicator && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: -4,
            bottom: 0,
            width: 3,
            background: `${GOLD}55`,
            borderRadius: 2,
          }}
          title="Connected to other questions in this thread"
        />
      )}
    </div>
  );
}

function UnmappedColumn({ questions }: { questions: Question[] }) {
  return (
    <div
      style={{
        flex: "0 0 260px",
        background: PANEL,
        border: `1px solid ${AMBER}55`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: AMBER, marginBottom: 4 }}>Unmapped</div>
      <div style={{ fontSize: 11, color: STEEL, marginBottom: 12 }}>
        {questions.length} question{questions.length === 1 ? "" : "s"} not yet mapped.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {questions.slice(0, 20).map((q) => (
          <div
            key={q.id}
            style={{
              padding: "6px 8px",
              background: CARD,
              borderRadius: 4,
              border: `1px dashed ${AMBER}44`,
              fontSize: 11,
              color: "rgba(255,255,255,0.78)",
            }}
            title={q.question_text ?? ""}
          >
            <strong style={{ color: AMBER, marginRight: 6 }}>{q.question_number ?? "?"}</strong>
            {(q.question_text ?? "").slice(0, 70)}
          </div>
        ))}
        {questions.length > 20 && (
          <div style={{ fontSize: 10, color: STEEL, marginTop: 4 }}>+{questions.length - 20} more</div>
        )}
      </div>
    </div>
  );
}

function ThreadTable({ columns }: { columns: { theme: WinTheme; questions: Question[] }[] }) {
  return (
    <div style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 0.6fr 1.3fr 1.8fr 1fr",
          gap: 0,
          padding: "10px 14px",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "",
          color: STEEL,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div>Win theme</div>
        <div>Questions</div>
        <div>Coverage</div>
        <div>Strongest question</div>
        <div>Gap</div>
      </div>
      {columns.map((c) => {
        const total = c.questions.length;
        const narrative = c.questions.filter((q) => q.narrative_role !== "standalone").length;
        const pct = total === 0 ? 0 : Math.round((narrative / total) * 100);
        const covColor = pct > 70 ? GREEN : pct >= 40 ? AMBER : RED;
        const scored = c.questions
          .filter((q) => (q.evaluation_weight ?? q.point_value) != null)
          .sort((a, b) => ((b.evaluation_weight ?? b.point_value)! - (a.evaluation_weight ?? a.point_value)!));
        const strongest = scored[0];
        const opens = c.questions.some((q) => q.narrative_role === "opens_thread");
        const closes = c.questions.some((q) => q.narrative_role === "closes_thread");
        const allStand = total > 0 && narrative === 0;
        let gap = "✅ Complete thread";
        let gapColor = GREEN;
        if (allStand) { gap = "🔴 No narrative"; gapColor = RED; }
        else if (!opens && !closes) { gap = "⚠ No opening or closing"; gapColor = AMBER; }
        else if (!opens) { gap = "⚠ No opening"; gapColor = AMBER; }
        else if (!closes) { gap = "⚠ No closing"; gapColor = AMBER; }
        if (total === 0) { gap = "🔴 No questions"; gapColor = RED; }

        return (
          <div
            key={c.theme.title}
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 0.6fr 1.3fr 1.8fr 1fr",
              gap: 0,
              padding: "10px 14px",
              fontSize: 12,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: GOLD, display: "inline-block" }} />
              <span style={{ color: "rgba(255,255,255,0.9)" }}>{c.theme.title}</span>
            </div>
            <div style={{ color: STEEL }}>{total}</div>
            <div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: covColor }} />
              </div>
              <div style={{ fontSize: 10, color: STEEL, marginTop: 3 }}>{pct}%</div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }}>
              {strongest ? (
                <>
                  <strong style={{ color: GOLD, marginRight: 6 }}>{strongest.question_number}</strong>
                  {(strongest.question_text ?? "").slice(0, 60)}
                </>
              ) : (
                <span style={{ color: STEEL, fontStyle: "italic" }}>None scored</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: gapColor }}>{gap}</div>
          </div>
        );
      })}
    </div>
  );
}

function GapPill({
  color,
  text,
  actionLabel,
  onAction,
  disabled,
}: {
  color: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        padding: "4px 8px",
        borderRadius: 4,
        border: `1px solid ${color}66`,
        color,
        background: `${color}10`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
      }}
    >
      <span>{text}</span>
      {actionLabel && (
        <button
          onClick={onAction}
          disabled={disabled}
          style={{
            all: "unset",
            cursor: disabled ? "default" : "pointer",
            fontSize: 10,
            color,
            opacity: disabled ? 0.5 : 1,
            textDecoration: "underline",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function EmptyBox({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>{title}</div>
      <div style={{ color: STEEL, maxWidth: 480, margin: "0 auto", fontSize: 13, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function goldBtn(filled: boolean): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 6,
    border: `1px solid ${GOLD}`,
    background: filled ? GOLD : "transparent",
    color: filled ? "#0b0b0b" : GOLD,
    letterSpacing: "0.04em",
  };
}
