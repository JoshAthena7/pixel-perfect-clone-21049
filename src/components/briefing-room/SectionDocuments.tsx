import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText } from "lucide-react";
import { getDocuments } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";

const GROUP_LABEL: Record<string, string> = {
  rfp: "RFP Documents",
  amendment: "Amendments",
  qa: "Q&A",
  compliance: "Compliance",
  style: "Style Guides",
  other: "Other",
};

export function SectionDocuments({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getDocuments);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "docs", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  return (
    <SectionCard
      title="Key Documents"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=1B`}
    >
      {data.groups.length === 0 ? (
        <Empty>No documents linked yet. Add them in Olympus.</Empty>
      ) : (
        <div className="space-y-4">
          {data.groups.map((g) => (
            <div key={g.key}>
              <div
                className="mb-1.5"
                style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                {GROUP_LABEL[g.key] ?? g.key}
              </div>
              <ul className="space-y-1">
                {g.docs.map((d: any) => {
                  const href = d.file_url || d.source_url;
                  const inner = (
                    <>
                      <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
                      <span className="truncate flex-1" style={{ color: "white", fontSize: 11 }}>
                        {d.title}
                      </span>
                      {href && <ExternalLink className="h-3 w-3 shrink-0" style={{ color: "#C49A2B" }} />}
                    </>
                  );
                  return (
                    <li key={d.id}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/[0.03]"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 py-1.5 px-2">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4" style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontStyle: "italic" }}>
        Documents are managed in Olympus. Contact your Engagement Lead to add or update documents.
      </div>
    </SectionCard>
  );
}
