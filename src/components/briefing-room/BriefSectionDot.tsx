import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getBriefUpdateSignals,
  dismissBriefUpdateSignalsForSection,
  type BriefSection,
} from "@/lib/brief-update-signals.functions";

const AMBER = "#f0c040";

/**
 * Subtle amber dot rendered next to a Mission Brief section label when
 * IRIS has detected high-significance intel that may affect this section.
 * Clicking the dot marks the matching signals dismissed and navigates the
 * user to the Intelligence Feed.
 */
export function BriefSectionDot({
  missionId,
  section,
}: {
  missionId: string;
  section: BriefSection;
}) {
  const fetchSignals = useServerFn(getBriefUpdateSignals);
  const dismissFn = useServerFn(dismissBriefUpdateSignalsForSection);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["brief-update-signals", missionId],
    queryFn: () => fetchSignals({ data: { missionId } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const entry = data?.sections?.[section];
  if (!entry || entry.count <= 0) return null;

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await dismissFn({ data: { missionId, section } });
    } catch (err) {
      console.error("[BriefSectionDot] dismiss failed", err);
    }
    qc.invalidateQueries({ queryKey: ["brief-update-signals", missionId] });
    navigate({ to: "/missions/$missionId/oracle", params: { missionId } });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New intel may affect this section — review in Intelligence."
      title="New intel may affect this section — review in Intelligence."
      className="inline-flex items-center justify-center rounded-full transition-transform hover:scale-110"
      style={{
        width: 8,
        height: 8,
        background: AMBER,
        boxShadow: `0 0 0 3px ${AMBER}22`,
        marginLeft: 8,
        verticalAlign: "middle",
        cursor: "pointer",
      }}
    />
  );
}
