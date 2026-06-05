import { createFileRoute } from "@tanstack/react-router";
import { BRAND, serif, PageHeader } from "@/components/asg/shell";

export const Route = createFileRoute("/demo/_app/archive")({
  component: Archive,
});

const CARDS = [
  { type: "RFP ANALYSIS", title: "Ohio Medicaid MCO — Evaluator Pattern Map", eng: "OH-MCO-2026", date: "Feb 18, 2026" },
  { type: "MISSION BRIEF", title: "Behavioral Health Carve-In: PA HealthChoices", eng: "PA-BH-2026", date: "Feb 04, 2026" },
  { type: "WIN THEME", title: "Continuity is the Clinical Intervention", eng: "Cross-engagement", date: "Jan 22, 2026" },
  { type: "AFTER-ACTION", title: "Michigan MI Health Link — What Won, What Almost Didn't", eng: "MI-MCO-2024", date: "Dec 09, 2024" },
  { type: "RFP ANALYSIS", title: "CMS Medicare Advantage Stars — Quality Strategy Decoder", eng: "CMS-MA-2026", date: "Jan 30, 2026" },
  { type: "MISSION BRIEF", title: "SDOH Measurement Across Five Midwest States", eng: "Cross-engagement", date: "Jan 11, 2026" },
];

function Archive() {
  return (
    <div className="px-10 py-10">
      <PageHeader
        eyebrow="KNOWLEDGE ARCHIVE"
        title="What the Collective has carried."
        subtitle="Briefs, analyses, win themes, and after-actions — searchable, citable, alive."
      />
      <div className="grid grid-cols-3 gap-5">
        {CARDS.map((c, i) => (
          <article key={i} className="group cursor-pointer border bg-white transition-colors hover:border-neutral-400" style={{ borderColor: BRAND.border }}>
            <div className="px-5 pt-5">
              <span className="inline-block border px-2 py-1 text-[10px] font-semibold tracking-[0.18em]" style={{ borderColor: BRAND.gold, color: BRAND.gold }}>
                {c.type}
              </span>
            </div>
            <div className="px-5 py-5">
              <h3 style={{ ...serif, color: BRAND.navy }} className="text-xl leading-snug">
                {c.title}
              </h3>
            </div>
            <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-neutral-500" style={{ borderColor: BRAND.border, background: BRAND.fill }}>
              <span>{c.eng}</span>
              <span>{c.date}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
