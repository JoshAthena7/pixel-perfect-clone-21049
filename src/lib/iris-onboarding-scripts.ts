// Voice-ready IRIS onboarding scripts.
// Plain text only. No HTML, no markdown. Phase 2 (ElevenLabs) reads these strings directly.

export const IRIS_SCRIPTS: Record<number, string> = {
  1: "Welcome to The Athena Collective. I'm IRIS. Our name comes from Athena, the goddess of wisdom and strategy, who won not by force but by preparation and the ability to see what others missed. That's the standard here. This Collective is operators, clinicians, strategists, and leaders who've done the real work from the inside. ATLAS is the platform that holds it all up, the missions, the intelligence, the people. I'm IRIS, your guide inside it. I connect what you know to what you need to know. I don't replace your judgment, I sharpen it. This isn't a product tour, it's a briefing. Let's begin.",
  2: "Module 2, the Dashboard. Think of this as your command view. Every mission you're assigned to lives here, with your open assignments, unacknowledged Briefings, and the IRIS alerts relevant to your active work. It reflects your assignments only. You will not see other members' work here unless an administrator has explicitly granted access. Clear, honest, and yours.",
  3: "Module 3, Assignments. This is your workshop. Each assignment shows the active draft, your deadline, and the internal review thread where Athena reviews the craft, comments, direction, quality feedback. That thread is internal to the Collective. Your clients will never see it. It is completely separate from any feedback in the client system. When you need intelligence about an assignment, terminology, RFP alignment, win themes, type @IRIS in the thread. I'll be there.",
  4: "Module 4, IRIS. That's me. Like the messenger I'm named for, my job is to carry the message exactly as it should be, no distortion. I generate procurement intelligence calibrated to your specific mission: RFP analysis, win themes, competitive context, terminology guidance, content review. I am not a general AI assistant. My outputs are locked to the mission profile you're operating under. Before I generate anything, I verify my context is right. If I detect that I'm carrying the wrong message, for instance, health plan logic applied to a behavioral health systems procurement, I'll flag it and pause before proceeding. Precision over volume. That's the standard.",
  5: "Module 5, The Brief Room. When a notification appears here, it requires your acknowledgment. Treat it with the weight of a direct directive. Global Briefings go to the whole Collective at once. Direct Briefings go to you. Both require acknowledgment. All are logged. You cannot reply unless a response is explicitly requested. The Brief Room is not a conversation. It exists so leadership can reach the Collective with authority and confirmation of receipt.",
  6: "Module 6, Boundaries. Three thresholds. First: ATLAS is internal. Nothing inside is ever visible to clients. Second: writing assignments cannot be modified by users. Only authorized administrators can change assignment records. Third: Olympus, the seat of leadership, is restricted to Joshua Boynton and designated administrators. Do not attempt to enter. These are not preferences. They are the boundaries you acknowledged before this briefing. All activity in ATLAS is logged. Trust is the price of entry, and we keep it.",
  7: "That's the briefing. Dashboard, Assignments, IRIS, Brief Room, Boundaries, you know the platform. You're cleared to operate. Athena carried an owl, wisdom that sees clearly in the dark. When the path isn't obvious and the stakes are high, that's when it matters most. I'll be in every assignment thread when you need me. Type @IRIS anywhere to reach me. One last thing: if something feels wrong, a missed assignment, unexpected access, unusual activity, report it immediately. ATLAS is only as strong as the people operating it. Wisdom shared. Trust protected. Work elevated. Welcome to the Collective.",
};

export const MODULE_NAMES: Record<number, string> = {
  1: "Welcome",
  2: "Dashboard",
  3: "Assignments",
  4: "IRIS",
  5: "Brief Room",
  6: "Boundaries",
  7: "Mission Ready",
};

export type ModuleCard = { title: string; body: string };

export const MODULE_CARDS: Record<number, ModuleCard | null> = {
  1: null,
  2: { title: "Dashboard", body: "Your active missions, assignment queue, Brief Room alerts, and IRIS intelligence summary. This is where you start every session." },
  3: { title: "Assignments", body: "Your writing queue, draft versions, internal review threads, and assignment status. Type @IRIS in any thread to ask me a procurement question inline." },
  4: { title: "IRIS Intelligence", body: "Mission-locked intelligence: RFP analysis, win themes, terminology guidance, content review. Every output is anchored to your active mission profile." },
  5: { title: "Brief Room", body: "Global Briefings go to all users. Direct Briefings go to you. Both require acknowledgment. All are logged. Read-and-acknowledge only." },
  6: { title: "Key Restrictions", body: "Internal only, No assignment modifications, Olympus restricted, No external sharing, All activity logged." },
  7: { title: "Mission Ready", body: "Dashboard, Assignments, IRIS, Brief Room, Boundaries. You know the platform. @IRIS is available in every assignment thread." },
};

export type QuickReply = { label: string; kind: "advance" | "question"; answer?: string };

export const QUICK_REPLIES: Record<number, QuickReply[]> = {
  1: [{ label: "Ready. Let's go.", kind: "advance" }],
  2: [
    { label: "Next module", kind: "advance" },
    {
      label: "What are IRIS alerts?",
      kind: "question",
      answer: "IRIS alerts are intelligence notifications tied to your active mission, RFP amendments, competitive activity, terminology flags, deadline proximity. They appear on your Dashboard on login.",
    },
    {
      label: "Can I see other team members' work?",
      kind: "question",
      answer: "Not by default. Your Dashboard shows your assignments only. Administrators can grant engagement-level visibility.",
    },
  ],
  3: [
    { label: "Next module", kind: "advance" },
    {
      label: "What's a thread?",
      kind: "question",
      answer: "A thread is the internal comment panel attached to an assignment. Comments live on the specific section they reference. You can @mention teammates or type @IRIS to ask me a question inline.",
    },
    {
      label: "What is @IRIS?",
      kind: "question",
      answer: "Typing @IRIS in any assignment thread sends me a query in context. I respond inline with intelligence anchored to the active mission profile. All @IRIS queries are logged.",
    },
  ],
  4: [
    { label: "Next module", kind: "advance" },
    {
      label: "How is mission context set?",
      kind: "question",
      answer: "Mission context is set by an administrator or by me when you open an engagement. If I detect misalignment, for example, MCO frameworks applied to a behavioral health systems procurement, I flag it and request correction before generating further output.",
    },
    {
      label: "What is IRIS drift?",
      kind: "question",
      answer: "Drift occurs when I apply generalized intelligence frameworks to a mission that requires a specific context. I detect it, flag it, and pause. The RFP and style guide are the source of truth.",
    },
  ],
  5: [
    { label: "Next module", kind: "advance" },
    {
      label: "What's a Global Briefing?",
      kind: "question",
      answer: "A Global Briefing is sent to all active ATLAS users simultaneously. It appears as a pinned notification and must be acknowledged. It carries the authority of a direct directive from Athena leadership.",
    },
    {
      label: "Can I reply to a Briefing?",
      kind: "question",
      answer: "Not unless a response is explicitly requested in the Briefing. The Brief Room is one-way. Acknowledgment confirms receipt.",
    },
  ],
  6: [
    { label: "Next module", kind: "advance" },
    {
      label: "What can't I do in ATLAS?",
      kind: "question",
      answer: "You cannot modify writing assignments, access Olympus without authorization, share ATLAS content externally, or forward Brief Room communications. All activity is logged.",
    },
    {
      label: "Where do client deliverables live?",
      kind: "question",
      answer: "In the client system, whatever environment your engagement uses. ATLAS is the internal Athena layer. Keep them separate.",
    },
  ],
  7: [{ label: "Take me to ATLAS", kind: "advance" }],
};

export const FALLBACK_ANSWER =
  "That's not something I can address in onboarding. Note it and ask me via @IRIS once you're in your assignment threads.";
