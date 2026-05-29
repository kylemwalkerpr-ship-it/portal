# Brief 39 — Consultant role refactor (non-legal only, end-to-end)

**Repo:** yousafe-portal · **Owner:** Kimi · **Supervisor/gate/commit:** Claude · **Relay:** operator
**Goal:** Consultants are non-lawyers. Sequester their entire lifecycle (sign-up → intake → profile → marketplace gig creation → order fulfilment) inside **non-legal services only**. Remove every legal-domain framing that's currently leaking into the consultant path (DB columns, UI labels, AI prompts, category access), and gate gig creation so a consultant **cannot create a gig in a legal category**, even via direct API call.

## Verified audit (this is the current state of affairs — work from this, do not re-derive)

### What's wrong today
1. **Sign-up routes consultants like attorneys** — `app/sign-up/[[...rest]]/SignUpClient.tsx` offers a "consultant" lane next to "attorney" with identical onboarding language ("Create the account type that matches your work… consultant, or attorney").
2. **Intake wizard uses legal vocabulary verbatim** — `components/marketplace/ConsultantIntakeWizard.tsx` collects `jurisdictions`, `practice_areas`, "specialties" with legal-coded suggestions; saves these onto `consultants` (lines 22–24, 38, 64, 304–306, 406–414, 485–486).
3. **DB schema legalizes consultants** — `supabase/marketplace_consultant_intake.sql` adds `consultants.jurisdictions text` and `consultants.practice_areas text` (clone of the attorney row), and `consultant_provisioning.sql` likewise. These columns must be replaced with non-legal equivalents.
4. **AI profile suggester literally calls consultants "Immigration / legal consultant"** — `lib/profileSuggest.ts:65`: `lines.push(\`Role: ${ctx.role === 'attorney' ? 'Licensed attorney' : 'Immigration / legal consultant'}\`)`. That prompt teaches the model to write *consultant* tag-lines as legal-helper copy.
5. **Marketplace category list has NO role gating** — `lib/categories.ts` is a flat catalogue used everywhere. `legal` (id `legal`, with subcategories `document-prep`, `attorney-review`, `legal-consultation`, etc.) sits next to non-legal categories with no consultant-allow/deny annotation. **A consultant can pick "Legal Services → Attorney Review" today.**
6. **`POST /api/gigs` accepts any provider** — `app/api/gigs/route.ts:13` only checks role is `attorney|consultant`; **never** checks that the gig's `category` is permitted for that role. **Consultants can create legal gigs via direct API call** even if UI is hidden.
7. **Publish gate** — `app/api/gigs/[id]/publish/route.ts` correctly routes to `computeConsultantStrength` for consultants (good), but the strength scorer (`lib/consultantProfileStrength.ts`) and the profile pages still reference legal-domain fields. Verify and align.
8. **Cross-vertical seeds** — `lib/legal_services_seed`/template-pack catalogue + `CATEGORY_SOURCE_LABELS` lump legal seeds across categories; ensure they don't bleed into the consultant marketplace surface.

### The new academic-writing category (operator ask)
- Add a new top-level category **Academic Writing & Application Support** (id `academic-writing`, vertical `study-abroad`) covering: application essays / personal statements, SOPs, statement of purpose, college application essays, scholarship essays, research writing, thesis editing, copy-editing, proofreading. Subcategories:
  - `application-essays` — Application essays & personal statements
  - `sop-writing` — SOP & statement of purpose
  - `scholarship-essays` — Scholarship essays
  - `research-writing` — Research papers & theses
  - `proofreading-editing` — Proofreading & copy-editing
- Source labels merged from any matching legacy gig names found in `CATEGORY_SOURCE_LABELS`.

### Consultant-permitted categories (the canonical allow-list)
This is the **only** thing a consultant may pick on gig creation, intake, or marketplace browse from the provider side:
- `education` (Education & Admissions) and all its subcategories
- `academic-writing` (NEW) and all its subcategories
- `career` (Career Development) and all its subcategories
- `business` (Business Services) and all its subcategories
- `settlement` (Settlement & Integration) and all its subcategories
- `mentorship` (Mentorship & Coaching) and all its subcategories
- `credentials` (Credentials & Assessment) and all its subcategories

**Forbidden for consultants** (legal, requires Bar / regulator vetting):
- `immigration` (all subcategories — visa, work permit, PR, family sponsorship, etc.)
- `legal` (all subcategories — document-prep, attorney-review, legal-consultation, business-formation, compliance)

## Non-negotiable rules
- **Backward compatible.** Existing live consultant rows / gigs must keep working. Do NOT delete data; add columns; deprecate old columns with comments; keep reads from old columns until backfill is verified.
- **Defense in depth.** Block legal categories for consultants at THREE layers: (a) category catalogue exposes a `permittedRoles` field; (b) marketplace UI filters by role; (c) `POST /api/gigs` + `PATCH /api/gigs/[id]` reject any category not in the consultant allow-list when `auth.role === 'consultant'`. Server check is the source of truth.
- **No fake content / no fabrication.** Where the consultant UI today fakes legal-attorney parity (jurisdictions, practice areas), replace with the consultant-relevant equivalents (industries, subjects, audience), not generic placeholders.
- **You do code only.** Worktree-ready; Claude commits. SQL migration files authored as defensive `if not exists`; Claude applies via Management API. No `git`, no deploy, no SQL execution from you.

## Phasing — gated, STOP for review at each ✋

### Phase 1 — Catalogue + permittedRoles + new academic-writing category
- `lib/categories.ts`:
  - Add `permittedRoles: ('attorney' | 'consultant')[]` to `Category` and `Subcategory` (Subcategory inherits if absent).
  - Mark every existing category with the canonical sets:
    - `immigration`, `legal` → `['attorney']`
    - `education`, `career`, `business`, `settlement`, `mentorship`, `credentials` → `['attorney','consultant']`
  - Add the new `academic-writing` category (spec above) → `['attorney','consultant']`.
  - Helpers: `getCategoriesForRole(role)`, `isCategoryAllowedForRole(categoryId, role)`, `isSubcategoryAllowedForRole(subcategoryId, role)` (also accepts top-level id).
- Append source labels for `academic-writing` in `CATEGORY_SOURCE_LABELS` (mining legacy gig names if applicable).
- `npx tsc --noEmit` clean. ✋

### Phase 2 — Marketplace surfaces filter by role
- Anywhere a consultant authors/picks a category (gig creation form, gig edit, intake category step if any, search filters on the provider side) the option list MUST come from `getCategoriesForRole('consultant')`.
- Public marketplace browse for clients/students is unaffected.
- Spot test: open the consultant gig-new page, confirm the category dropdown does NOT list Immigration or Legal Services. ✋

### Phase 3 — Server-side gating (the security boundary)
- `app/api/gigs/route.ts` POST + PUT/PATCH: after auth, if `auth.role === 'consultant'`, validate `category` (and `subcategory` if sent) against `isCategoryAllowedForRole`. Reject with 403 + `{ error: 'This category is restricted to attorneys.' }`.
- `app/api/gigs/[id]/publish/route.ts`: same check before publish.
- Add a brief comment citing why (legal vetting requires the Bar number on `attorneys` / `attorney_applications`, which consultants do not have).
- ✋

### Phase 4 — Consultant DB schema realignment (non-legal vocabulary)
Migration file `supabase/consultant_role_refactor.sql`:
- Add columns to `consultants`:
  - `industries text` — replaces "practice areas" framing (e.g. "Higher education, EdTech, Career services")
  - `subjects text` — replaces "jurisdictions" framing (e.g. "MBA admissions, STEM SOPs, undergraduate essays")
  - `target_audience text` — e.g. "Undergraduate applicants, mid-career professionals"
- Keep `practice_areas` and `jurisdictions` columns (do NOT drop) — leave them in place with NO new writes; deprecate via comment. Existing data is not lost; a future migration drops them after we confirm no consultant relies on the legacy values.
- Backfill: for any consultant row where `industries`/`subjects`/`target_audience` is null but `practice_areas`/`jurisdictions` has content, copy the content across (so the new column is populated and the old can be read-only).
- Idempotent / safe to re-run. Claude applies via Management API.

### Phase 5 — Intake, profile editor, profile-strength, AI prompts
- `components/marketplace/ConsultantIntakeWizard.tsx`: replace the three legal-flavoured prompts:
  - Field "Jurisdictions" → label **"Subjects you teach / advise on"**, bound to `subjects`.
  - Field "Practice areas" → label **"Industries / sectors"**, bound to `industries`.
  - "Specialty" chip suggestions list: replace legal-coded suggestions with non-legal mix (e.g. *MBA admissions, STEM SOPs, scholarship essays, resume writing, career pivot, copy-editing, business plan review, tax filings, brand strategy, language tutoring, settlement orientation*).
  - Hero/help copy on the wizard: drop any "legal" / "attorney" framing.
- `components/marketplace/ConsultantProfileEditor.tsx` (or equivalent — locate): same rename + binding swap; read-with-fallback (`subjects || jurisdictions`, `industries || practice_areas`) so legacy data still renders during transition.
- `lib/consultantProfileStrength.ts`: re-point checks at `industries`/`subjects` instead of `practice_areas`/`jurisdictions` (read-with-fallback for legacy).
- `lib/profileSuggest.ts:65`: change the consultant Role line to **"Non-legal consultant — academic, career, business, education, settlement"**. Update the rest of the prompt template to never instruct the model to write legal copy for consultants.

### Phase 6 — Sign-up positioning + nav cleanup
- `app/sign-up/[[...rest]]/SignUpClient.tsx`: clarify the consultant lane copy — **"Consultant (non-legal: academic, career, business, settlement, mentorship)"** and separately **"Attorney (licensed legal practice)"**. No other functional change.
- Consultant dashboard navigation: confirm no "Legal …" surface is exposed (audit `components/dashboard/*` and any consultant-specific renderers). Remove or hide as needed. (List any you find — do not delete cross-role components blindly.)
- ✋

### Phase 7 — Verification gates (machine-checked, ALL must pass)
Run and paste output for each:
1. `npx tsc --noEmit` — clean across changed files.
2. `npm run build` — passes.
3. `grep -rEn "Immigration / legal consultant|practice_areas|jurisdictions" components app lib | grep -iE "consultant|ConsultantIntake|ConsultantProfile|consultantProfileStrength|profileSuggest"` — should return 0 hits in CONSULTANT-specific surfaces (attorney code paths legitimately keep these terms).
4. **Server gate proof:** show the rejection happening — a sample `curl` call (or pseudo-code) demonstrating a consultant POSTing a gig with `category: 'legal'` gets 403 from `/api/gigs`.
5. UI proof: 1-line note confirming the consultant gig-new category dropdown does NOT list Immigration or Legal Services.

## Existing errors you must also resolve along the way
- **The consultant intake wizard literally collects `jurisdictions` + `practice_areas`.** This is silently shipping legal-coded data into the consultants table for every consultant who has onboarded. Stop the new writes (Phase 5) and ensure read-with-fallback (Phase 4 + 5).
- **`POST /api/gigs` has no category-role check.** Today a consultant can already create gigs in `legal` and `immigration`. Phase 3 closes this hole as the security boundary; verify no other write path bypasses it (search `from('gigs').insert\(` and `update(` across `app/api/**` and lock down anything that lets a consultant set a forbidden category).
- **`profileSuggest.ts` consultant copy** is structurally hallucinating a legal role into AI output. Phase 5 removes this; pair with a small regression test prompt in your handoff (one line showing the new system prompt no longer says "legal").

## Handoff schema per phase (verbatim, per protocol)
- Brief 39, phase N.
- Files changed/added + line counts.
- Phase-specific gate output (greps, tsc, build, server-gate proof).
- Any deviation from this brief and the reason.
- What Claude should check first.
- (NO commits. NO git. NO Management-API SQL. NO deploy.)
