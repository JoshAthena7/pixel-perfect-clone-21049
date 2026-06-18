## State Intelligence Pack — Build Plan

A per-state intelligence library that lives once, not per mission. Every mission in that state auto-inherits it. Admin-only.

### Route & access

- New route: `/_authenticated/olympus/state-intel/` (list of states)
- Detail route: `/_authenticated/olympus/state-intel/$stateCode` (the 12-category pack for one state)
- Gated to admin role via existing `useAccess` / role check used in other Olympus admin pages.

### Data model (one migration)

Two tables in `public`:

**`state_intel_packs`** — one row per state
- `state_code` (text, PK, e.g. "TX", "FL")
- `state_name` (text)
- `last_reviewed_at`, `last_reviewed_by`
- `notes` (text)

**`state_intel_documents`** — uploads
- `id`, `state_code` (FK), `category` (enum, 12 values below)
- `title`, `description`
- `storage_path` (in `state-intel` bucket), `file_size`, `mime_type`
- `effective_date` (when doc was published)
- `expires_at` (optional — for waivers with end dates)
- `is_current` (bool — for superseded docs)
- `uploaded_by`, `uploaded_at`

Both tables: RLS enabled, GRANTs for authenticated + service_role, admin-only insert/update/delete via `has_role(auth.uid(), 'admin')`, read for all authenticated (writers see what's in the library).

New private storage bucket: `state-intel`.

### 12 Categories (the checklist)

1. Waivers & Authorities — 1115 STCs, evaluation reports, 1915(b/c/i/k)
2. State Plan & Amendments — SPA history, MOAs
3. Managed Care Landscape — current MCO contracts, RFP history, enrollment
4. Quality Strategy — current quality strategy, EQR reports (last 2 yrs)
5. Directed Payments & SDPs — current inventory, preprints
6. Core Set Performance — HEDIS/CAHPS results, improvement plans
7. Legislative & Budget — recent session actions, budget bills, MMAC/MAC minutes
8. Rate Setting — capitation rate certifications, actuarial reports
9. Eligibility & Enrollment — unwinding reports, continuous eligibility status
10. Workforce & Provider Network — adequacy reports, workforce initiatives
11. Demographics & Health Status — state health dashboard, SDOH data
12. Litigation & Compliance — active suits, CMS corrective actions

### UI

**List page (`/olympus/state-intel`)**:
- Grid of state cards. Each card shows:
  - State name + code
  - Completeness ring: X of 12 categories with at least one current doc
  - Last reviewed date
  - "Stale" badge if >6 months
- "Add state" button

**Detail page (`/olympus/state-intel/$stateCode`)**:
- Header with state name, completeness %, last reviewed, "Mark reviewed" button
- 12 collapsible category sections, each showing:
  - Checkbox indicator (green = has current doc, amber = stale, red = empty)
  - Description of what belongs in this category
  - List of uploaded docs (title, effective date, uploaded by, download, archive)
  - Drag-drop upload zone
- Right rail: "Missions inheriting this pack" — list of active missions in this state

### Component split

- `src/routes/_authenticated/olympus.state-intel.index.tsx` — list page
- `src/routes/_authenticated/olympus.state-intel.$stateCode.tsx` — detail page
- `src/components/state-intel/StateIntelGrid.tsx` — state cards
- `src/components/state-intel/StateIntelDetail.tsx` — 12-category surface
- `src/components/state-intel/CategorySection.tsx` — one collapsible category
- `src/components/state-intel/UploadZone.tsx` — drag-drop + supabase storage upload
- `src/lib/state-intel/categories.ts` — the canonical 12-category list (id, label, description, what-to-upload examples)
- `src/lib/state-intel/state-intel.functions.ts` — server fns for upload metadata writes, mark-reviewed, completeness calc

### Nav

Add "State Intel" entry to Olympus admin nav (`OlympusSecondaryNav.tsx` or `AdminQuickBar.tsx` — whichever houses admin-only links).

### Out of scope for v1

- Auto-attaching the pack into mission context at brief generation (we'll wire that in a follow-up once content exists)
- Cross-state comparison views
- Auto-refresh from external sources (CMS, KFF) — manual upload only for v1

### Order of operations

1. Migration (tables + bucket + RLS + GRANTs)
2. Categories config file
3. Server functions
4. List + detail routes
5. Upload component
6. Nav link
7. Smoke test: upload a doc to TX → Waivers, verify completeness updates, verify writers can read but not delete.

Confirm to proceed and I'll start with the migration.