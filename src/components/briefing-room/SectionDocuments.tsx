import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText } from "lucide-react";
import { getDocuments } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";

export function SectionDocuments({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getDocuments);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "docs", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const allDocs = (data.groups ?? []).flatMap((g: any) => (g.docs ?? []).map((d: any) => ({ ...d, _group: g.key })));

  return (
    <SectionCard
      title="Key Documents"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=1B`}
    >
      {allDocs.length === 0 ? (
        <Empty>No documents linked yet. Add them in Olympus.</Empty>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allDocs.map((d: any) => {
            const href = d.file_url || d.source_url;
            const inner = (
              <>
                <FileText className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }} />
                <span className="truncate" style={{ color: "white", fontSize: 11 }}>
                  {d.title}
                </span>
                {href && <ExternalLink className="h-3 w-3 shrink-0" style={{ color: "#C49A2B" }} />}
              </>
            );
            const className =
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 max-w-[280px]";
            const style: React.CSSProperties = {
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.07)",
            };
            return href ? (
              <a
                key={d.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${className} hover:bg-white/[0.06]`}
                style={style}
              >
                {inner}
              </a>
            ) : (
              <div key={d.id} className={className} style={style}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
