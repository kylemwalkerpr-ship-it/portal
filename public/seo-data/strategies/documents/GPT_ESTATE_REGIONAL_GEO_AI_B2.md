# GPT-5.5 IMPLEMENTATION BRIEF — Regional GEO/AI Parity (Track B2)

> Governed by `SEO_MASTER_PLAN.md` (Part III, Track B2). **Repo: `yousafe-consultancy`** (NOT caseworks). Independent of the caseworks US-content work — runs in parallel. Builds on B1 (merged).

## Role & chain of authority — READ FIRST, NON-NEGOTIABLE
- **You (GPT-5.5 / Codex) are the implementor.** Execute this brief exactly.
- **Claude Code reviews and merges.** You do **NOT** self-merge, push to `main`, or deploy.
- Work on a branch in a worktree of `yousafe-consultancy`, open **one** PR, paste validation output into the PR body, then **STOP**.
- Ambiguity → most conservative, most additive option; flag it in the PR.

---

## Mission
Bring the brand + regional apps up to caseworks' GEO/AI parity, in two parts:
1. **`/ai` context pages** for `landing-page`, `usa`, `uk`, `ca`, `au` (these apps have `llms.txt` but no `/ai`).
2. **AU schema parity** — AU is the weakest regional app: it has `robots.ts`/`sitemap.xml`/`llms.txt` but **no detected page JSON-LD**, and it's missing from some shared jurisdiction enumerations. Bring it up to the honest baseline that CA/US/UK already emit.

This is the GEO/AI surface + AU schema. It does NOT include deeper AU article/guide content (that's a later pass) or hreflang (Track B8, banned for now).

---

## §0 — Contract (hard fails)
- **Idempotency / additive only.** Do not change any **existing** title, meta description, canonical, H1, or robots index/follow of any existing page. Do not remove or rename any existing sitemap URL. You are **adding** new `/ai` pages (and their new sitemap entries — additive is fine) and **adding** JSON-LD to AU. Nothing existing is rewritten.
- **Honesty (overrides "more schema is better"):** **NEVER** emit `Review`, `AggregateRating`, star ratings, `Event`, fake `Product` prices, `LocalBusiness`/`LegalService` with an invented address, or invented author/staff credentials. Only emit schema whose every field is **true and visible on the page**. `/ai` pages contain only true, factual descriptions of the actual app.
- **No scaffolding/prompt-leak** phrases. No marketing fluff in `/ai` text.
- **Templates to match (read them first):** model the `/ai` pages on caseworks `app/ai/page.tsx`; model AU's JSON-LD on the **existing CA/US/UK** schema in this repo (Organization/WebSite/BreadcrumbList). Reuse the established patterns — do not invent new shapes.

---

## §1 — Task 1: `/ai` context pages (5 apps)
Create `app/ai/page.tsx` in each of: `landing-page`, `usa`, `uk`, `ca`, `au`. Each must be:
- **Text-first, indexable** (`robots: index, follow`), **self-canonical** (`alternates.canonical` to its own `/ai` URL on that host), with a real title/description/H1.
- **Added to that app's sitemap** (new URL — additive).
- Written to be ingested and quoted by an LLM — honest, factual, no marketing voice.

Each page summarizes, for **that specific app**:
- who the app serves and its **jurisdiction scope** (e.g. `usa.` = US student/immigration services);
- its **canonical service pages** (link to the real ones in that app);
- its **article/resource hub** URLs;
- the **contact/onboarding** route;
- its **relationship to the rest of the estate**: caseworks/legal (deep legal articles), portal/marketplace, support.

`landing-page/ai` is the brand-level overview (whole estate + jurisdiction routing); each regional `/ai` is that region's overview. Add `WebPage`/`AboutPage` JSON-LD to each `/ai` page (matching caseworks' `/ai`). Link each app's `/ai` from its footer or `llms.txt` if that's the existing convention.

**Decision (Codex's open question #3 resolved):** do all 5 now (brand + usa/uk/ca/au); checkout/support get no `/ai`.

---

## §2 — Task 2: AU schema parity
AU currently emits no page JSON-LD. Bring it to the honest baseline CA/US/UK already have:
1. **Add JSON-LD** to AU (layout/route level, matching the CA/US/UK pattern in this repo): `Organization` (YouSafe), `WebSite` for the `au.` host, and `BreadcrumbList` on service/resource pages. Add `FAQPage` only where FAQ content is visibly on the page, and `Service`/`EducationalOccupationalProgram` only for actual, accurate AU service offerings. Every field must be true.
2. **Enumerate AU in shared data:** add AU to any shared **jurisdiction arrays, navigation data, link/related-content modules, and sitemap/index generators** where the other regions (US/UK/CA) are listed but AU is missing. Grep the repo for where `usa`/`uk`/`ca` jurisdictions are enumerated and add `au` consistently. (Do not change the other regions' entries.)

Do not fabricate AU services, prices, addresses, or credentials. If a schema type would require a field AU doesn't truly have, omit that type.

---

## §3 — Validation gate (paste raw output into the PR)
1. **Build** every affected app (`landing-page`, `usa`, `uk`, `ca`, `au`).
2. For each new `/ai` page: confirm it renders, is `index:true`, self-canonical, and **present in that app's sitemap** (show the sitemap entry). Confirm checkout/support have no `/ai`.
3. **JSON-LD parses** and uses only honest types — paste the AU JSON-LD and confirm no `Review`/`AggregateRating`/`Event`/fake-`Product`/`LegalService`/`LocalBusiness`-with-address anywhere you touched. Confirm AU now emits Organization + WebSite (+ BreadcrumbList where applicable), matching CA/US/UK.
4. **Idempotency:** confirm no existing page's title/description/canonical/H1/robots changed and no existing sitemap URL was removed/renamed (diff is additive: new `/ai` files + AU schema + AU enumeration entries).
5. List the shared jurisdiction arrays/nav/link/sitemap generators where you added AU.
6. `grep`-confirm no scaffolding/prompt-leak phrases in the new `/ai` prose.

---

## §4 — Scope boundaries (do NOT)
- Do not add hreflang (Track B8 — still banned until per-locale pre-rendered routes exist).
- Do not author deep AU article/guide content (separate later pass) — `/ai` is a context overview, not a content cluster.
- Do not change existing titles/descriptions/canonicals/H1s or remove/rename existing sitemap URLs.
- Do not add `/ai` to checkout/support.
- Do not add any forbidden schema (Review/AggregateRating/Event/fake-Product/LegalService-with-address) or fabricate AU services/prices/addresses/credentials.
- Do not touch caseworks, yousafe-portal, or yousafe-saas.

---

## §5 — Branch, commit, PR protocol
- Repo: `yousafe-consultancy`. Branch: `seo-regional-geo-ai-b2` off latest `main`.
- Tidy commits; no scratch files.
- One PR titled `seo: regional GEO/AI parity — /ai pages (5 apps) + AU schema baseline (estate B2)`. Body must include: the §3 validation output (per-app `/ai` render + sitemap entry; AU JSON-LD pasted with honest-types confirmation; the additive-only diff confirmation; the list of jurisdiction enumerations AU was added to), and any ambiguity flags. If the PR grows too large to review cleanly, you may split into `B2a` (the 5 `/ai` pages) and `B2b` (AU schema parity) — note the split in the PR.
- Then **STOP** and wait for review.

---

## Open questions to confirm in the PR
1. Confirm each app's existing sitemap-generation convention so the new `/ai` page is added the same way (don't hand-roll a divergent pattern).
2. Confirm AU's existing layout/route structure so the JSON-LD is injected at the same level CA/US/UK use.
3. Flag if any AU "service" lacks a true, visible offering — omit its `Service` schema rather than fabricate.

## Definition of done
`/ai` pages live on brand + usa/uk/ca/au (indexable, self-canonical, in each app's sitemap, honest text-first content + WebPage/AboutPage JSON-LD); AU emits the honest baseline JSON-LD (Organization + WebSite + BreadcrumbList) matching CA/US/UK; AU added to all shared jurisdiction enumerations; **zero** forbidden schema; no existing SEO signal changed (additive only); affected apps build; validation pasted; one PR off `seo-regional-geo-ai-b2`; you stopped.
