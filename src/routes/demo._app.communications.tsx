import { createFileRoute } from "@tanstack/react-router";
import { BRAND, serif, Avatar, PageHeader } from "@/components/asg/shell";
import { Pin } from "lucide-react";

export const Route = createFileRoute("/demo/_app/communications")({
  component: Communications,
});

function Communications() {
  return (
    <div className="px-10 py-10">
      <PageHeader
        eyebrow="LEADERSHIP COMMUNICATIONS"
        title="From the partners."
        subtitle="The official channel. Read, acknowledge, carry forward."
      />

      <div className="space-y-6">
        {/* Pinned broadcast */}
        <article className="border bg-white" style={{ borderColor: BRAND.border, borderLeft: `3px solid ${BRAND.gold}` }}>
          <div className="flex items-center justify-between px-7 pt-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.22em]" style={{ color: BRAND.gold }}>
                <Pin className="h-3 w-3" /> BROADCAST · PINNED
              </span>
            </div>
            <span className="text-xs text-neutral-500">Posted Tuesday, 7:14 AM EST</span>
          </div>
          <div className="px-7 py-5">
            <h2 style={{ ...serif, color: BRAND.navy }} className="text-3xl leading-tight">
              Q1 Win Themes — read before Friday's all-hands.
            </h2>
            <div className="mt-4 flex items-center gap-3 text-sm text-neutral-600">
              <Avatar name="Renée Halloran" tone="navy" />
              <span>Dr. Renée Halloran · Managing Partner</span>
            </div>
            <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-neutral-800">
              <p>
                We're entering a quarter where every state we touch is rewriting how it pays for behavioral health
                integration. The three themes attached are not slogans — they're the lens through which every section
                you write should be read by an evaluator.
              </p>
              <p>
                Please review before Friday. Bring one example from your current draft that lives one of these themes,
                and one place where we're still saying things we don't yet believe. The Collective grows on the second
                kind of honesty.
              </p>
            </div>
            <div className="mt-7 flex items-center gap-3 border-t pt-5" style={{ borderColor: BRAND.border }}>
              <button
                className="px-5 py-2 text-[11px] font-semibold tracking-[0.18em] text-white"
                style={{ background: BRAND.navy }}
              >
                ACKNOWLEDGE
              </button>
              <span className="text-xs text-neutral-500">22 of 31 partners acknowledged</span>
            </div>
          </div>
        </article>

        {/* Direct message */}
        <article className="border bg-white" style={{ borderColor: BRAND.border }}>
          <div className="flex items-center justify-between px-7 pt-6">
            <span className="text-[10px] font-semibold tracking-[0.22em] text-neutral-500">
              DIRECT · FOR YOU
            </span>
            <span className="text-xs text-neutral-500">Yesterday, 4:48 PM EST</span>
          </div>
          <div className="px-7 py-5">
            <h2 style={{ ...serif, color: BRAND.navy }} className="text-2xl leading-tight">
              Your Care Coordination section — light edit, strong instinct.
            </h2>
            <div className="mt-3 flex items-center gap-3 text-sm text-neutral-600">
              <Avatar name="Marcus Tolliver" tone="navy" />
              <span>Marcus Tolliver · Engagement Lead, OH-MCO-2026</span>
            </div>
            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-neutral-800">
              <p>
                Alex — read v2 last night. The transitions-of-care narrative is the strongest version we've put on
                paper for Ohio. Two evaluator-eye tweaks in the margins; nothing structural. Send it on when ready.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-3 border-t pt-4" style={{ borderColor: BRAND.border }}>
              <button
                className="px-5 py-2 text-[11px] font-semibold tracking-[0.18em]"
                style={{ background: "transparent", color: BRAND.navy, border: `1px solid ${BRAND.navy}` }}
              >
                ACKNOWLEDGE
              </button>
              <button className="text-xs text-neutral-500 hover:underline">Open thread</button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
