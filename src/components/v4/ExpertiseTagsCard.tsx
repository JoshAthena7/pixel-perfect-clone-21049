import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Tag, ArrowRight } from "lucide-react";

/**
 * Workaround until Talentdesk auto-tags staff on import: prompt each
 * consultant to self-tag their expertise so Phone-a-Friend can find them.
 * Auto-hides once the profile is marked complete.
 */
export function ExpertiseTagsCard() {
  const { data } = useQuery({
    queryKey: ["me-expertise-status"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("id, profile_completed, expertise_areas, states_experience")
        .eq("id", u.user.id)
        .maybeSingle();
      return p;
    },
  });

  if (!data) return null;
  if (data.profile_completed) return null;

  const hasAny =
    (data.expertise_areas?.length ?? 0) > 0 ||
    (data.states_experience?.length ?? 0) > 0;

  return (
    <section>
      <Link
        to="/profile/expertise"
        className="block rounded-[12px] border border-border bg-surface p-6 transition hover:border-foreground/30"
        style={{ borderColor: "rgba(245,158,11,0.4)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(245,158,11,0.12)", color: "rgb(245,158,11)" }}
          >
            <Tag className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                {hasAny ? "Finish your expertise profile" : "Tell us what you're an expert in"}
              </h3>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasAny
                ? "Add a few more tags so teammates can find you when they Phone-a-Friend."
                : "Tag your domains, states, and programs so the right people get pinged on the right questions. Takes ~2 minutes."}
            </p>
          </div>
        </div>
      </Link>
    </section>
  );
}
