// Voice-ready IRIS onboarding scripts.
// Plain text only. No HTML, no markdown. Phase 2 (ElevenLabs) reads these strings directly.

export const IRIS_SCRIPTS: Record<number, string> = {
  1: "Hello. I am IRIS — the intelligence co-pilot inside ATLAS. Before we get to the platform, I want to take two minutes to explain what you are walking into. Medicaid procurements are not won by the best proposal. They are won by the team that best understands what the evaluators are afraid of — and writes directly to those fears. That is what ATLAS helps Athena do. I will be walking you through this setup — one step at a time. Let's go.",
  2: "First things first. I need to know who you are. I have pre-filled your email from the invite you received. Just add your name and create a password. Your account is scoped entirely to Athena Strategy Group. You will only ever see missions you have been explicitly assigned to. Nothing bleeds across.",
  3: "Now I need to get to know you. Not for a directory — for the work. When a writer on your team gets stuck on a question, they can ask me to find an expert. I search everyone's profile to find the right person. The more specific you are here, the better I can match you. Select your expertise areas carefully. A writer asking for help with care coordination for youth in New Jersey needs someone who actually knows that space. Not just someone who clicked behavioral health.",
  4: "I would like you to upload your resume here. Here is why this matters. When a writer is stuck on a question — say, provider network adequacy in rural counties — they can ask me to find them an expert. I search every resume on the Athena team to find the right person. Not just by job title. By the actual work people have done and the programs they have built. Your resume is how I know what you know. This is what powers Phone a Friend on every mission you are part of.",
  5: "This is the security and confidentiality section. I want to be direct with you about what this is and why it exists — not just ask you to check boxes. Everything inside ATLAS is confidential. The mission strategy, the intelligence, the client information. The people Athena works with are trusting us with sensitive procurement strategy during live competitions. The HIPAA piece is specific. You will not enter any protected health information into ATLAS under any circumstances. Please read what follows. Not skim it. Then sign with your name. Your signature is timestamped and logged.",
  6: "You are set up. Here is what to do first. You will land on the Mission Brief for your mission. Read today's Athena Insight at the top. It is the single most important strategic thought for this mission right now. Then look at your assignments and open your most urgent question in the Flight Deck. On every page you will see a button that says IRIS — explain this page. Click it any time. I will tell you exactly what you are looking at and what to do first. One last thing. I will be direct with you throughout this mission. Not harsh — direct. It saves time and it wins procurements. I will be with you the whole way. Let's go win this.",
};

export const MODULE_NAMES: Record<number, string> = {
  1: "Welcome",
  2: "Account",
  3: "Profile",
  4: "Resume",
  5: "Attestation",
  6: "Orient",
};

export type ModuleCard = { title: string; body: string };

export const MODULE_CARDS: Record<number, ModuleCard | null> = {
  1: null,
  2: { title: "Account", body: "Email pre-filled from your invite. Add your name and create a password. Your account is scoped entirely to Athena Strategy Group." },
  3: { title: "Profile", body: "Tell me what you know. Expertise areas, specialties, and the work you've actually done. This is how I match you when a writer needs an expert." },
  4: { title: "Resume", body: "Upload your resume. I search every resume to power Phone a Friend across missions. By the actual work, not just job titles." },
  5: { title: "Attestation", body: "Confidentiality and HIPAA. Read it. Sign with your name. Your signature is timestamped and logged." },
  6: { title: "You're In", body: "Land on the Mission Brief. Read today's Athena Insight. Open your most urgent question in the Flight Deck. Click IRIS — explain this page on any screen." },
};

export type QuickReply = { label: string; kind: "advance" | "question"; answer?: string };

export const QUICK_REPLIES: Record<number, QuickReply[]> = {
  1: [{ label: "Ready. Let's go.", kind: "advance" }],
  2: [{ label: "Continue", kind: "advance" }],
  3: [{ label: "Continue", kind: "advance" }],
  4: [{ label: "Continue", kind: "advance" }],
  5: [{ label: "I have read and signed.", kind: "advance" }],
  6: [{ label: "Take me to ATLAS", kind: "advance" }],
};

export const FALLBACK_ANSWER =
  "That's not something I can address in onboarding. Note it and ask me via IRIS once you're inside the platform.";
