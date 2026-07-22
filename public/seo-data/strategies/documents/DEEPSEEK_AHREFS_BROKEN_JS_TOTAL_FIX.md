# DEEPSEEK IMPLEMENTATION BRIEF — Ahrefs Broken JavaScript Total Fix

> **Supervisor:** Codex/GPT-5.5. **Implementor:** DeepSeek.  
> **Estate root:** `/Users/phantomdarne/Documents/GitHub`.  
> **Ahrefs export:** `/Users/phantomdarne/Downloads/yousafeconsultancy_11-jun-2026_page-has-broke_2026-06-12_00-19-12.csv`.  
> This is a targeted technical SEO repair. Fix the Ahrefs issue in totality, prove it locally and live, then open PRs and stop.

---

## Role & Chain Of Authority

- You are the implementor. Codex/Claude supervises, reviews, approves, commits/merges, and deploys.
- Do **not** push to `main`.
- Do **not** self-merge.
- Do **not** deploy.
- Work on branches, open the smallest necessary PR or PRs, paste validation, then **STOP**.
- If you discover the issue is deploy/cache-only and no repository change is justified, do not make a fake code change. Produce a no-code findings report with exact deploy/cache actions needed and stop.

---

## Repos And Apps

The project estate lives under `/Users/phantomdarne/Documents/GitHub`.

- `yousafe-consultancy` is the main marketing monorepo.
  - Regional/static apps: `ca`, `usa`, `uk`, `au`.
  - Checkout app: `checkout`.
  - Brand landing app may exist separately as `landing-page`.
- Sibling repos:
  - `caseworks`.
  - `yousafe-portal`.
  - `yousafe-saas`.

This Ahrefs report is for `yousafeconsultancy.com` subdomains and currently affects `uk.yousafeconsultancy.com` and `ca.yousafeconsultancy.com`. Start in `yousafe-consultancy`. Touch sibling repos only if the evidence proves they participate in the same broken-asset issue.

---

## Required Reading Before Editing

Read these files before touching code or content:

1. `/Users/phantomdarne/Documents/GitHub/SEO strategies/SEO_MASTER_PLAN.md`
   - At minimum, read Parts I, II.2, III Track B, V, and VI.
   - Follow the PR-and-stop chain of authority.
   - Preserve SEO-signal idempotency unless a change is explicitly required.
2. `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/docs/seo-briefs/00_HOUSE_STYLE.md`
3. `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/docs/SEO-Master-Plan-2026-05-29.md`
4. `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/docs/seo-briefs/25_KIMI_UK_SITE.md`
5. `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/docs/seo-briefs/06_KIMI_YC_SITEMAP_COUNTRY_PAGES.md`
6. `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/ca/cluster-3-ca-study-permit-pgwp/CLUSTER-BRIEF.md`
7. `/Users/phantomdarne/Documents/GitHub/caseworks/docs/seo-briefs/00_HOUSE_STYLE.md`
8. `/Users/phantomdarne/Documents/GitHub/yousafe-portal/docs/seo-briefs/00_HOUSE_STYLE.md`

The house style matters even for technical changes because you may need to edit comments, report text, or docs. Keep prose calm, factual, and specific. Do not use AI-ish filler or banned phrases from the house style.

---

## Ahrefs Findings To Eliminate

The CSV has 18 affected pages:

- 14 pages on `uk.yousafeconsultancy.com`.
- 4 pages on `ca.yousafeconsultancy.com`.
- Each affected page returns HTTP 200, but one linked Next.js JavaScript chunk returns 404.
- `uk` missing asset pattern: `/_next/static/chunks/407373ae26118783.js`.
- `ca` missing asset pattern: `/_next/static/chunks/9d15e4f6b66bb856.js`.

Affected URLs:

| Host | URL | Broken asset |
|---|---|---|
| UK | `https://uk.yousafeconsultancy.com/from/nigeria/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/india/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/ghana/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/sri-lanka/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/kenya/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/turkey/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/hong-kong/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/saudi-arabia/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/united-states/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/malaysia/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/egypt/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/china/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/pakistan/` | `/_next/static/chunks/407373ae26118783.js` |
| UK | `https://uk.yousafeconsultancy.com/from/united-arab-emirates/` | `/_next/static/chunks/407373ae26118783.js` |
| CA | `https://ca.yousafeconsultancy.com/from/` | `/_next/static/chunks/9d15e4f6b66bb856.js` |
| CA | `https://ca.yousafeconsultancy.com/from/india/` | `/_next/static/chunks/9d15e4f6b66bb856.js` |
| CA | `https://ca.yousafeconsultancy.com/from/nigeria/` | `/_next/static/chunks/9d15e4f6b66bb856.js` |
| CA | `https://ca.yousafeconsultancy.com/from/south-korea/` | `/_next/static/chunks/9d15e4f6b66bb856.js` |

---

## Likely Cause To Prove Or Disprove

`uk` and `ca` are static-export Next apps:

- `uk/next.config.mjs`: `output: 'export'`, `trailingSlash: true`.
- `ca/next.config.mjs`: `output: 'export'`, `trailingSlash: true`.

Their `public/_headers` files cache `/from/*` and `/universities/*` HTML at the browser for 4 hours and at Cloudflare CDN for 24 hours with stale-while-revalidate:

```txt
Cache-Control: public, max-age=14400, must-revalidate
CDN-Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

The broken asset pattern is consistent with stale HTML from one deployment referencing hashed Next chunks that are no longer present in the active deployment. Do not assume this blindly. Prove the cause.

---

## Mission

Eliminate the Ahrefs "page has broken JavaScript" issue for the full CSV set and prevent the same class of issue from recurring across the static-export consultancy apps.

The finished work must satisfy all of these:

1. Every JavaScript URL linked by the 18 affected pages returns HTTP 200 live.
2. Local `out/` builds for the affected apps contain every JS chunk referenced by generated HTML.
3. HTML caching cannot preserve old HTML long enough to point at chunks removed by a later deployment.
4. No route, title, meta description, canonical, H1, robots policy, sitemap URL set, or JSON-LD is changed unless required and explicitly justified.
5. No generated `out/`-only patch is the primary fix. Fix source/config.

---

## Implementation Scope

### Primary scope

Repository:

```txt
/Users/phantomdarne/Documents/GitHub/yousafe-consultancy
```

Apps:

```txt
uk/
ca/
```

Likely files to inspect first:

```txt
uk/public/_headers
ca/public/_headers
uk/next.config.mjs
ca/next.config.mjs
uk/package.json
ca/package.json
```

### Preventive scope

Also inspect equivalent static-export apps for the same risky HTML caching pattern:

```txt
usa/public/_headers
au/public/_headers
checkout/public/_headers
landing-page/public/_headers
```

If the same stale-HTML risk exists on another public static-export app, include the minimal consistent fix in the same PR and explain why. If a file does not exist or the app is not affected, state that in the PR.

### Do not edit unless evidence requires it

```txt
caseworks/
yousafe-portal/
yousafe-saas/
```

---

## Expected Fix Direction

The likely fix is to change HTML route caching for static-export programmatic pages so HTML revalidates before it can reference deleted hashed chunks.

Use the most conservative cache policy that still protects SEO health:

- Keep `/_next/static/*` immutable. These files are fingerprinted assets.
- Keep image caching if unchanged.
- Change HTML route caching for `/from/*` and `/universities/*` away from long CDN retention.
- Prefer one of these patterns, unless testing proves a better source-compatible fix:

```txt
Cache-Control: public, max-age=0, must-revalidate
CDN-Cache-Control: public, max-age=0, must-revalidate
```

or, if the team wants a small edge cache:

```txt
Cache-Control: public, max-age=300, must-revalidate
CDN-Cache-Control: public, max-age=300, must-revalidate
```

Do not change security headers unless required. Do not weaken HSTS, CSP, frame, referrer, or permissions policies.

If you find a deployment config that retains old assets safely and the issue is instead an incomplete deploy, fix the deploy config or document the deploy-only correction. Do not force a cache change if the evidence shows another root cause.

---

## Reproduction And Diagnosis

Run from `yousafe-consultancy`.

1. Confirm current git state and branch.
2. Parse the CSV and reproduce the failing linked assets.
3. Fetch each affected page live and extract all `<script src>` URLs.
4. Confirm status for every script URL, not only the known missing one.
5. Build `uk` and `ca` locally:

```bash
cd uk && npm run build
cd ../ca && npm run build
```

6. For each affected local page in `out/`, extract every `/_next/static/*.js` reference and prove the file exists under `out/_next/static/`.
7. Compare local generated asset hashes with live HTML asset hashes. This is how you distinguish stale live HTML from a source build defect.

---

## Validation Gate

Paste raw output or concise machine-readable summaries into the PR.

### Local build checks

Run every changed app:

```bash
npm run build
```

For `ca`, also run if available:

```bash
npm run typecheck
npm run test:cluster3
```

### Local asset integrity check

For each affected app, prove:

- Every HTML file in `out/from/**/index.html` references only JS files that exist in `out/_next/static/`.
- Every HTML file in `out/universities/**/index.html`, if that route exists, references only JS files that exist in `out/_next/static/`.
- No `out/**/*.html` references the known missing live chunks unless those files exist in local `out`.

A simple Node script is fine for validation, but do not commit scratch scripts unless they are useful reusable guards.

### Live recrawl check

After the PR is reviewed, merged, and deployed by the supervisor, these same checks must pass live. Your PR should include the command the reviewer can run:

```bash
node scripts-or-oneoff-check-that-fetches-the-18-csv-pages-and-all-script-srcs
```

Expected result after deploy:

- 18/18 pages return HTTP 200.
- 0 linked JavaScript assets return 404.
- 0 linked JavaScript assets return 5xx.
- The two Ahrefs missing chunks either return 200 because old HTML is still intentionally served with retained assets, or the live HTML no longer references them.

### SEO idempotency checks

Prove no accidental SEO-signal changes:

- No title changes.
- No meta description changes.
- No canonical changes.
- No H1 changes.
- No robots/indexability changes.
- No sitemap URL additions/removals caused by this fix.
- No JSON-LD changes unless explicitly required.

Use existing scripts if available. If no script exists for a regional app, use `git diff` plus generated HTML spot checks for the 18 affected pages.

---

## PR Requirements

Branch name:

```txt
seo-ahrefs-broken-js-total-fix
```

PR title:

```txt
fix(seo): prevent stale static HTML from referencing missing Next chunks
```

PR body must include:

- Root cause, with evidence.
- Files changed.
- Why the change eliminates all 18 Ahrefs findings.
- Whether `usa`, `au`, `checkout`, or `landing-page` had the same pattern and what you did.
- Build output per changed app.
- Local asset-integrity proof.
- Live reproduction output before fix, if available.
- Exact post-merge/deploy command for supervisor recrawl.
- Confirmation that no generated `out/` files are the source of truth for the fix.
- Confirmation that no SEO signals changed, or a clear exception list if any did.

---

## Hard Do-Nots

- Do not edit generated `out/` files as the lasting fix.
- Do not delete `_next/static` caching.
- Do not add `noindex`.
- Do not remove pages from sitemap.
- Do not change slugs, route shape, canonical URLs, titles, descriptions, or H1s.
- Do not deploy.
- Do not purge Cloudflare cache yourself unless explicitly asked later by the supervisor.
- Do not touch portal/caseworks/saas unless you prove they are part of the same broken-asset issue.
- Do not use broad formatting or cleanup commits.

---

## Definition Of Done

- Ahrefs CSV issue reproduced and explained.
- `uk` and `ca` source/config fixed, or a no-code deploy/cache-only finding is documented with proof.
- Any other static-export consultancy app with the same recurrence risk is handled consistently or explicitly ruled out.
- Changed apps build successfully.
- Local generated HTML has zero missing JS references.
- PR opened from `seo-ahrefs-broken-js-total-fix`.
- PR includes the validation evidence and the post-deploy recrawl command.
- You stop for supervisor review.
