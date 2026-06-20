/**
 * Compact "ORACLE missing" warning for the Intel Status widget.
 * Single line shown when required checklist documents are absent.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  REQUIRED_DOCUMENTS,
  matchDocumentToChecklist,
} from "./oracle-checklist-spec";

export function OracleMissingCompactWarning({ missionId }: { missionId: string }) {
  const [docs, setDocs] = useState<Array<{
    title: string | null;
    document_checklist_category: string | null;
    processing_status: string | null;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("mission_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("title, document_checklist_category, processing_status" as any)
        .eq("mission_id", missionId);
      if (!cancelled) setDocs((data ?? []) as never);
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  const missing = useMemo(() => {
    return REQUIRED_DOCUMENTS.filter((req) => {
      const m = docs.find((d) => {
        const cat = d.document_checklist_category ?? matchDocumentToChecklist(d.title);
        return cat === req.id;
      });
      return !m || m.processing_status === "error";
    });
  }, [docs]);

  if (missing.length === 0) return null;

  const labels = missing.map((m) => m.label.split(" ")[0]).slice(0, 4).join(" · ");

  return (
    <Link
      to="/missions/$missionId/olympus"
      params={{ missionId }}
      className="block mt-2 hover:underline"
      style={{ fontSize: 9, color: "rgba(251,191,36,0.85)" }}
    >
      ⚠ ORACLE missing: {labels}
    </Link>
  );
}
