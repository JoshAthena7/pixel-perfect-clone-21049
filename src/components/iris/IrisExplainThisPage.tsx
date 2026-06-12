import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Eye, X } from "lucide-react";

const EXPLANATIONS: Array<{ match: (p: string) => boolean; text: string }> = [
  {
    match: (p) => p === "/home",
    text:
      "This is your home. Every active mission you are working on appears here as a card. Click any card to go into it. Everything about that mission — the intelligence, your assignments, the evaluator picture — lives inside. Start with the mission closest to its deadline. That one first. I will be in there waiting for you.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/briefing$/.test(p),
    text:
      "This is the mission briefing. Read this before writing anything. The North Star at the top is your anchor — every section of this proposal should connect back to it. The Watch List shows you what needs attention right now. The evaluator profiles tell you who is reading this proposal and what they care about most. Read them before you open the Flight Deck. They will change how you write every paragraph.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/oracle$/.test(p),
    text:
      "This is Oracle — everything I know about the ecosystem around this procurement. I have been watching while you were away. Some things changed. Not all of it matters. I flagged the things that do — check the Intelligence Feed first. The Evaluator Picture tab shows you how the scoring panel thinks. Not who they are as individuals. How the institutional context shapes their behavior. Start there before writing any section. I find it changes everything.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/insights$/.test(p),
    text:
      "This is the Athena Insights library for this mission. Think of it as the strategy briefing before you write. Today's insight at the top is the single most important strategic thought for this mission right now. Read it before you open any question. These are not suggestions. They are the strategic lens the entire team is writing through.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/journey$/.test(p),
    text:
      "This is the mission timeline. It shows every phase from now to submission and what needs to happen in each one. The current phase is highlighted. Milestones with due dates tell you what the team needs to deliver and when. The red marker at the end is submission. Everything before it is time you have. Everything after it is time you do not.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/flight-deck/.test(p) || p === "/flight-deck" || p.startsWith("/flight-deck/") || p === "/olympus/flight-deck",
    text:
      "This is your workspace. The intelligence panel on the left shows you everything I know about this section. Read the Athena Insight first — it is the strategic lens for this specific section. Then read my brief below it. Your work is on the right. Update your status when something changes — the team sees it immediately. When you have a draft use Score Draft before anyone else sees it. I will tell you exactly what to fix. Not what sounds better. What would actually move an evaluator.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/win-strategy$/.test(p),
    text:
      "This is the Win Strategy for this mission. Everything in here flows directly into what writers see in the Flight Deck and what I put in every insight and brief I generate. The North Star is the most important field on this page. It is the single sentence every writer on this team should be able to recite from memory. I have read a lot of North Stars. The good ones make you feel something. The bad ones sound like a mission statement from 2009. Aim for the former.",
  },
  {
    match: (p) => /^\/missions\/[^/]+\/team$/.test(p),
    text:
      "This is the team management panel. Your job here is to make sure the right people are assigned to the right questions and have accepted their work. Writers cannot start work on questions that are not assigned to them. Assign before the Writers Write phase begins or you will lose days you cannot get back. When a writer has not accepted their assignment they show as pending. Unaccepted assignments are invisible to the writer in the Flight Deck. Chase those first.",
  },
];

const FALLBACK = "I am still learning this page. Check back after the next update.";

export function IrisExplainThisPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const text = EXPLANATIONS.find((e) => e.match(path))?.text ?? FALLBACK;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 16,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(127,119,221,0.08)",
          border: "0.5px solid rgba(127,119,221,0.2)",
          borderRadius: 6,
          padding: "5px 12px",
          color: "rgba(200,195,255,0.85)",
          fontSize: 10,
          fontWeight: 500,
          cursor: "pointer",
          lineHeight: 1.2,
        }}
      >
        <Eye size={11} strokeWidth={1.5} />
        IRIS — explain this page
      </button>
      {open && (
        <div
          style={{
            maxWidth: 380,
            background: "rgba(127,119,221,0.08)",
            border: "0.5px solid rgba(127,119,221,0.25)",
            borderRadius: 10,
            padding: "12px 14px 12px 14px",
            color: "rgba(220,216,255,0.92)",
            fontSize: 12,
            lineHeight: 1.55,
            backdropFilter: "blur(8px)",
            position: "relative",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "transparent",
              border: "none",
              color: "rgba(200,195,255,0.7)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 0,
            }}
          >
            <X size={12} />
          </button>
          <div style={{ paddingRight: 16 }}>{text}</div>
        </div>
      )}
    </div>
  );
}
