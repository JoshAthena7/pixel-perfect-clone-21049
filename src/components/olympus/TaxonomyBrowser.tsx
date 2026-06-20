import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOlympusTaxonomy } from "@/lib/olympus.functions";
import { ChevronDown, ChevronRight } from "lucide-react";

type Node = {
  id: string;
  parent_id: string | null;
  domain: string;
  node_name: string;
  node_code: string;
  depth: number;
  is_leaf: boolean;
  count: number;
};

export function TaxonomyBrowser({
  selectedNodeId,
  onSelect,
}: {
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const fn = useServerFn(getOlympusTaxonomy);
  const q = useQuery({
    queryKey: ["olympus", "taxonomy"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { byParent, gaps } = useMemo(() => {
    const nodes = (q.data?.nodes ?? []) as Node[];
    const map = new Map<string | null, Node[]>();
    for (const n of nodes) {
      const key = n.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    const gaps = nodes.filter((n) => n.is_leaf && n.count === 0);
    return { byParent: map, gaps };
  }, [q.data]);

  if (q.isLoading) {
    return <div className="text-[12px] text-white/40 py-4">Loading taxonomy…</div>;
  }
  if (q.error) {
    return <div className="text-[12px] text-red-400 py-4">{(q.error as Error).message}</div>;
  }

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-3">
      <div>
        {roots.map((n) => (
          <TreeNode
            key={n.id}
            node={n}
            byParent={byParent}
            expanded={expanded}
            onToggle={toggle}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="pt-3 border-t border-white/5">
        <div className="text-[11px] text-red-400/80 mb-2">
          Intelligence Gaps · {gaps.length}
        </div>
        {gaps.length === 0 ? (
          <div className="text-[11px] text-white/30">No gaps — every leaf node has intel.</div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {gaps.slice(0, 50).map((g) => (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                className="w-full text-left text-[11px] text-white/50 hover:text-white/80 py-0.5"
              >
                <span className="text-red-400/80">●</span> {g.node_name}{" "}
                <span className="text-white/30 font-mono">{g.node_code}</span>
              </button>
            ))}
            {gaps.length > 50 && (
              <div className="text-[11px] text-white/30">+{gaps.length - 50} more</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  byParent,
  expanded,
  onToggle,
  selectedNodeId,
  onSelect,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const children = byParent.get(node.id) ?? [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(node.id);
  const selected = selectedNodeId === node.id;

  const badgeColor =
    node.count > 5 ? "text-emerald-400/90" : node.count > 0 ? "text-amber-400/90" : "text-red-400/60";
  const nameSize = node.depth === 0 ? "text-[12px] font-medium text-white/90" :
    node.depth === 1 ? "text-[12px] text-white/80" : "text-[11px] text-white/60";

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-0.5 px-1 rounded hover:bg-white/5 cursor-pointer ${
          selected ? "bg-white/5" : ""
        }`}
        style={{
          paddingLeft: 4 + node.depth * 10,
          borderLeft: selected ? "2px solid #d4af37" : "2px solid transparent",
        }}
        onClick={() => onSelect(selected ? null : node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="text-white/40 hover:text-white/80"
          >
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className={`flex-1 truncate ${nameSize}`}>{node.node_name}</span>
        <span className={`text-[11px] tabular-nums ${badgeColor}`}>{node.count}</span>
      </div>
      {hasChildren && isOpen && (
        <div>
          {children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              byParent={byParent}
              expanded={expanded}
              onToggle={onToggle}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
