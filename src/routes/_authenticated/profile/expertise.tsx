import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExpertiseProfileEditor } from "@/components/v2/ExpertiseProfileEditor";

export const Route = createFileRoute("/_authenticated/profile/expertise")({
  component: MyExpertisePage,
});

function MyExpertisePage() {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  if (!meId) {
    return <div className="mx-auto max-w-2xl px-8 py-10 text-sm text-muted-foreground">One moment…</div>;
  }
  return (
    <ExpertiseProfileEditor
      profileId={meId}
      onClose={() => {
        window.history.back();
      }}
    />
  );
}
