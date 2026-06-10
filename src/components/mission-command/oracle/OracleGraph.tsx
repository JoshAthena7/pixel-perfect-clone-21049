import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Minus, Maximize2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const NODE_STYLE: Record<string, { color: string; radius: number; shape: "circle" | "star" | "triangle"; labelFill: string }> = {
  requirement: { color: "#1A2B4C", radius: 8, shape: "circle", labelFill: "#fff" },
  evaluator: { color: "#C9A55C", radius: 10, shape: "circle", labelFill: "#1A2B4C" },
  stakeholder: { color: "#C9A55C", radius: 10, shape: "circle", labelFill: "#1A2B4C" },
  policy: { color: "#4A6FA5", radius: 8, shape: "circle", labelFill: "#fff" },
  competitor: { color: "#C0392B", radius: 10, shape: "circle", labelFill: "#fff" },
  research: { color: "#1A7A4A", radius: 8, shape: "circle", labelFill: "#fff" },
  win_theme: { color: "#C9A55C", radius: 12, shape: "star", labelFill: "#1A2B4C" },
  risk: { color: "#D4800A", radius: 10, shape: "triangle", labelFill: "#fff" },
  internal_knowledge: { color: "#1A2B4C", radius: 8, shape: "circle", labelFill: "#fff" },
};

const TYPE_LABELS: Record<string, string> = {
  requirement: "Requirements",
  evaluator: "Evaluators",
  stakeholder: "Stakeholders",
  policy: "Policies",
  competitor: "Competitors",
  research: "Research",
  win_theme: "Win Themes",
  risk: "Risks",
  internal_knowledge: "Internal",
};

type GNode = {
  id: string;
  label: string;
  node_type: string;
  description: string | null;
  confidence_level: string;
  source: string | null;
} & d3.SimulationNodeDatum;

type GEdge = {
  source: string | GNode;
  target: string | GNode;
  strength: number;
  is_confirmed: boolean;
  relationship_description: string | null;
};

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export function OracleGraph({ missionId, completeness }: { missionId: string; completeness: number }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [hovered, setHovered] = useState<{ node: GNode; x: number; y: number } | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["oracle-graph", missionId],
    queryFn: async () => {
      const [{ data: nodes }, { data: edges }] = await Promise.all([
        supabase.from("intelligence_graph_nodes").select("id,label,node_type,description,confidence_level,source,updated_at").eq("mission_id", missionId).eq("is_active", true),
        supabase.from("intelligence_graph_edges").select("source_node_id,target_node_id,strength,is_confirmed,relationship_description").eq("mission_id", missionId),
      ]);
      return { nodes: nodes ?? [], edges: edges ?? [] };
    },
    refetchInterval: 30000,
  });

  const lastUpdated = useMemo(() => {
    const times = (data?.nodes ?? [])
      .map((n) => new Date((n as { updated_at?: string }).updated_at ?? 0).getTime())
      .filter((t) => Number.isFinite(t) && t > 0);
    if (!times.length) return null;
    return new Date(Math.max(...times));
  }, [data?.nodes]);

  const nodes = useMemo<GNode[]>(() => (data?.nodes ?? []).map((n) => ({ ...n })), [data?.nodes]);
  const edges = useMemo<GEdge[]>(
    () => (data?.edges ?? []).map((e) => ({
      source: e.source_node_id, target: e.target_node_id,
      strength: e.strength, is_confirmed: e.is_confirmed, relationship_description: e.relationship_description,
    })),
    [data?.edges],
  );

  const filteredNodes = useMemo(() => nodes.filter((n) => !hiddenTypes.has(n.node_type)), [nodes, hiddenTypes]);
  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(typeof e.source === "string" ? e.source : e.source.id) && visibleIds.has(typeof e.target === "string" ? e.target : e.target.id)),
    [edges, visibleIds],
  );

  // D3 simulation
  useEffect(() => {
    if (isMobile || !svgRef.current || !filteredNodes.length) return;
    const svg = d3.select(svgRef.current);
    const width = wrapRef.current?.clientWidth ?? 800;
    const height = 600;
    svg.selectAll("*").remove();

    const g = svg.append("g");

    const sim = d3.forceSimulation<GNode>(filteredNodes)
      .force("link", d3.forceLink<GNode, GEdge>(filteredEdges as unknown as GEdge[]).id((d: GNode) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(20))
      .alphaDecay(0.02);

    const link = g.append("g").selectAll("line")
      .data(filteredEdges)
      .enter().append("line")
      .attr("stroke", (d) => {
        const t = filteredNodes.find((n) => n.id === (typeof d.target === "string" ? d.target : d.target.id));
        return t ? NODE_STYLE[t.node_type]?.color ?? "#888" : "#888";
      })
      .attr("stroke-opacity", (d) => d.is_confirmed ? 0.6 : 0.3)
      .attr("stroke-dasharray", (d) => d.is_confirmed ? null : "4 4")
      .attr("stroke-width", (d) => d.strength <= 3 ? 1 : d.strength <= 7 ? 2 : 3);

    const node = g.append("g").selectAll<SVGGElement, GNode>("g.node")
      .data(filteredNodes, (d) => d.id)
      .enter().append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(d3.drag<SVGGElement, GNode>()
        .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.each(function (d) {
      const sty = NODE_STYLE[d.node_type] ?? NODE_STYLE.requirement;
      const sel = d3.select(this);
      if (sty.shape === "star") {
        sel.append("path").attr("d", d3.symbol().type(d3.symbolStar).size(220)())
          .attr("fill", sty.color).attr("stroke", "#0F1A2E").attr("stroke-width", 1);
      } else if (sty.shape === "triangle") {
        sel.append("path").attr("d", d3.symbol().type(d3.symbolTriangle).size(180)())
          .attr("fill", sty.color).attr("stroke", "#0F1A2E").attr("stroke-width", 1);
      } else {
        sel.append("circle").attr("r", sty.radius).attr("fill", sty.color)
          .attr("stroke", d.node_type === "internal_knowledge" ? "#C9A55C" : "#0F1A2E").attr("stroke-width", d.node_type === "internal_knowledge" ? 1.5 : 1);
      }
      sel.append("text")
        .text(truncate(d.label, 20))
        .attr("y", sty.radius + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#fff")
        .style("pointer-events", "none");
    });

    node
      .on("mouseenter", (event, d) => {
        const rect = (wrapRef.current as HTMLDivElement).getBoundingClientRect();
        setHovered({ node: d, x: event.clientX - rect.left, y: event.clientY - rect.top });
      })
      .on("mouseleave", () => setHovered(null))
      .on("click", (event, d) => { event.stopPropagation(); setSelected(d); })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        const zoom = zoomRef.current; if (!zoom || !d.x || !d.y) return;
        svg.transition().duration(500).call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2 - d.x * 1.5, height / 2 - d.y * 1.5).scale(1.5),
        );
      });

    svg.on("click", () => setSelected(null));

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    zoomRef.current = zoom;
    svg.call(zoom);

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GNode).x ?? 0)
        .attr("y1", (d) => (d.source as GNode).y ?? 0)
        .attr("x2", (d) => (d.target as GNode).x ?? 0)
        .attr("y2", (d) => (d.target as GNode).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [filteredNodes, filteredEdges, isMobile]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of nodes) m[n.node_type] = (m[n.node_type] ?? 0) + 1;
    return m;
  }, [nodes]);

  if (isLoading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  if (nodes.length === 0 || completeness < 40) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
          <span className="text-2xl">✦</span>
        </div>
        <h3 className="text-lg font-semibold">IRIS is building your Intelligence Graph.</h3>
        <p className="text-sm text-muted-foreground mt-2">Check back as your Intelligence Loadout progresses. The graph becomes available at 40% completeness.</p>
        <div className="max-w-md mx-auto mt-4">
          <div className="text-xs text-muted-foreground mb-1">Current completeness: {completeness}%</div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-[#C9A55C]" style={{ width: `${completeness}%` }} />
          </div>
        </div>
        <ul className="mt-6 text-sm space-y-1 text-muted-foreground">
          <li>· Upload client documents</li>
          <li>· Add competitor profiles</li>
          <li>· Configure monitoring feeds</li>
          <li>· Upload prior proposals</li>
        </ul>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Graph visualization is best experienced on desktop. Here is a list of your intelligence nodes.</p>
        {Object.entries(counts).map(([t, c]) => (
          <div key={t} className="rounded border bg-card p-3">
            <div className="font-medium text-sm">{TYPE_LABELS[t] ?? t} ({c})</div>
            <div className="mt-1 text-xs text-muted-foreground space-y-1">
              {nodes.filter((n) => n.node_type === t).slice(0, 10).map((n) => <div key={n.id}>· {n.label}</div>)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative rounded-lg border overflow-hidden" style={{ background: "#0B1424" }}>
        <svg ref={svgRef} width="100%" height={600} />
        {/* Controls */}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy as never, 1.3)}><Plus className="h-4 w-4" /></Button>
          <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy as never, 0.75)}><Minus className="h-4 w-4" /></Button>
          <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().call(zoomRef.current.transform as never, d3.zoomIdentity)}><Maximize2 className="h-4 w-4" /></Button>
        </div>
        {/* Filter buttons */}
        <div className="absolute top-3 right-3 flex flex-wrap gap-1 max-w-[60%] justify-end">
          {Object.keys(TYPE_LABELS).map((t) => (
            <button
              key={t}
              onClick={() => setHiddenTypes((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: NODE_STYLE[t].color, color: NODE_STYLE[t].labelFill, opacity: hiddenTypes.has(t) ? 0.2 : 1 }}
            >
              {TYPE_LABELS[t]} {counts[t] ?? 0}
            </button>
          ))}
        </div>
        {/* Tooltip */}
        {hovered && (
          <div className="absolute pointer-events-none rounded-md border bg-popover text-popover-foreground p-2 shadow-lg max-w-xs text-xs z-10"
            style={{ left: Math.min(hovered.x + 12, (wrapRef.current?.clientWidth ?? 800) - 260), top: Math.min(hovered.y + 12, 540) }}>
            <div className="font-semibold">{hovered.node.label}</div>
            <Badge variant="outline" className="my-1 text-[10px]">{hovered.node.node_type}</Badge>
            {hovered.node.description && <div className="text-muted-foreground">{hovered.node.description.slice(0, 120)}</div>}
            <div className="mt-1 text-[10px] text-muted-foreground">Confidence: {hovered.node.confidence_level} · {hovered.node.source ?? "—"}</div>
          </div>
        )}
        {/* Node detail panel */}
        {selected && (
          <div className="absolute top-0 right-0 h-full w-80 bg-card border-l shadow-xl p-4 overflow-y-auto z-20" onClick={(e) => e.stopPropagation()}>
            <button className="text-xs text-muted-foreground mb-2" onClick={() => setSelected(null)}>← Close</button>
            <Badge className="mb-2">{selected.node_type}</Badge>
            <h3 className="font-semibold text-base">{selected.label}</h3>
            {selected.description && <p className="text-sm mt-2 text-muted-foreground">{selected.description}</p>}
            <div className="mt-3 text-xs">Confidence: <span className="font-medium">{selected.confidence_level}</span></div>
            <div className="text-xs text-muted-foreground">Source: {selected.source ?? "—"}</div>
            <div className="mt-4">
              <div className="text-xs font-semibold mb-1">Connected to</div>
              <div className="space-y-1">
                {edges.filter((e) => {
                  const s = typeof e.source === "string" ? e.source : e.source.id;
                  const t = typeof e.target === "string" ? e.target : e.target.id;
                  return s === selected.id || t === selected.id;
                }).slice(0, 30).map((e, i) => {
                  const otherId = (typeof e.source === "string" ? e.source : e.source.id) === selected.id
                    ? (typeof e.target === "string" ? e.target : e.target.id)
                    : (typeof e.source === "string" ? e.source : e.source.id);
                  const other = nodes.find((n) => n.id === otherId);
                  return (
                    <button key={i} onClick={() => other && setSelected(other)} className="block w-full text-left text-xs hover:bg-muted p-1 rounded">
                      <span className="font-medium">{other?.label ?? "?"}</span>
                      {e.relationship_description && <span className="text-muted-foreground"> — {e.relationship_description}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {Object.keys(TYPE_LABELS).map((t) => `${counts[t] ?? 0} ${TYPE_LABELS[t].toLowerCase()}`).join(" · ")}
      </div>
      {nodes.length < 10 && (
        <div className="text-xs text-[#C9A55C]">Your graph is growing. Add more intelligence to see the full picture.</div>
      )}
    </div>
  );
}
