# GPT-5.5 IMPLEMENTATION BRIEF — Multirepo SEO Guard Suite (Track B3)

> Governed by `SEO_MASTER_PLAN.md` (Part III, Track B3). **Repo: `yousafe-consultancy`** (NOT caseworks). Locks in the B1/B2 gains and catches regressions. Independent of caseworks work.

## Role & chain of authority — READ FIRST, NON-NEGOTIABLE
- **You (GPT-5.5 / Codex) are the implementor.** Execute this brief exactly.
- **Claude Code reviews and merges.** You do **NOT** self-merge, push to `main`, or deploy.
- Work on a branch in a worktree of `yousafe-consultancy`, open **one** PR, paste validation output into the PR body, then **STOP**.
- Ambiguity → most conservative option; flag it in the PR.

## Mission
`yousafe-consultancy` has 5 public apps (`landing-page`, `usa`, `uk`, `ca`, `au`) and now has `/ai` pages, honest schema, and a fixed sitemap-index/robots — but **no automated SEO guard** (caseworks has a 7-check suite). Build a caseworks-modeled guard suite for this monorepo so the B1/B2 gains can't silently regress.

This is **tooling + fixing genuine issues the tooling finds**. It is NOT content/schema expansion.

---

## §0 — Contract (hard fails)
- **Accuracy over coverage.** A guard that false-positives is worse than no guard — it trains people to ignore it. Model the checks on caseworks' `scripts/` (read them), tune to this repo's real structure, and **prove no false positives** before gating CI. If a check is too noisy to gate, ship it **report-only (warn)**, not gating — and say which is which.
- **Honesty / additive.** Adding guard scripts + CI wiring + a package script is additive. The only content/metadata you may change is to **fix a genuine SEO bug the guard catches** — and every such fix must be listed and justified in the PR. Do not opportunistically edit titles/canonicals/content otherwise.
- **Multi-app aware.** This is a monorepo: each app has its **own host, sitemap, robots, llms.txt**. The guard must scan each app against its **own** host (e.g. a canonical in `usa/` must be on `usa.yousafeconsultancy.com`, not the landing host).

---

## §1 — The guard checks (model on caseworks `scripts/seo-audit-guard.mjs` + its sub-checks)
Implement these as node scripts under `scripts/` (one runner + sub-checks, or modular — match caseworks' shape). Per app where relevant:

**Gating (hard fail — these are unambiguous bugs):**
1. **No noindex page in its sitemap** — a route with `robots: index:false` (or noindexed layout) must not appear in that app's `sitemap.xml`.
2. **No private/auth/dashboard/checkout URL in any public sitemap.**
3. **No duplicate canonical URL** across indexable pages within an app.
4. **No duplicate `<title>` or meta description** across indexable pages within an app.
5. **Canonical host correctness** — every rendered canonical for app X is on app X's host (no cross-host canonical leakage; no relative-only canonical on indexable pages).
6. **JSON-LD parses and uses only honest types** — fail on any `Review`, `AggregateRating`, `Event`, fake `Product` price, or `LegalService`/`LocalBusiness` with an invented address. (Reuse the caseworks schema-validity check logic.)
7. **`/ai` exists and is indexable** in each app that should have one (landing/usa/uk/ca/au), and is in that app's sitemap.

**Report-only (warn — useful but false-positive-prone):**
8. **Images** have meaningful `alt` or are explicitly decorative (`alt=""`).
9. **`/llms.txt` exists** and (best-effort) links only to indexable canonical URLs on that host.
10. **Indexable page not in sitemap** (warn — sitemap completeness; may have legitimate exceptions).

Each check prints PASS/FAIL/WARN with the offending file/URL, like caseworks. The runner exits non-zero only if a **gating** check fails.

---

## §2 — Wiring
- A single entry script (e.g. `scripts/seo-audit-guard.mjs`) that runs all checks across the 5 apps and prints a per-app + overall summary.
- A `package.json` script (e.g. `"seo:guard": "node scripts/seo-audit-guard.mjs"`).
- A **GitHub Actions** workflow (or extend an existing one) that runs the guard on PRs to `main`. It must be **green on `main` as of this PR** — so any gating issue the guard finds must be fixed in this PR (or the check downgraded to warn with a written reason). Do not merge a guard that's red on day one.

---

## §3 — Fix what it finds (in-PR, small only)
Run the guard. For each **gating** issue found:
- If it's a small, unambiguous fix (e.g. a noindex page leaking into a sitemap, a duplicate title, a wrong-host canonical, a forbidden schema type) → **fix it in this PR** and list it.
- If it's large or ambiguous (e.g. dozens of duplicate-intent pages needing content decisions) → **downgrade that check to warn**, document why, and flag it as a follow-up. Do not silently pass a real bug.
List every fix and every downgraded-to-warn decision in the PR body.

---

## §4 — Validation gate (paste raw output into the PR)
1. `node scripts/seo-audit-guard.mjs` (or the package script) — full output across all 5 apps; **gating checks all PASS**; list any WARN items.
2. Build the apps if any source was changed to fix an issue.
3. Show the GitHub Actions workflow added and that it runs the guard on PRs.
4. List: every guard check implemented (gating vs warn), every genuine issue found, every fix made, every check downgraded-to-warn with reason.
5. Confirm no title/description/canonical/content was changed except the listed bug-fixes.

---

## §5 — Scope boundaries (do NOT)
- Do not build the **portal** guard here — its sitemap is DB-backed and needs runtime/CI validation of active-vs-inactive gigs and private routes; that is a separate brief (B3-portal). Same for **yousafe-saas** (B3-saas). Note them as follow-ups.
- Do not expand content, add `/ai` pages, add schema, or add hreflang (those were B2 / are banned).
- Do not change titles/descriptions/canonicals/content except to fix a specific gating bug the guard caught (and list it).
- Do not touch caseworks, yousafe-portal, or yousafe-saas.
- Do not gate CI on a noisy/false-positive check — downgrade to warn instead.

---

## §6 — Branch, commit, PR protocol
- Repo: `yousafe-consultancy`. Branch: `seo-guard-suite-b3` off latest `main`.
- Tidy commits; no scratch files.
- One PR titled `seo: add multirepo SEO guard suite for consultancy apps (estate B3)`. Body must include: the §4 validation output (full guard run, all gating PASS), the list of checks (gating vs warn), every issue found + fix made + downgrade decision, the CI workflow added, and any ambiguity flags.
- Then **STOP** and wait for review.

---

## Definition of done
A caseworks-modeled SEO guard suite runs across all 5 consultancy apps (multi-app/host-aware); gating checks (noindex-in-sitemap, private-URL-in-sitemap, duplicate canonical/title/description, canonical-host correctness, honest-schema-only, `/ai` present+indexable) all PASS — with any genuine gating issue fixed in-PR and listed, or downgraded-to-warn with a reason; report-only checks (alt text, llms.txt, sitemap completeness) print WARN; a CI workflow runs the guard on PRs and is green on `main`; portal + saas guards noted as follow-ups; one PR off `seo-guard-suite-b3`; you stopped.
