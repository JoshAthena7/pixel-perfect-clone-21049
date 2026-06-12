import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, FileText } from "lucide-react";
import { ErrorBanner, EmptyState, SkeletonList, OlympusLink } from "./OracleShared";
import type { Database } from "@/integrations/supabase/types";

type Doc = Database["public"]["Tables"]["mission_documents"]["Row"];

const TYPE_LABELS: Record<string, string> = {
  government_report: "Government Reports",
  research: "Peer-Reviewed Research",
  news: "News and Articles",
  rfp: "RFP Documents",
  internal: "Internal Documents",
};

export function OracleResearchLibrary({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-research", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_documents")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, Doc[]>();
    (data ?? []).forEach((d) => {
      const key = d.document_type ?? "other";
      (map.get(key) ?? map.set(key, []).get(key)!).push(d);
    });
    return Array.from(map.entries());
  }, [data]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  return (
    <div className="space-y-3">
      {isAdmin && <OlympusLink>Manage research in Olympus →</OlympusLink>}
      {isLoading ? (
        <SkeletonList count={3} />
      ) : groups.length === 0 ? (
        <EmptyState>No research documents yet. Add them in Olympus.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map(([type, docs]) => (
            <div key={type}>
              <div
                className="mb-1"
                style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}
              >
                {TYPE_LABELS[type] ?? type.replace(/_/g, " ")}
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {docs.map((d, i) => (
                  <DocRow key={d.id} doc={d} isFirst={i === 0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="italic text-center pt-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        Research documents added by Olympus and surfaced by IRIS. Documents are managed in Olympus.
      </div>
    </div>
  );
}

function DocRow({ doc, isFirst }: { doc: Doc; isFirst: boolean }) {
  const url = doc.source_url ?? doc.file_url ?? null;
  const addedByIris = !doc.uploaded_by;
  return (
    <a
      href={url ?? "#"}
      target={url ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors"
      style={{ borderTop: isFirst ? "none" : "1px solid rgba(255,255,255,0.05)" }}
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
      <div className="flex-1 min-w-0">
        <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 500 }}>
          {doc.title}
        </div>
        {doc.content_summary && (
          <div className="truncate" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
            {doc.content_summary}
          </div>
        )}
      </div>
      <span
        className="rounded shrink-0"
        style={{
          padding: "1px 6px",
          fontSize: 9,
          background: addedByIris ? "rgba(140,130,230,0.1)" : "rgba(196,154,43,0.1)",
          color: addedByIris ? "rgba(140,130,230,0.9)" : "#C49A2B",
        }}
      >
        {addedByIris ? "Added by IRIS" : "Added by Olympus"}
      </span>
      {url && <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: "#C49A2B" }} />}
    </a>
  );
}
