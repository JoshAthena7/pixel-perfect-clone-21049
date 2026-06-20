/**
 * Slim amber banner shown on the ORACLE page when one or more REQUIRED
 * checklist documents are missing. Click "Upload now →" to open the Feed
 * ATLAS drawer's Documents tab. Dismissible per session.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  REQUIRED_DOCUMENTS,
  matchDocumentToChecklist,
} from "./oracle-checklist-spec";

const DISMISS_KEY = (missionId: string) => `oracle-missing-banner-dismissed:${missionId}`;
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export function OracleMissingDocsBanner({
  missionId,
  onOpenUpload,
}: {
  missionId: string;
  onOpenUpload: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [docs, setDocs] = useState<Array<{
    title: string | null;
    document_checklist_category: string | null;
    processing_status: string | null;
  }>>([]);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(DISMISS_KEY(missionId)) : null;
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
        setDismissed(true);
      }
    }
  }, [missionId]);

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
      const match = docs.find((d) => {
        const cat = d.document_checklist_category ?? matchDocumentToChecklist(d.title);
        return cat === req.id;
      });
      return !match || match.processing_status === "error";
    });
  }, [docs]);

  if (dismissed || missing.length === 0) return null;

  return (
    <div
      className="w-full flex items-center justify-between px-4"
      style={{
        height: 36,
        background: "rgba(251,191,36,0.08)",
        borderBottom: "1px solid rgba(251,191,36,0.2)",
      }}
    >
      <div className="flex items-center gap-2 text-[11px] text-amber-200/90">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <span>
          <span className="font-semibold text-amber-200">ORACLE is missing critical documents</span>{" "}
          — IRIS briefs may be incomplete.{" "}
          <span className="text-amber-200/70">
            {missing.map((m) => m.label).slice(0, 2).join(" · ")}
            {missing.length > 2 ? ` · +${missing.length - 2} more` : ""} not uploaded.
          </span>
        </span>
        <button
          type="button"
          onClick={onOpenUpload}
          className="text-amber-300 hover:text-amber-200 underline ml-2"
          style={{ fontSize: 11 }}
        >
          Upload now →
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(DISMISS_KEY(missionId), String(Date.now()));
          }
        }}
        className="text-amber-300/60 hover:text-amber-200"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
