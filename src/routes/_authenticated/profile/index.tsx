import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ExpertiseProfileEditor } from "@/components/v2/ExpertiseProfileEditor";
import { DataPrivacyPanel } from "@/components/v2/DataPrivacyPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const profileSearch = z.object({
  tab: z.enum(["profile", "privacy"]).optional(),
});

export const Route = createFileRoute("/_authenticated/profile/")({
  component: MyProfilePage,
  validateSearch: profileSearch,
});

function MyProfilePage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
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
    <Tabs
      value={tab ?? "profile"}
      onValueChange={(value) =>
        navigate({
          to: "/profile",
          search: { tab: value === "profile" ? undefined : (value as "privacy") },
          replace: true,
        })
      }
      className="w-full"
    >
      <div className="border-b border-white/8 px-8 pt-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="privacy">Data &amp; Privacy</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="profile" className="mt-0">
        <ExpertiseProfileEditor
          profileId={meId}
          onClose={() => navigate({ to: "/home" })}
        />
      </TabsContent>

      <TabsContent value="privacy" className="mt-0">
        <DataPrivacyPanel />
      </TabsContent>
    </Tabs>
  );
}
