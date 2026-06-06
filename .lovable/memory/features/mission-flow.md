---
name: Mission Flow (Olympus → IRIS → Cockpit → Mission Command)
description: The canonical end-to-end flow for a mission — who sets it up, what IRIS does automatically, how writers see their slice, and how everything rolls back up
type: feature
---

# Mission Flow

One mission. One truth. Every person sees their slice. IRIS holds the whole picture.

```
Olympus (setup)
  → IRIS activates
    → Questions assigned to writers
      → Writers work in their Cockpit
        → Everything rolls up to Mission Command
          → EL/PM see the live state of the mission
```

## Roles & surfaces

- **Olympus** — Admin/PM (Josh) only. Mission setup: win themes, RFP uploads,
  response template, team assignment. Control room. Writers never see this.
- **IRIS** — Background, automatic. Activates the moment the mission is set up.
  Reads the RFP, extracts questions/sections, analyzes intel, scores win-theme
  alignment, flags risks. Runs continuously. Never waits to be asked.
- **Cockpit** — Personal-but-connected workspace per writer. Each writer sees
  only their assigned sections (Maya → 3.1, Kellie → 2.2, Marcus → 3.3).
  Drafts, status updates, Score Me runs all feed back up.
- **Mission Command** — PM aggregate view of all 42 questions.
- **Brief / Leadership view** — EL sees health, flags, and the overall picture.

## Roll-up rules

- Every writer action (draft edit, status change, Score Me) MUST update:
  - mission health score
  - IRIS alignment calculation
  - Mission Command aggregate
- SOS fired in a Cockpit must surface on Mission Command immediately.
- IRIS watches all questions simultaneously and surfaces what needs attention.

## Invariants

- Writers do NOT see admin setup.
- Olympus is not a destination for writers/SMEs/reviewers.
- IRIS is invisible infrastructure — users see the 5 IRIS Outputs, not the pipeline.
- Single source of truth: the Mission Intelligence Graph. UI surfaces are views over it.
