import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { ErrorBanner, EmptyState, OlympusLink } from "./OracleShared";

type Node = {
  id: string;
  node_type: string;
  label: string;
  description: string | null;
};

type Edge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  is_confirmed: boolean | null;
};

const NODE_COLOR: Record<string, string> = {
  requirement: "#C49A2B",
  stakeholder: "#7BA7D4",
  risk: "#f08080",
  evidence: "#7DCF7D",
  policy: "#EF9F27",
  competitor: "rgba(127,119,221,0.9)",
};
const NODE_LABEL: Record<string, string> = {
  requirement: "Requirement",
  stakeholder: "Stakeholder",
  risk: "Risk",
  evidence: "Evidence",
  policy: "Policy",
  competitor: "Competitor",
};

const W = 800;
const H = 400;

export function OracleGraph({
  missionId,
  isAdmin,
  completeness,
}: {
  missionId: string;
  isAdmin: boolean;
  completeness: number;
}) {
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [userId, setUserId] = useState<string>("anon");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const uid = data.user?.id ?? "anon";
      setUserId(uid);
      const key = `atlas_graph_banner_dismissed_${uid}`;
      setBannerDismissed(!!localStorage.getItem(key));
    });
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(`atlas_graph_banner_dismissed_${userId}`, "1");
    } catch {
      /* ignore */
    }
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-graph", missionId],
    queryFn: async () => {
      const [nRes, eRes] = await Promise.all([
        supabase
          .from("intelligence_graph_nodes")
          .select("id,node_type,label,description")
          .eq("mission_id", missionId)
          .eq("is_active", true),
        supabase
          .from("intelligence_graph_edges")
          .select("id,source_node_id,target_node_id,is_confirmed")
          .eq("mission_id", missionId),
      ]);
      if (nRes.error) throw nRes.error;
      if (eRes.error) throw eRes.error;
      return { nodes: (nRes.data ?? []) as Node[], edges: (eRes.data ?? []) as Edge[] };
    },
    staleTime: 60_000,
  });

  // Degree map
  const degree = useMemo(() => {
    const m = new Map<string, number>();
    (data?.edges ?? []).forEach((e) => {
      m.set(e.source_node_id, (m.get(e.source_node_id) ?? 0) + 1);
      m.set(e.target_node_id, (m.get(e.target_node_id) ?? 0) + 1);
    });
    return m;
  }, [data]);

  // Fixed positions in concentric rings, grouped by node_type
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; r: number; color: string }>();
    const nodes = data?.nodes ?? [];
    if (nodes.length === 0) return pos;
    const grouped: Record<string, Node[]> = {};
    nodes.forEach((n) => {
      const t = NODE_COLOR[n.node_type] ? n.node_type : "evidence";
      (grouped[t] = grouped[t] || []).push(n);
    });
    const types = Object.keys(grouped);
    const cx = W / 2;
    const cy = H / 2;
    const maxDeg = Math.max(1, ...Array.from(degree.values()));
    types.forEach((t, ti) => {
      const ring = 80 + ti * 70;
      const arr = grouped[t];
      arr.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / arr.length + ti * 0.4;
        const x = cx + ring * Math.cos(angle);
        const y = cy + ring * Math.sin(angle);
        const d = degree.get(n.id) ?? 0;
        const r = 14 + (d / maxDeg) * 14; // 14..28 radius -> 28..56 diameter
        pos.set(n.id, { x, y, r, color: NODE_COLOR[n.node_type] ?? "#888" });
      });
    });
    return pos;
  }, [data, degree]);

  const selected = useMemo(() => {
    if (!selectedId || !data) return null;
    const node = data.nodes.find((n) => n.id === selectedId);
    if (!node) return null;
    return { node, edgeCount: degree.get(node.id) ?? 0 };
  }, [selectedId, data, degree]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  const nodes = data?.nodes ?? [];

  return (
    <div className="space-y-3">
      {!bannerDismissed && (
        <div
          className="rounded-md px-3 py-2 flex items-start justify-between gap-3"
          style={{ background: "rgba(196,154,43,0.06)", border: "1px solid rgba(196,154,43,0.3)" }}
        >
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Most intelligence tools give you a list. The graph shows you how everything connects — so you see the terrain, not just
            the data. Each dot is a piece of intelligence. Each line is a connection IRIS identified. Click any node to inspect it.
          </div>
          <button onClick={dismissBanner} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isAdmin && <OlympusLink>Manage graph in Olympus →</OlympusLink>}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
          {Object.entries(NODE_LABEL).map(([t, l]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: NODE_COLOR[t] }} />
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Hover a node · Click to inspect</div>
      </div>

      {/* Canvas */}
      <div
        className="rounded-lg relative overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at center, rgba(13,27,62,0.8), #07101e)",
          border: "1px solid rgba(255,255,255,0.06)",
          height: isMobile ? 300 : 400,
        }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground" style={{ fontSize: 11 }}>
            Loading graph…
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center italic"
               style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            IRIS is building the intelligence graph. It will populate after BLAST OFF and as sources are added in Olympus.
          </div>
        ) : isMobile ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-2">
            <div style={{ fontSize: 24, color: "#C49A2B", fontWeight: 600 }}>{nodes.length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>nodes · {data?.edges.length ?? 0} edges</div>
            <div className="italic mt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              View full graph on desktop
            </div>
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
            {(data?.edges ?? []).map((e) => {
              const s = positions.get(e.source_node_id);
              const t = positions.get(e.target_node_id);
              if (!s || !t) return null;
              const confirmed = e.is_confirmed !== false;
              return (
                <line
                  key={e.id}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={confirmed ? "rgba(196,154,43,0.2)" : "rgba(196,154,43,0.1)"}
                  strokeWidth={1}
                  strokeDasharray={confirmed ? undefined : "4 3"}
                />
              );
            })}
            {nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const isSel = selectedId === n.id;
              return (
                <g key={n.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(n.id)}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={p.color}
                    fillOpacity={isSel ? 0.95 : 0.75}
                    stroke={isSel ? "#fff" : "rgba(255,255,255,0.2)"}
                    strokeWidth={isSel ? 1.5 : 0.5}
                  />
                  <text
                    x={p.x}
                    y={p.y + 3}
                    textAnchor="middle"
                    fill="#fff"
                    style={{ fontSize: 8, pointerEvents: "none", fontWeight: 500 }}
                  >
                    {n.label.length > 14 ? n.label.slice(0, 12) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {selected && (
        <div
          className="rounded-lg"
          style={{
            background: "rgba(5,13,24,0.95)",
            border: "0.5px solid rgba(196,154,43,0.3)",
            padding: "12px 14px",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white" style={{ fontSize: 13, fontWeight: 500 }}>
                {selected.node.label}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    background: "rgba(255,255,255,0.06)",
                    color: NODE_COLOR[selected.node.node_type] ?? "#888",
                  }}
                >
                  {NODE_LABEL[selected.node.node_type] ?? selected.node.node_type}
                </span>
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  Connected to {selected.edgeCount} {selected.edgeCount === 1 ? "node" : "nodes"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close inspector"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {selected.node.description && (
            <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
              {selected.node.description}
            </p>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("atlas:iris:prefill", {
                    detail: `Tell me more about "${selected.node.label}" in the intelligence graph.`,
                  }),
                )
              }
              className="rounded"
              style={{
                padding: "4px 10px",
                fontSize: 10,
                color: "rgba(200,195,255,0.9)",
                background: "rgba(127,119,221,0.12)",
                border: "1px solid rgba(127,119,221,0.3)",
              }}
            >
              Ask IRIS about this →
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Graph completeness: {completeness}%</span>
          <div style={{ width: 120, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
            <div style={{ width: `${completeness}%`, height: "100%", background: "#C49A2B", borderRadius: 2 }} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          Below 50%: general guidance · 65–80%: specific guidance · 80%+: precise guidance — Add sources in Olympus to improve
          completeness
        </div>
      </div>

      {nodes.length === 0 && !isLoading && <EmptyState>No graph yet.</EmptyState>}
    </div>
  );
}
