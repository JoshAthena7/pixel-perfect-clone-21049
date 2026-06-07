import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
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
    <div className="mx-auto max-w-3xl px-8 py-6">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/40 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Update from a resume</div>
          <div className="text-[12px] text-muted-foreground">
            Upload a fresh resume and IRIS will refresh your expertise tags, summary, and credentials.
          </div>
        </div>
        <Link
          to="/profile/expertise"
          search={{ "profile-setup": "1" } as never}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-hover"
        >
          <Upload className="h-3.5 w-3.5" /> Re-upload resume
        </Link>
      </div>
      <ExpertiseProfileEditor
        profileId={meId}
        onClose={() => {
          window.history.back();
        }}
      />
    </div>
  );
}

