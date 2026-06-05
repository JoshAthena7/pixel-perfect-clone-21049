import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BRAND, serif, Avatar, PageHeader } from "@/components/asg/shell";
import { Circle, Feather } from "lucide-react";

export const Route = createFileRoute("/demo/_app/")({
  component: Dashboard,
});

const ENGAGEMENTS = [
  { name: "Ohio Medicaid MCO Reprocurement", status: "Active", statusTone: "active", deadline: "Due Mar 14", code: "OH-MCO-2026" },
  { name: "Pennsylvania HealthChoices BH Carve-In", status: "Pens Down 6d", statusTone: "warn", deadline: "Due Feb 28", code: "PA-BH-2026" },
  { name: "CMS MA Stars Quality Strategy", status: "Active", statusTone: "active", deadline: "Due Apr 02", code: "CMS-MA-2026" },
];

const QUEUE = [
  { section: "Care Coordination Approach (§ E.4)", who: "Maya Reyes", role: "Clinical Lead", v: "v2", status: "In Review", tone: "navy" },
  { section: "Population Health & SDOH Strategy (§ E.7)", who: "Daniel Cho", role: "Strategy", v: "v1", status: "Drafting", tone: "muted" },
  { section: "Quality Management Framework (§ F.2)", who: "Priya Anand", role: "Quality", v: "v3", status: "Ready", tone: "gold" },
  { section: "Organizational Overview (§ B.1)", who: "Jordan Webb", role: "PMO", v: "v2", status: "In Review", tone: "navy" },
  { section: "Provider Network Adequacy (§ E.2)", who: "Lila Okafor", role: "Network", v: "v1", status: "Drafting", tone: "muted" },
];

function statusChip(status: string, tone: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    navy: { bg: BRAND.navy, fg: "#fff" },
    gold: { bg: BRAND.gold, fg: BRAND.navy },
    muted: { bg: "#E5E9DF", fg: "#3F5A2E" },
  };
  const c = map[tone] ?? map.navy;
  return (
    <span className="px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em]" style={{ background: c.bg, color: c.fg }}>
      {status.toUpperCase()}
    </span>
  );
}

function Dashboard() {
  return (
    <div className="px-10 py-10">
      <PageHeader
        eyebrow="THURSDAY · JUNE 5"
        title="Good morning, Alex."
        subtitle="Three active engagements. Two leadership messages. The work is in motion."
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Engagements */}
        <section className="col-span-4 space-y-4">
          <SectionLabel>Active Engagements</SectionLabel>
          {ENGAGEMENTS.map((e) => (
            <Link
              key={e.code}
              to="/demo/queue"
              className="block border bg-white p-5 transition-colors hover:border-neutral-400"
              style={{ borderColor: BRAND.border }}
            >
              <div className="mb-2 text-[10px] tracking-[0.18em] text-neutral-500">{e.code}</div>
              <div style={{ ...serif, color: BRAND.navy }} className="text-xl leading-snug">{e.name}</div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-700">
                  <Circle
                    className="h-2 w-2"
                    style={{ fill: e.statusTone === "active" ? "#5B8C4F" : BRAND.gold, color: "transparent" }}
                  />
                  {e.status}
                </span>
                <span className="text-xs text-neutral-500">{e.deadline}</span>
              </div>
            </Link>
          ))}
        </section>

        {/* Center: Work Queue */}
        <section className="col-span-5">
          <SectionLabel>Your Work Queue</SectionLabel>
          <div className="border bg-white" style={{ borderColor: BRAND.border }}>
            {QUEUE.map((q, i) => (
              <Link
                key={i}
                to="/demo/assignment"
                className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0 hover:bg-[color:var(--fill)]"
                style={{ borderColor: BRAND.border, ["--fill" as any]: BRAND.fill }}
              >
                <Avatar name={q.who} tone={q.tone === "gold" ? "gold" : "navy"} />
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: BRAND.navy }}>{q.section}</div>
                  <div className="text-xs text-neutral-500">{q.who} · {q.role}</div>
                </div>
                <span className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500">{q.v.toUpperCase()}</span>
                {statusChip(q.status, q.tone)}
              </Link>
            ))}
          </div>
        </section>

        {/* Right: Wisdom + Leadership */}
        <aside className="col-span-3 space-y-5">
          <div className="border bg-white" style={{ borderColor: BRAND.border, borderTop: `3px solid ${BRAND.gold}` }}>
            <div className="px-5 pt-5 pb-2">
              <div className="flex items-center gap-2">
                <Feather className="h-4 w-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-semibold tracking-[0.22em]" style={{ color: BRAND.gold }}>
                  THE OWL
                </span>
              </div>
            </div>
            <div className="px-5 pb-6">
              <p style={serif} className="text-lg italic leading-snug" >
                "Atlas carried the heavens. You only have three meetings today. Perspective."
              </p>
              <div className="mt-4 text-[10px] tracking-[0.18em] text-neutral-400">
                DAILY WISDOM · 06:30 EST
              </div>
            </div>
          </div>

          <Link to="/demo/communications" className="block border bg-white p-5 hover:border-neutral-400" style={{ borderColor: BRAND.border }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-neutral-500">LEADERSHIP</span>
              <span className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                <Circle className="h-2 w-2" style={{ fill: BRAND.gold, color: "transparent" }} />
                2 unread
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium" style={{ color: BRAND.navy }}>Q1 Win Themes — Read Before Friday</div>
                <div className="text-xs text-neutral-500">From Dr. Renée Halloran · Managing Partner</div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: BRAND.border }}>
                <div className="text-sm font-medium" style={{ color: BRAND.navy }}>Maya — your OH-MCO draft</div>
                <div className="text-xs text-neutral-500">From Marcus Tolliver · Engagement Lead</div>
              </div>
            </div>
          </Link>
        </aside>
      </div>

      <IrisAmbientToast />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-[10px] font-semibold tracking-[0.22em] text-neutral-500">{children}</h2>;
}

function IrisAmbientToast() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setShow(true), 2000);
    const t2 = setTimeout(() => setShow(false), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[340px] border bg-white p-4 transition-opacity"
      style={{ borderColor: BRAND.border }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: BRAND.navy }}>
          <span className="text-[10px] font-semibold tracking-[0.12em]" style={{ color: BRAND.gold }}>IRIS</span>
        </div>
        <div className="flex-1">
          <p style={serif} className="text-[15px] italic leading-snug text-neutral-800">
            "The messenger walks before the message. I've put the Ohio amendment summary at the top of your queue."
          </p>
          <div className="mt-2 text-[10px] tracking-[0.18em] text-neutral-400">JUST NOW · AMBIENT</div>
        </div>
      </div>
    </div>
  );
}
