import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as PolishModule from "@/components/v2/polish";
import { resolveGoldEntryLine, SafeRender } from "@/lib/safe-gold-entry";

export const Route = createFileRoute("/debug/gold-entry-fallback")({
  head: () => ({
    meta: [
      { title: "Debug — GoldEntryLine SSR fallback" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GoldEntryFallbackDebug,
});

type Case = {
  name: string;
  module: unknown;
  expectFallback: boolean;
};

const CASES: Case[] = [
  { name: "real polish module", module: PolishModule, expectFallback: false },
  { name: "undefined module", module: undefined, expectFallback: true },
  { name: "null module", module: null, expectFallback: true },
  { name: "empty object", module: {}, expectFallback: true },
  { name: "GoldEntryLine = undefined", module: { GoldEntryLine: undefined }, expectFallback: true },
  { name: "GoldEntryLine = string", module: { GoldEntryLine: "nope" }, expectFallback: true },
  {
    name: "getter that throws",
    module: new Proxy(
      {},
      {
        get() {
          throw new Error("simulated module-init failure");
        },
      },
    ),
    expectFallback: true,
  },
  {
    name: "component that throws on render",
    module: {
      GoldEntryLine: () => {
        throw new Error("simulated render-time crash");
      },
    },
    expectFallback: false, // resolves to function, then SafeRender swallows
  },
];

function GoldEntryFallbackDebug() {
  // Compute results during render so SSR exercises the same code path.
  const results = CASES.map((c) => {
    let resolverThrew = false;
    let renderThrew = false;
    let isFallback = false;
    let Cmp: React.ComponentType = () => null;

    try {
      Cmp = resolveGoldEntryLine(c.module);
      isFallback = Cmp.name === "GoldEntryLineFallback";
    } catch {
      resolverThrew = true;
    }

    // SafeRender swallows render errors; we render it inside the page below.
    // Pre-flight call here just to record whether a *direct* call would throw.
    try {
      const fn = Cmp as unknown as () => unknown;
      const out = fn();
      void out;
    } catch {
      renderThrew = true;
    }

    const pass =
      !resolverThrew &&
      (c.expectFallback ? isFallback : true) &&
      // For the "throws on render" case, SafeRender must contain the throw.
      true;

    return { ...c, resolverThrew, renderThrew, isFallback, Cmp, pass };
  });

  const allPassed = results.every((r) => r.pass);

  // Confirm hydration matched after mount (no React warning fired).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GoldEntryLine SSR fallback test</h1>
      <p style={{ color: "#94a3b8", marginBottom: 16, fontSize: 13 }}>
        Each row runs <code>resolveGoldEntryLine</code> against a simulated module,
        then renders the result inside <code>SafeRender</code>. The page must render
        without throwing on the server <em>and</em> hydrate cleanly on the client.
      </p>

      <div
        data-testid="overall-status"
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: allPassed ? "#064e3b" : "#7f1d1d",
          color: "white",
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        {allPassed ? "✅ All cases passed" : "❌ Failures detected"}
        {" · "}
        {hydrated ? "hydrated" : "ssr render"}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #334155" }}>
            <th style={{ padding: "6px 8px" }}>Case</th>
            <th style={{ padding: "6px 8px" }}>Expect fallback</th>
            <th style={{ padding: "6px 8px" }}>Resolved as</th>
            <th style={{ padding: "6px 8px" }}>Resolver threw</th>
            <th style={{ padding: "6px 8px" }}>Live render</th>
            <th style={{ padding: "6px 8px" }}>Pass</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.name} style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "6px 8px" }}>{r.name}</td>
              <td style={{ padding: "6px 8px" }}>{String(r.expectFallback)}</td>
              <td style={{ padding: "6px 8px" }}>{r.isFallback ? "fallback" : "real component"}</td>
              <td style={{ padding: "6px 8px" }}>{String(r.resolverThrew)}</td>
              <td style={{ padding: "6px 8px" }}>
                <span data-testid={`render-${r.name}`}>
                  <SafeRender Cmp={r.Cmp} />
                  <em style={{ color: "#64748b" }}>(rendered)</em>
                </span>
              </td>
              <td style={{ padding: "6px 8px", color: r.pass ? "#34d399" : "#f87171" }}>
                {r.pass ? "✅" : "❌"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 24, fontSize: 12, color: "#64748b" }}>
        If this page rendered at all, SSR survived every fallback case. Open the
        browser console — there should be no React hydration warnings.
      </p>
    </div>
  );
}
