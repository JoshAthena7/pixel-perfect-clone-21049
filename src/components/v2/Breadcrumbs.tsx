import { Link, useRouterState, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function Breadcrumbs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string; questionId?: string };
  const missionId = params.missionId;
  const questionId = params.questionId;

  const { data: mission } = useQuery({
    queryKey: ["bc-mission", missionId],
    queryFn: async () => {
      if (!missionId) return null;
      const { data } = await supabase.from("missions").select("id,name").eq("id", missionId).maybeSingle();
      return data;
    },
    enabled: !!missionId,
  });

  const { data: question } = useQuery({
    queryKey: ["bc-question", questionId],
    queryFn: async () => {
      if (!questionId) return null;
      const { data } = await supabase.from("question_records").select("id,question_number,title").eq("id", questionId).maybeSingle();
      return data;
    },
    enabled: !!questionId,
  });

  if (!missionId) return null;

  const isQuestion = path.includes("/questions/") && !!questionId;
  const isQuestionsList = path.startsWith(`/missions/${missionId}/questions`) && !questionId;
  const isLibrary = path.endsWith("/library");
  const isOracle = path.endsWith("/briefing") || path.endsWith("/intelligence");
  const isOperations = path.endsWith("/operations");
  const isTeam = path.endsWith("/team");
  const isActivity = path.endsWith("/activity");
  const isSettings = path.endsWith("/settings");
  const isHome = path.endsWith("/overview") || path === `/missions/${missionId}`;

  const pageLabel = isQuestion ? "Q"
    : isQuestionsList ? "Studio"
    : isLibrary ? "Library"
    : isOracle ? "Intelligence"
    : isOperations ? "Operations"
    : isTeam ? "Team"
    : isActivity ? "Activity"
    : isSettings ? "Settings"
    : "";

  const crumbs: Array<{ label: string; to?: string; params?: any }> = [
    { label: "Home", to: "/home" },
    { label: mission?.name ?? "…", to: "/missions/$missionId/overview", params: { missionId } },
  ];

  if (isQuestion) {
    crumbs.push({ label: "Studio", to: "/missions/$missionId/questions", params: { missionId } });
    const qTitle = question ? `Q${question.question_number} ${(question.title ?? "").slice(0, 30)}${(question.title?.length ?? 0) > 30 ? "…" : ""}` : "…";
    crumbs.push({ label: qTitle });
  } else if (!isHome && pageLabel) {
    crumbs.push({ label: pageLabel });
  }

  return (
    <div className="border-b border-border bg-background/60 px-8 h-8 flex items-center text-xs">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="mx-2 text-muted-foreground/40">/</span>}
            {c.to && !isLast ? (
              <Link to={c.to as any} params={c.params} className="text-muted-foreground hover:text-foreground transition">
                {c.label}
              </Link>
            ) : (
              <span className="text-muted-foreground/60">{c.label}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
