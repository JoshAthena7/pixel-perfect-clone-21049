import { createFileRoute } from "@tanstack/react-router";
import { BRAND, serif, Avatar } from "@/components/asg/shell";
import { Lock, MessageSquare, AtSign, Sparkles } from "lucide-react";

export const Route = createFileRoute("/demo/_app/assignment")({
  component: Assignment,
});

function Assignment() {
  return (
    <div className="grid min-h-screen grid-cols-10">
      {/* Document */}
      <section className="col-span-6 border-r px-10 py-10" style={{ borderColor: BRAND.border, background: "#fff" }}>
        <div className="mb-1 text-[10px] tracking-[0.22em] text-neutral-500">
          OH-MCO-2026 · § E.4
        </div>
        <h1 style={{ ...serif, color: BRAND.navy }} className="text-4xl leading-tight">
          Care Coordination Approach
        </h1>

        <div className="mt-5 flex items-center gap-5 border-y py-3 text-xs text-neutral-600" style={{ borderColor: BRAND.border }}>
          <div className="flex items-center gap-2"><Avatar name="Maya Reyes" /> <span>Maya Reyes · Clinical Lead</span></div>
          <span>·</span>
          <span>Draft <strong>v2</strong></span>
          <span>·</span>
          <span>Due <strong>March 14</strong></span>
          <span>·</span>
          <span style={{ color: BRAND.gold }} className="font-semibold tracking-wider">IN REVIEW</span>
        </div>

        <div className="mt-8 space-y-5 text-[15px] leading-[1.75] text-neutral-800">
          <p>
            Athena's care coordination model for Ohio Medicaid members rests on three operating commitments:
            a longitudinal care plan owned by a single accountable clinician, warm-handoff transitions between
            every care setting, and member-directed goals that travel with the person — not the encounter.
            These commitments are not aspirational; they are measured monthly against transition success rates,
            avoidable readmissions, and member-reported continuity scores.
          </p>

          <div className="relative pl-5" style={{ borderLeft: `3px solid ${BRAND.gold}` }}>
            <p>
              For high-acuity members, Athena will deploy embedded care managers within FQHCs and CMHCs serving
              the seven highest-utilization counties. Each manager carries a panel capped at 60 members, ensuring
              meaningful contact at least monthly and within 48 hours of any inpatient or ED encounter — a standard
              that mirrors the Pennsylvania HealthChoices benchmark our team helped author in 2023.
            </p>
            <button className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em]" style={{ color: BRAND.gold }}>
              <MessageSquare className="h-3 w-3" /> 2 COMMENTS
            </button>
          </div>

          <p>
            Coordination across physical health, behavioral health, and long-term services and supports is
            anchored in a shared care record accessible to the member, their identified supports, and every
            credentialed provider on the care team. Athena's prior implementation in three states has shown
            that shared visibility — not new technology — is the variable that moves the needle on duplicate
            services and conflicting medication regimens.
          </p>
        </div>
      </section>

      {/* Thread */}
      <aside className="col-span-4 px-7 py-7" style={{ background: BRAND.bg }}>
        <div className="mb-4 inline-flex items-center gap-2 border px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em]" style={{ borderColor: BRAND.border, color: BRAND.navy, background: "#fff" }}>
          <Lock className="h-3 w-3" /> INTERNAL ONLY — NOT VISIBLE TO CLIENTS
        </div>

        <h2 style={{ ...serif, color: BRAND.navy }} className="text-2xl">
          Section thread
        </h2>
        <p className="mb-5 text-xs text-neutral-500">Three voices on this passage.</p>

        <div className="space-y-5">
          <Comment
            name="Marcus Tolliver"
            role="Engagement Lead"
            when="2h ago"
            body="The 48-hour standard reads strong. Make sure we cite the PA outcome data — evaluators in Columbus love a number they can trace."
          />
          <Comment
            name="Priya Anand"
            role="Quality"
            when="1h ago"
            quoted="Each manager carries a panel capped at 60 members…"
            body="60 is the right number for the seven counties listed, but for Cuyahoga we may want to flex to 50. Worth a footnote so it doesn't read as soft."
          />
          <Comment
            name="IRIS"
            role="Intelligence"
            when="14m ago"
            iris
            body="Pulled three Athena precedents where a panel-cap commitment moved an evaluator score from 'Meets' to 'Exceeds.' Linked in the right rail. Wisdom shared."
          />
        </div>

        <div className="mt-7 border bg-white" style={{ borderColor: BRAND.border }}>
          <textarea
            placeholder="Reply… use @ to mention a teammate, or /iris to ask the intelligence"
            className="h-24 w-full resize-none px-4 py-3 text-sm outline-none"
          />
          <div className="flex items-center justify-between border-t px-3 py-2" style={{ borderColor: BRAND.border, background: BRAND.fill }}>
            <div className="flex items-center gap-3 text-neutral-500">
              <AtSign className="h-4 w-4" />
              <Sparkles className="h-4 w-4" />
            </div>
            <button className="px-4 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-white" style={{ background: BRAND.navy }}>
              POST
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button className="flex-1 py-2.5 text-[11px] font-semibold tracking-[0.18em] text-white" style={{ background: BRAND.navy }}>
            ADVANCE TO REVIEW
          </button>
          <button className="flex-1 py-2.5 text-[11px] font-semibold tracking-[0.18em]" style={{ border: `1px solid ${BRAND.navy}`, color: BRAND.navy }}>
            RETURN TO WRITER
          </button>
        </div>
      </aside>
    </div>
  );
}

function Comment({
  name,
  role,
  when,
  body,
  quoted,
  iris,
}: { name: string; role: string; when: string; body: string; quoted?: string; iris?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {iris ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: BRAND.navy }}>
            <span className="text-[9px] font-semibold tracking-[0.1em]" style={{ color: BRAND.gold }}>IRIS</span>
          </div>
        ) : (
          <Avatar name={name} />
        )}
        <div className="text-sm font-medium" style={{ color: BRAND.navy }}>{name}</div>
        <div className="text-xs text-neutral-500">· {role} · {when}</div>
      </div>
      {quoted ? (
        <div className="mb-2 ml-9 border-l-2 pl-3 text-xs italic text-neutral-500" style={{ borderColor: BRAND.gold }}>
          "{quoted}"
        </div>
      ) : null}
      <div className="ml-9 text-sm leading-relaxed text-neutral-800">{body}</div>
    </div>
  );
}
