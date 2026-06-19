// ORACLE Document Processor — receives pre-extracted plain text from the
// browser (Documents tab in Olympus), chunks it, calls Lovable AI to extract
// intelligence items, and inserts them into oracle_signals.
//
// The route NEVER downloads files or parses PDF/DOCX — that happens client-side
// using the existing pdfjs/mammoth extractors. See src/components/olympus/DocumentsTab.tsx.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/oracle-document-processor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processDocument } = await import("@/lib/oracle/document-processor.server");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }

        const b = body as Record<string, unknown>;
        const document_id = typeof b.document_id === "string" ? b.document_id : "";
        const mission_id = typeof b.mission_id === "string" ? b.mission_id : "";
        const extracted_text = typeof b.extracted_text === "string" ? b.extracted_text : "";
        const document_title = typeof b.document_title === "string" ? b.document_title : "";
        const document_type = typeof b.document_type === "string" ? b.document_type : "other";
        const content_type_hint = typeof b.content_type_hint === "string" ? b.content_type_hint : null;
        const user_id = typeof b.user_id === "string" ? b.user_id : null;

        if (!document_id || !mission_id || !extracted_text || !document_title) {
          return json({ ok: false, error: "Missing required fields" }, 400);
        }
        if (extracted_text.length < 100) {
          return json({ ok: false, error: "Extracted text too short (<100 chars)" }, 400);
        }

        try {
          const result = await processDocument({
            documentId: document_id,
            missionId: mission_id,
            extractedText: extracted_text,
            documentTitle: document_title,
            documentType: document_type,
            contentTypeHint: content_type_hint,
            userId: user_id,
          });
          return json({ ok: true, ...result }, 200);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[oracle-document-processor] failed:", msg);
          return json({ ok: false, error: msg }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
