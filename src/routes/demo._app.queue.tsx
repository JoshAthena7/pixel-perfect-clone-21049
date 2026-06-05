import { createFileRoute, Link } from "@tanstack/react-router";
import { BRAND, serif, Avatar, PageHeader } from "@/components/asg/shell";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/demo/_app/queue")({
  component: Queue,
});

const ROWS = [
  { sec: "Care Coordination Approach", code: "§ E.4", who: "Maya Reyes", v: "v2", status: "In Review", tone: "navy", due: "Mar 14" },
  { sec: "Organizational Overview", code: "§ B.1", who: "Jordan Webb", v: "v2", status: "In Review", tone: "navy", due: "Mar 14" },
  { sec: "Quality Management Framework", code: "§ F.2", who: "Priya Anand", v: "v3", status: "Ready", tone: "gold", due: "Mar 12" },
  { sec: "Population Health & SDOH Strategy", code: "§ E.7", who: "Daniel Cho", v: "v1", status: "Drafting", tone: "muted", due: "Mar 18" },
  { sec: "Provider Network Adequacy", code: "§ E.2", who: "Lila Okafor", v: "v1", status: "Drafting", tone: "muted", due: "Mar 21" },
  { sec: "Behavioral Health Integration", code: "§ E.5", who: "Maya Reyes", v: "v1", status: "Drafting", tone: "muted", due: "Mar 21" },
];

function chip(status: string, tone: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    navy: { bg: BRAND.navy, fg: "#fff" },
    gold: { bg: BRAND.gold, fg: BRAND.navy },
    muted: { bg: "#E5E9DF", fg: "#3F5A2E" },
  };
  const c = map[tone];
  return (
    <span className="px-2 py-1 text-[10px] font-semibold tracking-[0.14em]" style={{ background: c.bg, color: c.fg }}>
      {status.toUpperCase()}
    </span>
  );
}

function Queue() {
  return (
    <div className="px-10 py-10">
      <PageHeader
        eyebrow="OH-MCO-2026 · OHIO MEDICAID MCO REPROCUREMENT"
        title="Work queue."
        subtitle="Twelve sections. Six in motion. Pens-down in 9 days."
      />

      <div className="border bg-white" style={{ borderColor: BRAND.border }}>
        <div className="grid grid-cols-12 gap-4 border-b px-6 py-3 text-[10px] font-semibold tracking-[0.18em] text-neutral-500" style={{ borderColor: BRAND.border, background: BRAND.fill }}>
          <div className="col-span-5">SECTION</div>
          <div className="col-span-3">ASSIGNED</div>
          <div className="col-span-1">DRAFT</div>
          <div className="col-span-1">STATUS</div>
          <div className="col-span-1">DUE</div>
          <div className="col-span-1 text-right">OPEN</div>
        </div>
        {ROWS.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-4 border-b px-6 py-4 last:border-b-0" style={{ borderColor: BRAND.border }}>
            <div className="col-span-5">
              <div className="text-[10px] tracking-[0.18em] text-neutral-400">{r.code}</div>
              <div className="text-sm font-medium" style={{ color: BRAND.navy }}>{r.sec}</div>
            </div>
            <div className="col-span-3 flex items-center gap-2 text-sm text-neutral-700">
              <Avatar name={r.who} /> {r.who}
            </div>
            <div className="col-span-1 text-[11px] font-semibold tracking-[0.14em] text-neutral-600">{r.v.toUpperCase()}</div>
            <div className="col-span-1">{chip(r.status, r.tone)}</div>
            <div className="col-span-1 text-sm text-neutral-600">{r.due}</div>
            <div className="col-span-1 text-right">
              <Link to="/demo/assignment" className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: BRAND.navy }}>
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs italic text-neutral-500" style={serif}>
        "Penelope wove by day and unwove by night. Drafts are honest only when they can be undone." — IRIS
      </p>
    </div>
  );
}
