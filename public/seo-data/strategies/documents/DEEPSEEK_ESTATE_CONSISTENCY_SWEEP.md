# DEEPSEEK BRIEF — Estate-Wide Consistency Sweep (phone, X handle, region links)

> **Cross-repo task. You have access to ALL repos** — caseworks, yousafe-consultancy, yousafe-portal, yousafe-saas. This is a coordinated sweep so the same fixes land cleanly everywhere. Open **one PR per affected repo** and **STOP** for Claude review (do not self-merge).

## Single source of truth for the values
- **Phone (all contact points, every repo):** `+1(757) 804-3263` · tel form `tel:+17578043263`
- **X / Twitter handle (every social button + Organization `sameAs`):** `https://x.com/yousafeconsul`

## Status (already done — do NOT redo)
- ✅ Phone is already `+1(757) 804-3263` across all **yousafe-consultancy** apps (usa/uk/ca/au/landing). caseworks has no phone.
- ✅ X handle already corrected to `yousafeconsul` in **caseworks** and all **yousafe-consultancy** footers + caseworks Organization `sameAs`.
- ✅ AU app de-Canadianized terminology (`f199bbb`) + resources links (`d490164`) — 0 `canada.ca` links remain in `au/`.

## Remaining work (this sweep)

### 1. yousafe-portal
- `lib/chatKnowledgeBase.ts` (~line 86): `Phone (US): 707-396-8390` → `Phone: +1(757) 804-3263`.
- `components/estate-footer-config.ts` (~line 54): X handle `https://x.com/yousafeconsult` → `https://x.com/yousafeconsul`.
- Grep the whole repo for any other phone number or `yousafeconsult` handle and fix consistently.
- PR branch: `estate-consistency-phone-x`.

### 2. yousafe-saas
- Grep the repo for any phone number and any `x.com/yousafeconsult` / `twitter.com/` handle. If present (footer, contact, knowledge base, schema `sameAs`), fix phone → `+1(757) 804-3263` and handle → `x.com/yousafeconsul`. If none exist, state that in the PR (no-op) — do not invent contact info on an internal tool.
- PR branch: `estate-consistency-phone-x`.

### 3. yousafe-consultancy — AU de-Canadianize finish
- `au/app/terms-of-service/page.tsx` (~line 37): "post-graduation work permit (Temporary Graduate visa) document checklists" → "**Temporary Graduate visa (subclass 485)** document checklists".
- `au/public/llms.txt` (~line 25): replace "post-graduation work permits" → "**Temporary Graduate visa (subclass 485)**".
- **Keep** the cross-estate Canada-sibling lines in `au/public/llms.txt` (3 / 15 / 16 / 50) — they correctly describe the Canada sibling site.
- PR branch: `seo-au-decanadianize-finish`.

## Estate-wide verification (run in EACH repo; paste per-repo into the PR)
1. **Phone:** `git grep -inE "[0-9]{3}[-.)][ ]?[0-9]{3}[ .-][0-9]{4}|tel:[+0-9]"` → every company contact number is `+1(757) 804-3263` / `tel:+17578043263`.
   - **Do NOT change** these (they are correct and must stay): the form-input placeholder `+1 (555) 000-0000` in consultancy contact pages (it is a format hint for the visitor's own number), and the **government BridgeUSA hotline `1-866-283-9090`** cited in consultancy `landing-page/lib/blog-data.ts` (it is a real US-gov abuse-reporting number — changing it would be false). List these as intentionally kept.
2. **X handle:** `git grep -inE "x\.com/yousafeconsult'|twitter\.com/yousafe"` → **no `yousafeconsult` (trailing-t) handle anywhere** (the domain `yousafeconsultancy.com` is fine and unrelated — do not touch it).
3. **AU region links/terms:** in `yousafe-consultancy/au` → `git grep -inE "canada\.ca|cic\.gc|ircc|study permit|\bpgwp\b|post-graduation work permit|express entry|\bCRS\b|provincial nominee"` → no matches except the intentional cross-estate Canada-sibling `llms.txt` lines.
4. Build any app whose source you changed.

## Honesty / idempotency (hard rules)
- Only real values: the one phone number, the one handle, first-party `*.gov.au` links for AU.
- Do not change page slugs, canonical URLs, routing, or layout. Edits are surgical content/config corrections.
- Do not touch the `yousafeconsultancy.com` domain string (only the social handle `x.com/yousafeconsult` → `…consul`).
- Do not fabricate contact info, services, prices, or credentials anywhere.

## PR protocol (per repo)
- One PR per affected repo (portal, saas if applicable, consultancy AU-finish), each off latest `main`, with the per-repo validation pasted. **Open PR and STOP — Claude reviews and merges. Do not self-merge or deploy.**
- Note in the consultancy PR: the **live `au.yousafeconsultancy.com/resources/` is stale** (still serves the old Canadian page despite committed `main` being AU-correct) — this is a deploy/CDN-cache issue for Claude/ops, not code; do not attempt to deploy or purge cache.

## Definition of done
Phone `+1(757) 804-3263` and X handle `x.com/yousafeconsul` consistent across **every** repo (portal + saas fixed or confirmed no-op; consultancy + caseworks already done); AU terminology fully Australian (2 stragglers fixed; cross-estate Canada-sibling lines kept); per-repo verification pasted; the protected numbers (form placeholder, gov hotline) listed as intentionally kept; one PR per repo opened; you stopped.
