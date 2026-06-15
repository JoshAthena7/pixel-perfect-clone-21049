import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EcosystemNode } from "./EcosystemNode";

export function EcosystemGraph({
  missionId,
  onNodeClick,
}: {
  missionId: string;
  onNodeClick: (node: any) => void;
}) {
  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["ecosystem-nodes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_ecosystem_nodes")
        .select("*")
        .eq("mission_id", missionId)
        .eq("is_active", true)
        .order("node_type");
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const CX = 300;
  const CY = 240;
  const RADIUS = 175;

  const centerNode = nodes.find((n: any) => n.node_type === "mission");
  const surrounding = nodes.filter((n: any) => n.node_type !== "mission");

  const positioned = surrounding.map((node: any, i: number) => {
    const angle = (i / surrounding.length) * 2 * Math.PI - Math.PI / 2;
    return {
      node,
      x: Math.round(CX + RADIUS * Math.cos(angle)),
      y: Math.round(CY + RADIUS * Math.sin(angle)),
    };
  });

  if (isLoading) {
    return (
      <div
        style={{
          height: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          fontStyle: "italic",
        }}
      >
        IRIS is mapping the mission ecosystem...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        style={{
          height: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          fontStyle: "italic",
          textAlign: "center",
          padding: 24,
        }}
      >
        IRIS ecosystem is being configured for this mission.
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 600 480"
      width="100%"
      height={480}
      style={{ background: "transparent", display: "block" }}
    >
      {positioned.map(({ node, x, y }) => {
        const opacity = Math.max(0.1, (node.confidence / 100) * 0.5);
        const stroke =
          node.status === "green"
            ? `rgba(196,154,43,${opacity})`
            : `rgba(255,255,255,${opacity * 0.5})`;
        return (
          <line
            key={`line-${node.id}`}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
      })}

      {positioned.map(({ node, x, y }) => (
        <EcosystemNode
          key={node.id}
          x={x}
          y={y}
          label={node.label}
          status={node.status}
          signalCount={node.signal_count}
          confidence={node.confidence}
          isCenter={false}
          onClick={() => onNodeClick(node)}
        />
      ))}

      {centerNode && (
        <EcosystemNode
          x={CX}
          y={CY}
          label={centerNode.label}
          status={centerNode.status}
          signalCount={0}
          confidence={centerNode.confidence}
          isCenter={true}
          onClick={() => onNodeClick(centerNode)}
        />
      )}
    </svg>
  );
}
