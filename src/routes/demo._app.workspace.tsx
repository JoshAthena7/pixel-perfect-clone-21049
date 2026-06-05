import { createFileRoute } from "@tanstack/react-router";
import { BRAND, serif } from "@/components/asg/shell";
import { Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/demo/_app/workspace")({
  component: Workspace,
});

const INTEL = [
  {
    type: "PRECEDENT",
    title: "PA HealthChoices 2023 — § E.4 transitions language",
    body: "Scored top-quartile on continuity. Direct lift candidate for paragraph two.",
  },
  {
    type: "EVALUATOR SIGNAL",
    title: "Ohio scoring rubric weights specificity 2.4× over breadth",
    body: "Pull the county-by-county panel caps to the top; lead with numbers.",
  },
  {
    type: "WIN THEME",
    title: "Continuity is the Clinical Intervention",
    body: "Approved cross-engagement framing. Use as the section's first-paragraph anchor.",
  },
  {
    type: "RISK FLAG",
    title: "Cuyahoga County FQHC saturation",
    body: "Three competitors named the same FQHC partners last cycle. Differentiate explicitly.",
  },
];

function Workspace() {
  return (
    <div className="grid min-h-screen grid-cols-10">
      <section className="col-span-6 border-r px-10 py-10" style={{ borderColor: BRAND.border, background: "#fff" }}>
        <div className="mb-1 text-[10px] tracking-[0.22em] text-neutral-500">OH-MCO-2026 · § E.4 · DRAFTING v3</div>
        <h1 style={{ ...serif, color: BRAND.navy }} className="text-4xl leading-tight">
          Care Coordination Approach
        </h1>
        <div className="mt-6 border-t border-b py-3 text-xs text-neutral-500" style={{ borderColor: BRAND.border }}>
          Autosaved 12 seconds ago · 1,847 words · Reading time 7 min
        </div>

        <div className="mt-8 space-y-5 text-[15px] leading-[1.8] text-neutral-800">
          <p className="text-neutral-500">[Draft in progress — anchor with approved win theme, then commit to numbers.]</p>
          <p>
            Continuity is the clinical intervention. Athena's care coordination model for Ohio Medicaid members
            treats every transition — between settings, providers, and life stages — as a clinical event worth
            measuring and worth defending.
          </p>
          <p>
            For the seven highest-utilization counties, Athena will embed care managers within FQHCs and CMHCs,
            with panel caps of 60 members (50 in Cuyahoga, where acuity skews higher). Each manager makes contact
            within 48 hours of any inpatient or ED encounter — the standard our team helped author for Pennsylvania
            HealthChoices in 2023, where it moved 30-day readmissions down 11.4 percent in the first year.
          </p>
          <p className="text-neutral-400 italic">
            [Continue: shared care record, member-directed goals, accountability cadence with the State…]
          </p>
        </div>
      </section>

      <aside className="col-span-4 px-7 py-7" style={{ background: BRAND.bg }}>
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: BRAND.navy }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: BRAND.gold }} />
          </div>
          <div>
            <div style={{ ...serif, color: BRAND.navy }} className="text-lg leading-none">From IRIS</div>
            <div className="text-[10px] tracking-[0.18em] text-neutral-500">CONTEXTUAL — § E.4</div>
          </div>
        </div>

        <div className="space-y-3">
          {INTEL.map((it, i) => (
            <div key={i} className="border bg-white" style={{ borderColor: BRAND.border }}>
              <div className="px-4 pt-3">
                <span className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: BRAND.gold }}>
                  {it.type}
                </span>
              </div>
              <div className="px-4 pb-3">
                <div className="text-sm font-medium" style={{ color: BRAND.navy }}>{it.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-neutral-600">{it.body}</div>
                <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold tracking-[0.14em]" style={{ color: BRAND.navy }}>
                  USE THIS <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs italic text-neutral-500" style={serif}>
          "Hephaestus shaped at the forge with one hand on the work and one on the fire. So with the draft." — IRIS
        </p>
      </aside>
    </div>
  );
}
