# GPT-5.5 IMPLEMENTATION BRIEF — Estate Sitemap-Index + Robots Consistency (Track B1)

> Governed by `SEO_MASTER_PLAN.md` (Part III, Track B1). This is the **estate** quick win and runs in parallel with the caseworks US-Batch-A content work (different repo — no collision). **Repo: `yousafe-consultancy`** (NOT caseworks).

## Role & chain of authority — READ FIRST, NON-NEGOTIABLE
- **You (GPT-5.5 / Codex) are the implementor.** Execute this brief exactly.
- **Claude Code reviews and merges.** You do **NOT** self-merge, push to `main`, or deploy.
- Work on a branch in a worktree of `yousafe-consultancy`, open **one** PR, paste validation output into the PR body, then **STOP**.
- Ambiguity → most conservative, most additive option; flag it in the PR.

---

## Mission
Two mechanical estate-consistency fixes you identified in your own multirepo sweep:
1. The landing-page **sitemap-index omits the Australia subdomain** even though `au.yousafeconsultancy.com` exists.
2. **robots `host:`** is still emitted by the marketing/regional apps, while caseworks intentionally removed the non-standard `Host` directive — inconsistent across the estate.

This is config/SEO-surface only. **No content, schema, or `/ai` work here** — that is Track B2, a separate brief. Keep this PR tight.

---

## §0 — Contract (hard fails)
- **Idempotency / additive only.** Do not change any existing title, meta description, canonical, H1, robots index/follow status, or any existing sitemap URL. The only additions are: one new line in the sitemap-index (the AU sitemap) and the removal of the `host` field from robots outputs. Prove the diff is limited to those.
- **Honesty.** No new schema, no fabricated data. (None needed here.)
- **No estate breakage.** Every URL that was in a sitemap before is still there after; no noindex/private/auth URL is newly exposed.

---

## §1 — Task 1: Add AU to the public sitemap-index
File: `yousafe-consultancy/landing-page/app/sitemap-index.xml/route.ts` (confirm exact path; it is the route that renders the top-level sitemap index).

Current index lists exactly these six and **omits AU**:
- `https://yousafeconsultancy.com/sitemap.xml`
- `https://usa.yousafeconsultancy.com/sitemap.xml`
- `https://ca.yousafeconsultancy.com/sitemap.xml`
- `https://uk.yousafeconsultancy.com/sitemap.xml`
- `https://legal.yousafeconsultancy.com/sitemap.xml`
- `https://portal.yousafeconsultancy.com/sitemap.xml`

Steps:
1. **First verify** `https://au.yousafeconsultancy.com/sitemap.xml` actually exists and returns valid XML (the AU app has its own sitemap). Do NOT add a reference to a missing/broken sitemap — if it 404s, stop and flag.
2. Add **`https://au.yousafeconsultancy.com/sitemap.xml`** to the index, **exactly once**, matching the existing entries' format/ordering convention.
3. Keep `checkout` and `support` **excluded** from the public index (unchanged).
4. Do not alter the other six entries.

---

## §2 — Task 2: Remove the non-standard `host` from robots
Caseworks precedent (already shipped): the `host:` field emits a `Host:` line — a legacy Yandex-only directive that Google ignores and validators flag. Remove it estate-wide in this repo.

Apply to every `app/robots.ts` in this repo that currently defines `host` — at least: `landing-page`, `usa`, `uk`, `ca`, `au` (grep the repo for `host:` in `robots.ts` to find them all; list what you found in the PR).

For each:
- **Remove** the `host` field.
- **Keep** the `sitemap` entry/entries exactly as-is.
- **Keep** `/api/` (and any existing legitimate) `disallow` rules.
- **Do NOT** add new `disallow` rules, and do not disallow any route that relies on `noindex` to stay out of the index (disallowing a route can stop crawlers from seeing its `noindex`).

*(Portal and support apps live in other repos — `yousafe-portal`, `yousafe-saas`. Their robots `host` normalization is a separate one-line follow-up per repo; note them in the PR as out-of-scope-here, do not touch them from this PR.)*

---

## §3 — Validation gate (paste raw output into the PR)
1. **Build** the affected apps (`landing-page` and any regional app whose robots you changed).
2. **Fetch the rendered sitemap index** from the build output (or a local serve) and confirm:
   - `au.yousafeconsultancy.com/sitemap.xml` appears **exactly once**;
   - all six prior entries are still present;
   - `checkout` and `support` are still absent.
3. **Fetch each changed robots output** and confirm: no `Host:` line; the `Sitemap:` line(s) remain; `Disallow: /api/` (and any prior rules) remain.
4. Show the diff is limited to: the one sitemap-index addition + `host`-field removals. No title/canonical/sitemap-URL/other changes.
5. List every `robots.ts` you changed and confirm `au.../sitemap.xml` returned 200 before you added it.

---

## §4 — Scope boundaries (do NOT)
- Do not add `/ai` pages, JSON-LD schema, hreflang, or content — those are B2/B5/B8, separate briefs.
- Do not change titles, descriptions, canonicals, H1s, or any existing sitemap URL.
- Do not add `checkout`/`support` to the public index.
- Do not add new `disallow` rules or disallow noindex-reliant routes.
- Do not touch `yousafe-portal` or `yousafe-saas` (their robots `host` is a separate follow-up).
- Do not edit caseworks.

---

## §5 — Branch, commit, PR protocol
- Repo: `yousafe-consultancy`. Branch: `seo-estate-sitemap-robots-b1` off latest `main`.
- Tidy commits; no scratch files.
- One PR titled `seo: add AU to sitemap-index + remove non-standard robots host (estate B1)`. Body must include: the §3 validation output (rendered sitemap-index showing AU exactly once; before/after robots outputs), the list of `robots.ts` files changed, confirmation `au.../sitemap.xml` returns 200, and any ambiguity flags.
- Then **STOP** and wait for review.

---

## Open questions to confirm in the PR (from the sweep)
1. Confirm `au.yousafeconsultancy.com/sitemap.xml` exists and is valid before wiring it in.
2. Confirm `host:` removal is acceptable estate-wide (caseworks precedent ⇒ yes; flag if any app relied on it intentionally).

## Definition of done
AU sitemap added to the landing sitemap-index exactly once (verified rendered); `host` removed from every `robots.ts` in `yousafe-consultancy` (sitemap + `/api/` disallow preserved); no other SEO signal changed; affected apps build; validation output pasted; one PR off `seo-estate-sitemap-robots-b1`; you stopped.
