import type { ComponentType } from "react";

/**
 * Resolve GoldEntryLine from a module-like object, falling back to a no-op
 * component if the export is missing, not a function, or accessing it throws.
 *
 * Extracted so we can unit-test the fallback path by passing a fake module
 * (see /debug/gold-entry-fallback).
 */
export function resolveGoldEntryLine(
  mod: unknown,
): ComponentType {
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

/** Wraps a resolved component in a try/catch so a render-time throw can't
 *  crash the root layout. */
export function SafeRender({ Cmp }: { Cmp: ComponentType }) {
  try {
    return <Cmp />;
  } catch {
    return null;
  }
}
