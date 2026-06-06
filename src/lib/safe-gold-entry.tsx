import { Component, type ComponentType, type ReactNode } from "react";

/**
 * Resolve GoldEntryLine from a module-like object, falling back to a no-op
 * component if the export is missing, not a function, or accessing it throws.
 *
 * Extracted so we can unit-test the fallback path by passing a fake module
 * (see /debug/gold-entry-fallback).
 */
export function resolveGoldEntryLine(mod: unknown): ComponentType {
  try {
    const candidate = (mod as { GoldEntryLine?: unknown } | null | undefined)
      ?.GoldEntryLine;
    if (typeof candidate === "function") {
      return candidate as ComponentType;
    }
  } catch {
    /* swallow — fall through to no-op */
  }
  return function GoldEntryLineFallback() {
    return null;
  };
}

/**
 * React error boundary that swallows render-time throws and renders nothing.
 * Required because a plain try/catch around <Cmp /> only catches errors
 * thrown during element construction, not during the actual render phase.
 * Works on both SSR (renderToString re-throws inside the boundary) and CSR.
 */
class RenderBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* intentionally silent — fallback is rendering null */
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/** Wraps a resolved component in an error boundary so a render-time throw
 *  can't crash the root layout. */
export function SafeRender({ Cmp }: { Cmp: ComponentType }) {
  return (
    <RenderBoundary>
      <Cmp />
    </RenderBoundary>
  );
}
