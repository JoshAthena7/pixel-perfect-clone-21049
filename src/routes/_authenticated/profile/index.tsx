import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { HelpCircle, LifeBuoy, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ExpertiseProfileEditor } from "@/components/v2/ExpertiseProfileEditor";
import { DataPrivacyPanel } from "@/components/v2/DataPrivacyPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const profileSearch = z.object({
  tab: z.enum(["profile", "privacy", "help"]).optional(),
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
          search: { tab: value === "profile" ? undefined : (value as "privacy" | "help") },
          replace: true,
        })
      }
      className="w-full"
    >
      <div className="border-b border-white/8 px-8 pt-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="privacy">Data &amp; Privacy</TabsTrigger>
          <TabsTrigger value="help">Help &amp; Support</TabsTrigger>
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

      <TabsContent value="help" className="mt-0">
        <HelpPanel />
      </TabsContent>
    </Tabs>
  );
}

function HelpPanel() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400/90">
        <LifeBuoy className="h-3.5 w-3.5" />
        Support
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Need a hand?</h1>
      <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-2xl">
        Ping the Atlas team directly from here. We respond inside the platform — no
        ticket queues, no email loops.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-support"))}
          className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.02] px-5 py-4 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/[0.04]"
        >
          <MessageSquare className="mt-0.5 h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-[13px] font-semibold text-foreground/95">
              Open support chat
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              Send a message to the Atlas team. Use this for bugs, questions, or
              feature requests.
            </p>
          </div>
        </button>

        <div className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.02] px-5 py-4">
          <HelpCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-[13px] font-semibold text-foreground/95">
              Email
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              <a
                href="mailto:support@athenacommandcenter.com"
                className="text-cyan-400 hover:underline"
              >
                support@athenacommandcenter.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-[11px] text-muted-foreground/70">
        Typical response time during business hours: under 2 hours.
      </p>
    </div>
  );
}
