// Isomorphic loader for the client-only RFP text extractor.
// The server-side variant is unreachable (browser File API doesn't exist),
// but routing through createIsomorphicFn lets the import-protection plugin
// see that the `.client` module is gated and not statically reachable from server code.
import { createIsomorphicFn } from "@tanstack/react-start";
import type { RFPFileKind } from "@/lib/extract-rfp-text.client";

type ExtractMod = {
  extractRFPText: (file: File) => Promise<string>;
  detectRFPKind: (file: File) => RFPFileKind | null;
};

export const loadRFPExtractor = createIsomorphicFn()
  .client(async (): Promise<ExtractMod> => {
    const mod = await import("@/lib/extract-rfp-text.client");
    return { extractRFPText: mod.extractRFPText, detectRFPKind: mod.detectRFPKind };
  })
  .server((): Promise<ExtractMod> => {
    throw new Error("extract-rfp-text is client-only");
  });
