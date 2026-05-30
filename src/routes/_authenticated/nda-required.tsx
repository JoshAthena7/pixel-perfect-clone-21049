import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, Lock } from "lucide-react";
import { useEngagement } from "@/hooks/use-engagement";

export const Route = createFileRoute("/_authenticated/nda-required")({
  component: NdaRequiredPage,
});

function NdaRequiredPage() {
  const { engagement, member } = useEngagement();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0F1A] px-6">
      <div className="max-w-lg w-full rounded-2xl border border-[#C49A2A]/30 bg-[#141628] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#C49A2A]/10 ring-1 ring-[#C49A2A]/40">
          <ShieldAlert className="h-7 w-7 text-[#C49A2A]" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#C49A2A] font-semibold mb-2">
          Restricted Access
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">NDA confirmation required</h1>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          Access to {engagement?.name ? <span className="text-zinc-200 font-medium">{engagement.name}</span> : "this engagement"}{" "}
          is locked until leadership confirms your signed NDA is on file. This protects
          competitive intelligence, win themes, and pricing strategy.
        </p>
        <div className="rounded-lg border border-zinc-800 bg-black/30 p-4 text-left text-xs text-zinc-400 space-y-2">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold uppercase tracking-wider text-[10px]">
            <Lock className="h-3.5 w-3.5 text-[#C49A2A]" /> What happens next
          </div>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Sign and return your NDA to your engagement leader.</li>
            <li>A founder, PM, or engagement lead marks your NDA as confirmed in the Collective™.</li>
            <li>Refresh this page and you'll be routed into the Mission.</li>
          </ol>
        </div>
        {member?.display_name && (
          <div className="mt-6 text-[11px] text-zinc-500">
            Signed in as <span className="text-zinc-300">{member.display_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
