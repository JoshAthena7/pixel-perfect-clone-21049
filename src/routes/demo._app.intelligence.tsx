import { createFileRoute } from "@tanstack/react-router";
import { BRAND, serif, PageHeader } from "@/components/asg/shell";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/demo/_app/intelligence")({
  component: Intelligence,
});

const HISTORY = [
  {
    q: "What's the strongest precedent we have for behavioral health integration in a Midwest Medicaid procurement?",
    a: "Three precedents stand out. The 2023 Michigan MI Health Link integration package — your team co-authored sections E.4 and E.6 — scored in the top quartile on \"integration of physical and behavioral services.\" Indiana 2022 used the same framing for crisis stabilization. And the Ohio 2019 pilot, though smaller, is the one Cuyahoga County evaluators still cite by name. I've pinned all three to the Ohio engagement vault.",
  },
  {
    q: "Has any state RFP this cycle moved on doula coverage as a measured benefit?",
    a: "Yes — three. New Jersey's 2026 reprocurement names doula access as a Quality Withhold metric (page 142). California's CalAIM amendment from January expands it under community supports. Pennsylvania has it in the BH carve-in technical appendix but not yet as a measured benefit. If Ohio follows the NJ pattern, expect language by April.",
  },
  {
    q: "Pull every Athena win theme that mentions \"transitions of care.\"",
    a: "Seven themes across five engagements. The cleanest articulation is from the 2024 Pennsylvania HealthChoices brief: \"Continuity is the clinical intervention.\" I'd anchor the Ohio § E.4 narrative there — it's already in the partners' shared vocabulary.",
  },
];

function Intelligence() {
  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <div className="text-center">
        <div className="mb-3 text-[10px] font-semibold tracking-[0.28em]" style={{ color: BRAND.gold }}>
          INTELLIGENCE
        </div>
        <h1 style={{ ...serif, color: BRAND.navy }} className="text-5xl">IRIS</h1>
        <p className="mt-3 text-sm italic text-neutral-600" style={serif}>
          The messenger between what you know and what you need to know.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-md border bg-white px-5 py-4 text-center" style={{ borderColor: BRAND.border }}>
        <div className="text-[10px] font-semibold tracking-[0.22em] text-neutral-500">ACTIVE ENGAGEMENT</div>
        <div className="mt-1 text-sm font-medium" style={{ color: BRAND.navy }}>Ohio Medicaid MCO Reprocurement</div>
        <div className="text-xs text-neutral-500">OH-MCO-2026 · Pens-down March 14</div>
      </div>

      <div className="mt-8 border bg-white" style={{ borderColor: BRAND.border, borderTop: `2px solid ${BRAND.gold}` }}>
        <textarea
          placeholder="Ask IRIS anything — precedents, evaluator patterns, draft critiques, market shifts…"
          className="h-28 w-full resize-none px-5 py-4 text-[15px] outline-none"
          style={serif}
        />
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-neutral-500" style={{ borderColor: BRAND.border, background: BRAND.fill }}>
          <span>Scoped to OH-MCO-2026 · 14,300 documents indexed</span>
          <button className="px-4 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-white" style={{ background: BRAND.navy }}>
            ASK
          </button>
        </div>
      </div>

      <div className="mt-12 space-y-8">
        <div className="text-[10px] font-semibold tracking-[0.22em] text-neutral-500">RECENT</div>
        {HISTORY.map((h, i) => (
          <div key={i} className="border bg-white" style={{ borderColor: BRAND.border }}>
            <div className="border-b px-6 py-4 text-sm text-neutral-500" style={{ borderColor: BRAND.border, background: BRAND.fill }}>
              {h.q}
            </div>
            <div className="flex gap-4 px-6 py-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: BRAND.navy }}>
                <Sparkles className="h-4 w-4" style={{ color: BRAND.gold }} />
              </div>
              <p className="text-[15px] leading-relaxed text-neutral-800">{h.a}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
