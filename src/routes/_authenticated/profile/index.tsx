import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExpertiseProfileEditor } from "@/components/v2/ExpertiseProfileEditor";

export const Route = createFileRoute("/_authenticated/profile/")({
  component: MyProfilePage,
});

function MyProfilePage() {
  const navigate = useNavigate();
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  if (!meId) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-10 text-sm text-muted-foreground">
        Loading your profile…
      </div>
    );
  }

  return (
    <ExpertiseProfileEditor
      profileId={meId}
      onClose={() => navigate({ to: "/home" })}
    />
  );
}
