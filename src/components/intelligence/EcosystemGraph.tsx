import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as d3 from "d3";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mission Intelligence Graph (Layer 3).
 *
 * Unions every relationship signal we currently store so the graph is not
 * boring dots:
 *  - intelligence_graph_nodes + intelligence_graph_edges (canonical Layer 3,
 *    populated by refresh-intelligence-graph + monitors when it runs)
 *  - intel_entities scoped via mission_ids
 *  - intel_people  -> organization_entity_id  (person works at org)
 *  - intel_organizations.parent_entity_id     (org belongs to parent)
 *  - intel_relationships (explicit edges with strength)
 *  - mission_ecosystem_nodes (legacy flat list — still anchored to mission)
 *
 * Layout: d3-force simulation. Drag to reposition.
 */

type GNode = {
  id: string;
  label: string;
  group:
    | "mission"
    | "person"
    | "organization"
    | "competitor"
    | "stakeholder"
    | "program"
    | "risk"
    | "signal"
    | "entity"
    | "other";
  size: number;
  meta?: Record<string, any>;
  // d3 mutates these
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

type GEdge = {
  source: string | GNode;
  target: string | GNode;
  kind: "anchor" | "works_at" | "parent_of" | "relationship" | "graph_edge";
  weight: number;
};

const GROUP_COLOR: Record<GNode["group"], string> = {
  mission: "#C49A2B",
  person: "#7FB3FF",
  organization: "#EF9F27",
  competitor: "#E04A4A",
  stakeholder: "#7F77DD",
  program: "#1A7A4A",
  risk: "#E04A4A",
  signal: "#C8C3FF",
  entity: "#9BA3AF",
  other: "#6B7280",
};

const EDGE_COLOR: Record<GEdge["kind"], string> = {
  anchor: "rgba(196,154,43,0.18)",
  works_at: "rgba(127,179,255,0.35)",
  parent_of: "rgba(239,159,39,0.35)",
  relationship: "rgba(200,195,255,0.55)",
  graph_edge: "rgba(196,154,43,0.55)",
};

export function EcosystemGraph({
  missionId,
  onNodeClick,
}: {
  missionId: string;
  onNodeClick: (node: any) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["mission-graph", missionId],
    staleTime: 30_000,
    queryFn: async () => {
      const [
        ecosystem,
        mission,
        people,
        orgs,
        entities,
        rels,
        graphNodes,
        graphEdges,
      ] = await Promise.all([
        supabase
          .from("mission_ecosystem_nodes")
          .select("id,label,node_type,signal_count,confidence,status,summary")
          .eq("mission_id", missionId)
          .eq("is_active", true),
        supabase.from("missions").select("id,name").eq("id", missionId).maybeSingle(),
        supabase
          .from("intel_people")
          .select(
            "entity_id,role_type,organization_entity_id,influence_level,relationship_stance,title",
          )
          .eq("mission_id", missionId),
        supabase
          .from("intel_organizations")
          .select("entity_id,org_type,parent_entity_id,incumbency_status")
          .eq("mission_id", missionId),
        supabase
          .from("intel_entities")
          .select("id,name,entity_type,description,mission_ids")
          .contains("mission_ids", [missionId])
          .limit(400),
        supabase
          .from("intel_relationships")
          .select(
            "from_entity_id,to_entity_id,relationship_type,relationship_strength,confidence",
          )
          .eq("mission_id", missionId)
          .limit(800),
        supabase
          .from("intelligence_graph_nodes")
          .select("id,label,node_type,confidence_level,metadata")
          .eq("mission_id", missionId)
          .eq("is_active", true),
        supabase
          .from("intelligence_graph_edges")
          .select(
            "source_node_id,target_node_id,relationship_type,strength,is_confirmed",
          )
          .eq("mission_id", missionId),
      ]);

      return {
        ecosystem: ecosystem.data ?? [],
        mission: mission.data,
        people: people.data ?? [],
        orgs: orgs.data ?? [],
        entities: entities.data ?? [],
        rels: rels.data ?? [],
        graphNodes: graphNodes.data ?? [],
        graphEdges: graphEdges.data ?? [],
      };
    },
  });

  const { nodes, edges, counts } = useMemo(() => {
    const nodeMap = new Map<string, GNode>();
    const edgeList: GEdge[] = [];
    if (!data) return { nodes: [] as GNode[], edges: edgeList, counts: null };

    // 1. Mission center
    const missionNodeId = `mission:${missionId}`;
    nodeMap.set(missionNodeId, {
      id: missionNodeId,
      label: data.mission?.name ?? "Mission",
      group: "mission",
      size: 18,
    });

    // 2. Intel entities (people/orgs/etc.) keyed by entity id
    const peopleByEntity = new Map(data.people.map((p: any) => [p.entity_id, p]));
    const orgByEntity = new Map(data.orgs.map((o: any) => [o.entity_id, o]));

    for (const e of data.entities as any[]) {
      const isPerson = peopleByEntity.has(e.id);
      const isOrg = orgByEntity.has(e.id);
      const orgRow = orgByEntity.get(e.id);
      const personRow = peopleByEntity.get(e.id);
      let group: GNode["group"] = "entity";
      if (isPerson) group = "person";
      else if (isOrg) {
        if (orgRow?.org_type === "competitor") group = "competitor";
        else if (orgRow?.org_type === "stakeholder") group = "stakeholder";
        else group = "organization";
      } else if (e.entity_type) {
        const t = String(e.entity_type).toLowerCase();
        if (t.includes("risk")) group = "risk";
        else if (t.includes("signal")) group = "signal";
        else if (t.includes("program")) group = "program";
        else if (t.includes("person")) group = "person";
        else if (t.includes("org")) group = "organization";
      }
      const influence = personRow?.influence_level ?? 0;
      nodeMap.set(e.id, {
        id: e.id,
        label: e.name ?? "Unnamed",
        group,
        size: 6 + Math.min(8, Number(influence) || 0),
        meta: { entity_type: e.entity_type, description: e.description },
      });
    }

    // 3. Legacy ecosystem nodes (anchor to mission)
    for (const n of data.ecosystem as any[]) {
      const id = `eco:${n.id}`;
      if (!nodeMap.has(id)) {
        const t = String(n.node_type ?? "").toLowerCase();
        let group: GNode["group"] = "entity";
        if (t === "mission") continue; // mission center already added
        if (t.includes("competitor")) group = "competitor";
        else if (t.includes("stakeholder")) group = "stakeholder";
        else if (t.includes("risk")) group = "risk";
        else if (t.includes("program")) group = "program";
        else if (t.includes("signal")) group = "signal";
        nodeMap.set(id, {
          id,
          label: n.label ?? "Untitled",
          group,
          size: 6 + Math.min(8, Number(n.signal_count) || 0),
          meta: { summary: n.summary, status: n.status, confidence: n.confidence },
        });
      }
      edgeList.push({
        source: missionNodeId,
        target: `eco:${n.id}`,
        kind: "anchor",
        weight: 0.4,
      });
    }

    // 4. Canonical Layer-3 graph_nodes (when present)
    for (const n of data.graphNodes as any[]) {
      const id = `g:${n.id}`;
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: n.label ?? "Untitled",
          group: "entity",
          size: 7,
          meta: n.metadata,
        });
      }
    }
    for (const e of data.graphEdges as any[]) {
      const s = `g:${e.source_node_id}`;
      const t = `g:${e.target_node_id}`;
      if (nodeMap.has(s) && nodeMap.has(t)) {
        edgeList.push({
          source: s,
          target: t,
          kind: "graph_edge",
          weight: Math.max(0.3, Math.min(1.5, Number(e.strength ?? 1) / 5)),
        });
      }
    }

    // 5. Derived: people -> organization_entity_id
    for (const p of data.people as any[]) {
      if (p.organization_entity_id && nodeMap.has(p.entity_id) && nodeMap.has(p.organization_entity_id)) {
        edgeList.push({
          source: p.entity_id,
          target: p.organization_entity_id,
          kind: "works_at",
          weight: 0.8,
        });
      }
    }

    // 6. Derived: org parent_entity_id
    for (const o of data.orgs as any[]) {
      if (o.parent_entity_id && nodeMap.has(o.entity_id) && nodeMap.has(o.parent_entity_id)) {
        edgeList.push({
          source: o.parent_entity_id,
          target: o.entity_id,
          kind: "parent_of",
          weight: 0.8,
        });
      }
    }

    // 7. Explicit intel_relationships
    for (const r of data.rels as any[]) {
      if (nodeMap.has(r.from_entity_id) && nodeMap.has(r.to_entity_id)) {
        edgeList.push({
          source: r.from_entity_id,
          target: r.to_entity_id,
          kind: "relationship",
          weight: Math.max(0.3, Math.min(1.5, Number(r.relationship_strength ?? 1) / 5)),
        });
      }
    }

    // 8. Anchor any orphan entity to the mission so it has at least one tie
    const connected = new Set<string>();
    for (const e of edgeList) {
      const s = typeof e.source === "string" ? e.source : (e.source as GNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as GNode).id;
      connected.add(s);
      connected.add(t);
    }
    for (const id of nodeMap.keys()) {
      if (id === missionNodeId) continue;
      if (!connected.has(id)) {
        edgeList.push({ source: missionNodeId, target: id, kind: "anchor", weight: 0.2 });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgeList,
      counts: {
        entities: data.entities.length,
        explicitEdges:
          data.rels.length + data.graphEdges.length + data.people.filter((p: any) => p.organization_entity_id).length,
        ecosystem: data.ecosystem.length,
        layer3: data.graphNodes.length,
      },
    };
  }, [data, missionId]);

  if (isLoading) {
    return (
      <div style={emptyShell}>IRIS is mapping the mission intelligence graph...</div>
    );
  }

  if (nodes.length <= 1) {
    return (
      <div style={emptyShell}>
        No intelligence in the graph yet. As entities, people, organizations and
        signals are added to this mission, they will appear here as connected nodes.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <ForceGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} />
      <Legend />
      {counts && (
        <div style={statsBadge}>
          {nodes.length} nodes · {edges.length} connections
          {counts.layer3 === 0 ? " · Layer 3 pending" : " · Layer 3 active"}
        </div>
      )}
    </div>
  );
}

const emptyShell: React.CSSProperties = {
  height: 480,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "rgba(255,255,255,0.45)",
  fontStyle: "italic",
  textAlign: "center",
  padding: 24,
};

const statsBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  fontSize: 10,
  color: "rgba(255,255,255,0.45)",
  background: "rgba(0,0,0,0.35)",
  padding: "3px 8px",
  borderRadius: 4,
  letterSpacing: "0.04em",
};

function Legend() {
  const items: { label: string; color: string }[] = [
    { label: "Mission", color: GROUP_COLOR.mission },
    { label: "Person", color: GROUP_COLOR.person },
    { label: "Organization", color: GROUP_COLOR.organization },
    { label: "Competitor", color: GROUP_COLOR.competitor },
    { label: "Stakeholder", color: GROUP_COLOR.stakeholder },
    { label: "Risk / Signal", color: GROUP_COLOR.risk },
  ];
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        background: "rgba(0,0,0,0.35)",
        padding: "6px 8px",
        borderRadius: 4,
        fontSize: 10,
        color: "rgba(255,255,255,0.7)",
        maxWidth: 280,
      }}
    >
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: it.color,
              display: "inline-block",
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function ForceGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: GNode[];
  edges: GEdge[];
  onNodeClick: (n: any) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [, force] = useState(0);
  const simRef = useRef<d3.Simulation<GNode, GEdge> | null>(null);
  const width = 760;
  const height = 480;
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    // Copy so d3 mutation does not blow up React equality checks
    const simNodes = nodes.map((n) => ({ ...n }));
    const idIndex = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges = edges
      .map((e) => ({
        ...e,
        source: typeof e.source === "string" ? idIndex.get(e.source)! : e.source,
        target: typeof e.target === "string" ? idIndex.get(e.target)! : e.target,
      }))
      .filter((e) => e.source && e.target);

    const sim = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<GNode, GEdge>(simEdges)
          .id((d) => d.id)
          .distance((d: any) => 70 / Math.max(0.3, d.weight))
          .strength((d: any) => Math.min(1, d.weight)),
      )
      .force("charge", d3.forceManyBody().strength(-140))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<GNode>().radius((d) => d.size + 4),
      )
      .alpha(1)
      .alphaDecay(0.04);

    simRef.current = sim;
    sim.on("tick", () => {
      // re-render
      force((x) => (x + 1) % 1_000_000);
    });

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const sim = simRef.current;
  const renderNodes = (sim?.nodes() as GNode[] | undefined) ?? [];
  const renderEdges = (sim
    ? ((sim as any).force("link")?.links?.() as GEdge[] | undefined)
    : undefined) ?? [];

  function onDragStart(e: React.MouseEvent, id: string) {
    e.preventDefault();
    const target = renderNodes.find((n) => n.id === id);
    if (!target || !simRef.current) return;
    simRef.current.alphaTarget(0.3).restart();
    target.fx = target.x;
    target.fy = target.y;

    const move = (ev: MouseEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      target.fx = (ev.clientX - rect.left) * scaleX;
      target.fy = (ev.clientY - rect.top) * scaleY;
    };
    const up = () => {
      simRef.current?.alphaTarget(0);
      target.fx = null;
      target.fy = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{ background: "transparent", display: "block", cursor: "grab" }}
    >
      <g>
        {renderEdges.map((e, i) => {
          const s = e.source as GNode;
          const t = e.target as GNode;
          if (!s?.x || !t?.x) return null;
          const highlighted =
            hover && (s.id === hover || t.id === hover) ? 1 : undefined;
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={EDGE_COLOR[e.kind]}
              strokeWidth={highlighted ? 1.8 : 0.9}
              opacity={hover ? (highlighted ? 1 : 0.15) : 1}
            />
          );
        })}
      </g>
      <g>
        {renderNodes.map((n) => {
          const color = GROUP_COLOR[n.group];
          const dim = hover && hover !== n.id && !isNeighbor(n.id, hover, renderEdges);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onMouseDown={(e) => onDragStart(e, n.id)}
              onClick={() => onNodeClick(n)}
              style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
            >
              <circle
                r={n.size}
                fill={color}
                stroke="rgba(0,0,0,0.6)"
                strokeWidth={1}
              />
              {(hover === n.id || n.group === "mission") && (
                <text
                  y={-n.size - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="white"
                  style={{ pointerEvents: "none" }}
                >
                  {n.label.length > 32 ? n.label.slice(0, 30) + "…" : n.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function isNeighbor(id: string, other: string, edges: GEdge[]): boolean {
  for (const e of edges) {
    const s = (e.source as GNode).id;
    const t = (e.target as GNode).id;
    if ((s === id && t === other) || (t === id && s === other)) return true;
  }
  return false;
}
