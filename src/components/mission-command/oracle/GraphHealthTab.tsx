import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import {
  getGraphHealthStats,
  getNodeBreakdown,
  getIsolatedNodes,
  getStrongestChains,
  getCoverageGaps,
  connectIsolatedNode,
  findEvidenceForQuestion,
} from "@/lib/graph-health.functions";
import { refreshMissionGraph } from "@/lib/intelligence-graph.functions";

const GOLD = "#C49A2B";
const AMBER = "#E0A93E";
const RED = "#E0584C";
const GREEN = "#5BA886";
const STEEL = "rgba(255,255,255,0.55)";

const NODE_COLORS: Record<string, string> = {
  requirement: GOLD,
  evaluator: GOLD,
  risk: RED,
  research: GREEN,
  win_theme: GREEN,
  stakeholder: "#8E7CC3",
  competitor: AMBER,
  policy: "#7C9CCB",
  internal_knowledge: "#4FB3A9",
};
const colorFor = (t: string) => NODE_COLORS[t] ?? "#7A8290";

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 1) return "<1h ago";
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function GraphHealthTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const showBanner = (msg: string) => {
    setBanner(msg);
    window.setTimeout(() => setBanner(null), 8000);
  };

  const statsFn = useServerFn(getGraphHealthStats);
  const breakdownFn = useServerFn(getNodeBreakdown);
  const isolatedFn = useServerFn(getIsolatedNodes);
  const chainsFn = useServerFn(getStrongestChains);
  const gapsFn = useServerFn(getCoverageGaps);
  const refreshFn = useServerFn(refreshMissionGraph);
  const connectFn = useServerFn(connectIsolatedNode);
  const evidenceFn = useServerFn(findEvidenceForQuestion);

  const stats = useQuery({
    queryKey: ["graph-health-stats", missionId],
    queryFn: () => statsFn({ data: { missionId } }),
  });
  const breakdown = useQuery({
    queryKey: ["graph-health-breakdown", missionId],
    queryFn: () => breakdownFn({ data: { missionId } }),
  });
  const isolated = useQuery({
    queryKey: ["graph-health-isolated", missionId],
    queryFn: () => isolatedFn({ data: { missionId } }),
  });
  const chains = useQuery({
    queryKey: ["graph-health-chains", missionId],
    queryFn: () => chainsFn({ data: { missionId } }),
  });
  const gaps = useQuery({
    queryKey: ["graph-health-gaps", missionId],
    queryFn: () => gapsFn({ data: { missionId } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["graph-health-stats", missionId] });
    qc.invalidateQueries({ queryKey: ["graph-health-breakdown", missionId] });
    qc.invalidateQueries({ queryKey: ["graph-health-isolated", missionId] });
    qc.invalidateQueries({ queryKey: ["graph-health-chains", missionId] });
    qc.invalidateQueries({ queryKey: ["graph-health-gaps", missionId] });
  };

  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { missionId } }),
    onSuccess: (res: any) => {
      const added = res?.edgesAdded ?? 0;
      const nodes = res?.nodesAdded ?? 0;
      showBanner(
        `Graph refreshed — ${added} new edge${added === 1 ? "" : "s"}, ${nodes} new node${nodes === 1 ? "" : "s"}`,
      );
      invalidateAll();
    },
    onError: (e: any) => showBanner(`Refresh failed: ${e?.message ?? e}`),
  });

  const connect = useMutation({
    mutationFn: (nodeId: string) => connectFn({ data: { missionId, nodeId } }),
    onSuccess: (res: any) => {
      showBanner(`Connected to ${res?.created ?? 0} nodes`);
      invalidateAll();
    },
    onError: (e: any) => showBanner(`Connect failed: ${e?.message ?? e}`),
  });

  const findEv = useMutation({
    mutationFn: (questionId: string) => evidenceFn({ data: { missionId, questionId } }),
    onSuccess: (res: any) => {
      if (res?.skipped) showBanner(res?.message ?? "Skipped");
      else showBanner(`Connected to ${res?.created ?? 0} evidence sources`);
      invalidateAll();
    },
    onError: (e: any) => showBanner(`Find evidence failed: ${e?.message ?? e}`),
  });

  const s = stats.data;
  const nodeCount = s?.nodes ?? 0;
  const edgeCount = s?.edges ?? 0;
  const density = s?.density ?? 0;

  const nodeColor = nodeCount > 50 ? GOLD : nodeCount >= 10 ? AMBER : RED;
  const edgeColor = edgeCount > 40 ? GOLD : edgeCount >= 10 ? AMBER : RED;
  const densityColor = density > 0.5 ? GOLD : density >= 0.2 ? AMBER : RED;
  const refreshHours = s?.lastRefresh
    ? (Date.now() - new Date(s.lastRefresh).getTime()) / 3_600_000
    : Infinity;
  const refreshColor = refreshHours < 24 ? GOLD : refreshHours <= 72 ? AMBER : RED;

  const filteredIsolated = useMemo(() => {
    const list = isolated.data?.isolated ?? [];
    return typeFilter ? list.filter((n: any) => n.node_type === typeFilter) : list;
  }, [isolated.data, typeFilter]);

  const chartData = useMemo(
    () =>
      (breakdown.data?.breakdown ?? []).map((b: any) => ({
        type: b.node_type,
        count: b.count,
        fill: colorFor(b.node_type),
      })),
    [breakdown.data],
  );

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className="rounded-md px-3 py-2"
          style={{
            background: "rgba(196,154,43,0.1)",
            border: `1px solid ${GOLD}`,
            color: GOLD,
            fontSize: 12,
          }}
        >
          {banner}
        </div>
      )}

      {/* SECTION 1 — Status Bar */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Intelligence Nodes"
            value={nodeCount}
            color={nodeColor}
            loading={stats.isLoading}
          />
          <StatCard
            label="Connections"
            value={edgeCount}
            color={edgeColor}
            loading={stats.isLoading}
          />
          <StatCard
            label="Connection Density"
            value={`${density.toFixed(1)}`}
            sub="connections per node · higher = smarter reasoning"
            color={densityColor}
            loading={stats.isLoading}
          />
          <StatCard
            label="Last Graph Refresh"
            value={timeAgo(s?.lastRefresh ?? null)}
            sub="Refreshes weekly via cron"
            color={refreshColor}
            loading={stats.isLoading}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
            className="rounded-md px-3 py-1.5 transition-colors"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#070f1c",
              background: GOLD,
              border: `1px solid ${GOLD}`,
              opacity: refresh.isPending ? 0.6 : 1,
            }}
          >
            {refresh.isPending ? "Refreshing…" : "⚡ Refresh Graph Now"}
          </button>
        </div>
      </section>

      {/* SECTION 2 — Node Breakdown */}
      <section
        className="rounded-lg p-4"
        style={{ background: "rgba(5,13,24,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <SectionHeader
          title="Intelligence by Type"
          subtitle="What IRIS has extracted and classified"
        />
        {breakdown.isLoading ? (
          <Placeholder text="Loading breakdown…" />
        ) : chartData.length === 0 ? (
          <Placeholder text="No nodes yet. Refresh the graph or add source documents." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div style={{ height: Math.max(200, chartData.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 30, left: 4, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={130}
                    tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{ fill: "rgba(255,255,255,0.8)", fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ fontSize: 12 }}>
                <thead>
                  <tr style={{ color: STEEL, fontSize: 10, textTransform: "uppercase" }}>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Count</th>
                    <th className="py-1 pr-3">Avg Confidence</th>
                    <th className="py-1">Isolated</th>
                  </tr>
                </thead>
                <tbody>
                  {(breakdown.data?.breakdown ?? []).map((b: any) => {
                    const conf =
                      b.avg_confidence >= 0.8
                        ? { label: "High", color: GREEN }
                        : b.avg_confidence >= 0.5
                          ? { label: "Medium", color: AMBER }
                          : { label: "Low", color: RED };
                    const active = typeFilter === b.node_type;
                    return (
                      <tr
                        key={b.node_type}
                        onClick={() => setTypeFilter(active ? null : b.node_type)}
                        className="cursor-pointer hover:bg-white/[0.03]"
                        style={{
                          background: active ? "rgba(196,154,43,0.06)" : undefined,
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <td className="py-1.5 pr-3">
                          <span
                            className="inline-block rounded px-1.5 py-0.5"
                            style={{
                              background: `${colorFor(b.node_type)}22`,
                              color: colorFor(b.node_type),
                              fontSize: 11,
                            }}
                          >
                            {b.node_type}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-white">{b.count}</td>
                        <td className="py-1.5 pr-3" style={{ color: conf.color }}>
                          {conf.label}
                        </td>
                        <td className="py-1.5">
                          {b.isolated > 0 ? (
                            <span style={{ color: RED }}>{b.isolated} isolated</span>
                          ) : (
                            <span style={{ color: GREEN }}>✓ all connected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {typeFilter && (
                <button
                  onClick={() => setTypeFilter(null)}
                  className="mt-2 hover:underline"
                  style={{ fontSize: 11, color: GOLD }}
                >
                  Clear filter ({typeFilter})
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3 — Gap Analysis */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Panel A — Isolated */}
        <Panel title="⚠ Unconnected Intelligence" subtitle="These nodes exist but IRIS hasn't linked them to anything yet">
          {isolated.isLoading ? (
            <Placeholder text="Loading…" />
          ) : filteredIsolated.length === 0 ? (
            <EmptyOK text="✅ All nodes are connected" />
          ) : (
            <ul className="space-y-2">
              {filteredIsolated.slice(0, 20).map((n: any) => (
                <li
                  key={n.id}
                  className="rounded-md p-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="inline-block rounded px-1.5 py-0.5"
                          style={{
                            background: `${colorFor(n.node_type)}22`,
                            color: colorFor(n.node_type),
                            fontSize: 10,
                          }}
                        >
                          {n.node_type}
                        </span>
                        <span style={{ fontSize: 10, color: STEEL }}>
                          {n.confidence_level ?? "—"} · {n.source ?? "unknown"}
                        </span>
                      </div>
                      <div className="text-white mt-1" style={{ fontSize: 12 }}>
                        {String(n.label ?? "").slice(0, 60)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => connect.mutate(n.id)}
                      disabled={connect.isPending}
                      className="rounded-md px-2 py-1 shrink-0"
                      style={{
                        fontSize: 11,
                        color: GOLD,
                        border: `1px solid ${GOLD}`,
                        background: "transparent",
                        opacity: connect.isPending && connect.variables === n.id ? 0.5 : 1,
                      }}
                    >
                      {connect.isPending && connect.variables === n.id ? "…" : "Connect"}
                    </button>
                  </div>
                </li>
              ))}
              {filteredIsolated.length > 20 && (
                <li style={{ fontSize: 11, color: STEEL }}>
                  +{filteredIsolated.length - 20} more isolated nodes
                </li>
              )}
            </ul>
          )}
        </Panel>

        {/* Panel B — Strongest chains */}
        <Panel title="⚡ Strongest Evidence Chains" subtitle="The most powerful reasoning paths IRIS has found">
          {chains.isLoading ? (
            <Placeholder text="Loading…" />
          ) : (chains.data?.chains?.length ?? 0) < 1 ? (
            <div>
              <Placeholder text="IRIS needs more connections to identify strong evidence chains. Refresh the graph or add more source documents." />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                  className="rounded-md px-2 py-1"
                  style={{ fontSize: 11, color: GOLD, border: `1px solid ${GOLD}` }}
                >
                  ⚡ Refresh Graph Now
                </button>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {(chains.data?.chains ?? []).map((ch: any, i: number) => (
                <li
                  key={i}
                  className="rounded-md p-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    {ch.nodes.map((n: any, j: number) => (
                      <span key={n.id} className="flex items-center gap-1">
                        <span
                          className="inline-block rounded px-1.5 py-0.5 truncate max-w-[120px]"
                          style={{
                            background: `${colorFor(n.node_type)}22`,
                            color: colorFor(n.node_type),
                            fontSize: 11,
                          }}
                          title={n.label}
                        >
                          {n.label}
                        </span>
                        {j < ch.nodes.length - 1 && (
                          <span style={{ color: STEEL }}>→</span>
                        )}
                      </span>
                    ))}
                    <span className="ml-auto" style={{ fontSize: 11, color: GOLD }}>
                      {ch.total}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Panel C — Coverage gaps */}
        <Panel title="🔴 Coverage Gaps" subtitle="RFP requirements with no connected evidence">
          {gaps.isLoading ? (
            <Placeholder text="Loading…" />
          ) : (gaps.data?.gaps?.length ?? 0) === 0 ? (
            <EmptyOK text="✅ All requirements have connected evidence" />
          ) : (
            <ul className="space-y-2">
              {(gaps.data?.gaps ?? []).slice(0, 20).map((g: any) => (
                <li
                  key={g.question_id}
                  className="rounded-md p-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div style={{ fontSize: 10, color: STEEL }}>
                        {g.question_number ?? "Q"}{" "}
                        {g.point_value != null ? `· ${g.point_value} pts` : ""}
                      </div>
                      <div className="text-white mt-0.5" style={{ fontSize: 12 }}>
                        {String(g.question_text ?? "").slice(0, 50)}
                      </div>
                      <div style={{ fontSize: 10, color: RED, marginTop: 2 }}>
                        No evidence connected
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => findEv.mutate(g.question_id)}
                      disabled={findEv.isPending}
                      className="rounded-md px-2 py-1 shrink-0"
                      style={{
                        fontSize: 11,
                        color: GOLD,
                        border: `1px solid ${GOLD}`,
                        background: "transparent",
                        opacity:
                          findEv.isPending && findEv.variables === g.question_id ? 0.5 : 1,
                      }}
                    >
                      {findEv.isPending && findEv.variables === g.question_id
                        ? "…"
                        : "Find Evidence →"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(5,13,24,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: STEEL }}>
        {label}
      </div>
      <div className="mt-1" style={{ fontSize: 22, fontWeight: 600, color }}>
        {loading ? "…" : value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(5,13,24,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "white", fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11, color: STEEL }}>{subtitle}</div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{ background: "rgba(255,255,255,0.02)", fontSize: 12, color: STEEL }}
    >
      {text}
    </div>
  );
}

function EmptyOK({ text }: { text: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{ background: "rgba(91,168,134,0.08)", border: "1px solid rgba(91,168,134,0.3)", color: GREEN, fontSize: 12 }}
    >
      {text}
    </div>
  );
}
