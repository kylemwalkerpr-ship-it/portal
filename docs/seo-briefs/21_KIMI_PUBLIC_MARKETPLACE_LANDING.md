# Kimi Brief — Phase 7: Public Marketplace Landing (SEO + Conversion)

**Supervisor:** Claude (SEO manager). **Executor:** Kimi — single executor, precise work order (NOT a swarm).
**Repos:** `yousafe-portal` AND `yousafe-consultancy` (two whitelists, both small).

---

## 0. WHAT THIS DELIVERS

Today `market.yousafeconsultancy.com` is fully auth-gated — every visitor sees an instant redirect to `/sign-in/student`. That is **zero SEO surface for the only commerce-bearing page in the estate**, and it turns the marketplace-CTA traffic we routed in brief 20 into a hard sign-in wall.

This brief installs a public-facing **marketplace landing page** that:
- Serves UNAUTHENTICATED visitors at `/marketplace` with a real, indexable, keyword-targeted SEO page. Existing authenticated `client` users still see the existing `MarketplacePage` exactly as before.
- Becomes the second indexable URL on `portal.yousafeconsultancy.com` (the only other surface stays noindex). Sitemap + sitemap-index updated.
- Drives sign-up via two CTAs to `/sign-up/student?source=marketing&return_to=/marketplace` — leveraging brief 20's friction-free sign-up handler.

Architecture is conservative: one new component, one routing decision in the existing `app/marketplace/page.tsx`, one sitemap entry, one sitemap-index entry. No new layouts, no new data models.

Precise work order. Claude reviews, builds, commits.

---

## 1. FILE WHITELIST

**Repo: `yousafe-portal`** — 3 files

```
app/marketplace/page.tsx                            (edit — split on auth)
app/marketplace/PublicMarketplaceLanding.tsx        (NEW — the public landing)
app/sitemap.ts                                      (edit — add /marketplace)
```

**Repo: `yousafe-consultancy`** — 1 file

```
landing-page/app/sitemap-index.xml/route.ts         (edit — re-add portal sitemap)
```

Touch nothing else.

---

## 2. STEP 1 — split the marketplace route on auth (`app/marketplace/page.tsx`)

Current body:
```ts
const auth = await requirePortalUser()
if ('error' in auth) redirect('/sign-in/student?return_to=/marketplace')
if (auth.role !== 'client') redirect('/dashboard')
return <MarketplacePage />
```

New body:
```ts
const auth = await requirePortalUser()
if ('error' in auth) return <PublicMarketplaceLanding />   // unauthenticated → public landing, indexed
if (auth.role !== 'client') redirect('/dashboard')          // authed non-client → existing dashboard
return <MarketplacePage />                                  // authed client → unchanged
```

Add `generateMetadata` exporting:
- `title`: `'YouSafe Marketplace — Verified Immigration & Tenancy Help'` (≤60 chars)
- `description`: 140–160-char, keyword-first, intent-led — must read naturally and end with a CTA verb. Example:  
  `'Browse vetted US, UK and Canada immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.'`
- `alternates: { canonical: '/marketplace/' }` — trailing slash to match the rest of the estate.
- `robots: { index: true, follow: true }` — explicitly overrides the layout-level noindex.
- `openGraph: { url, title, description, type: 'website', images: [...] }` — mirror the apex pattern.

`PublicMarketplaceLanding` is server-rendered. The existing `MarketplacePage` and the dashboard redirect stay byte-identical.

---

## 3. STEP 2 — the landing page (`app/marketplace/PublicMarketplaceLanding.tsx`)

A server component (NO `'use client'`). It composes existing primitives where possible (read `app/page.tsx` and `components/SeoIntroBlock.tsx` for the portal's visual conventions; reuse the Nav/Footer used on the public home page).

### 3a. Required sections, in this order
1. **Hero** — H1, sub-headline, two CTAs (a primary "Browse providers" button and a secondary "How it works" anchor link).
2. **Category grid** — render 6–8 cards from `CATEGORIES` in `lib/categories.ts` where `popular === true`. Each card shows the name, the description, and an honest count or "see options" link. Cards are dofollow links to `/sign-up/student?source=marketing&return_to=/marketplace&utm_content=<category-id>`.
3. **How it works** — 3 numbered steps. Honest, plain. *Search providers → message free → pay through escrow*. No outcome promises.
4. **Trust strip** — three honest credibility points. Examples: "US, UK and Canada licensed attorneys reviewed before joining", "Escrow holds your payment until you confirm the work", "Consultants disclose registration (ICCRC, OISC, etc.) on their profile". No invented numbers.
5. **Pricing band** — "From $99 for an Essential document review" + range framing. Cite the existing Essential-tier copy already used on caseworks `CTAPanel` ("From $99 · 5-day standard turnaround on Essential tier").
6. **FAQ** — 5 questions, 60–90-word answers. Search-intent shape: *"How is this different from finding an attorney directly?"*, *"Is YouSafe a law firm?"* (No — clarify it is a marketplace), *"How do attorneys get vetted?"*, *"What countries do you cover?"*, *"How do refunds work?"*. Answers must be honest and YMYL-clean.
7. **Bottom CTA** — second large "Browse providers" button to the same `/sign-up/student?source=marketing&return_to=/marketplace&utm_content=footer` URL.

### 3b. Copy rules
- H1 ≤ 70 chars, keyword-first.
- Body 700–1,100 words across the prose sections (not counting nav/footer/structured-data).
- Mandatory house-style: `docs/seo-briefs/00_HOUSE_STYLE.md`. No "guaranteed", no outcome promises, no "world-class", no "seamless", no "navigate" verbs, no em-dash addiction.
- Every CTA href contains `source=marketing&return_to=/marketplace` (brief-20 friction-free sign-up). Add `utm_content` per location.

### 3c. Structured data — emit two JSON-LD blocks
- **Service** (the marketplace as a Service offered by Organization YouSafe Consultancy) — top-level `@type: 'Service'`, with `provider`, `serviceType: 'Immigration and Tenancy Legal Marketplace'`, `areaServed: ['United States','United Kingdom','Canada']`, `hasOfferCatalog` of the category names. **Honest fields only** — no review counts you can't substantiate.
- **FAQPage** — exact mirror of the §3a item 6 FAQs.

Do NOT add Organization schema in this file — it lives in the global layout. No `Article` schema (this is not an article).

### 3d. Visual rules
- Reuse the existing portal `Nav` and `Footer` components used on the public homepage (`app/page.tsx`).
- Tailwind / inline `C` design tokens used elsewhere — no new CSS files, no styled-components.
- Mobile responsive — the grid stacks at `sm:` and below; CTAs full-width on mobile.
- One H1 only. H2s on each of the 6 main sections.

---

## 4. STEP 3 — portal sitemap (`app/sitemap.ts`)

The portal sitemap is currently `[]` (brief 12 — "no indexable URLs"). That's now false: `/marketplace` is indexable. Update it to:

```ts
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://market.yousafeconsultancy.com/',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]
}
```

Replace the existing top-of-file comment with: *"Portal is members-area noindex sitewide via layout metadata. Per-page `generateMetadata` opts public routes back in. The marketplace landing is the only indexable URL today."* Concise — strip the historical commentary.

---

## 5. STEP 4 — apex sitemap-index (`yousafe-consultancy/landing-page/app/sitemap-index.xml/route.ts`)

Brief 12 removed `portal.yousafeconsultancy.com/sitemap.xml` from the index because portal's sitemap was empty. Re-add it now that portal has a real indexable URL.

```ts
const SUB_SITEMAPS = [
  'https://yousafeconsultancy.com/sitemap.xml',
  'https://usa.yousafeconsultancy.com/sitemap.xml',
  'https://ca.yousafeconsultancy.com/sitemap.xml',
  'https://checkout.yousafeconsultancy.com/sitemap.xml',
  'https://legal.yousafeconsultancy.com/sitemap.xml',
  'https://portal.yousafeconsultancy.com/sitemap.xml',   // <-- add this
] as const
```

Update the comment block too: *"Includes portal because the marketplace landing is now indexable. Support remains excluded — fully noindex."* Keep `support.yousafeconsultancy.com/sitemap.xml` OUT.

---

## 6. SELF-CHECK

- `/marketplace/page.tsx` returns `<PublicMarketplaceLanding />` for unauthed visitors, `<MarketplacePage />` for authed clients, redirect for authed non-clients. No other code paths changed.
- `<PublicMarketplaceLanding>` is server-only. No `'use client'`.
- H1 count on the rendered landing = 1. H2 count ≥ 6.
- Every internal CTA href contains `source=marketing` AND `return_to=/marketplace`.
- Sitemap returns exactly one URL: `https://market.yousafeconsultancy.com/`.
- Apex sitemap-index now lists 6 sub-sitemaps (5 + portal).
- House-style banned-word scan clean across all new prose.
- Title ≤60 chars; meta-description 140–160 chars.

---

## 7. VERIFICATION

```bash
# portal
cd ~/Documents/GitHub/yousafe-portal
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "portal build: $?"
# Files present:
test -f app/marketplace/PublicMarketplaceLanding.tsx && echo "landing component: ok"
# Sitemap shows the one URL:
grep -c "market.yousafeconsultancy.com" .next/server/app/sitemap.xml.body 2>/dev/null \
  || grep -c "/marketplace/" app/sitemap.ts

# yousafe-consultancy
cd ~/Documents/GitHub/yousafe-consultancy
pnpm --filter=landing-page build >/dev/null 2>&1; echo "landing-page build: $?"
grep -c "portal.yousafeconsultancy.com/sitemap.xml" landing-page/app/sitemap-index.xml/route.ts

# Whitelist
cd ~/Documents/GitHub/yousafe-portal && git status --porcelain | grep -v /out/ | grep -v /.next/
cd ~/Documents/GitHub/yousafe-consultancy && git status --porcelain | grep -v /out/ | grep -v /.next/
```

Required:
- both builds `: 0`
- landing component present
- sitemap matches §4 exactly
- sitemap-index now contains the portal entry
- `git status` shows exactly the whitelisted files in each repo (3 + 1).

---

## 8. EDITORIAL GATE (Claude)

Reject if: any file outside §1 is touched; H1 count ≠ 1; any CTA href missing `source=marketing` or `return_to=/marketplace`; landing component renders any client-only hooks; YMYL breach (claim of attorney review, refund guarantee, visa approval guarantee, invented numbers, "law firm" framing); title/meta off limits; sitemap or sitemap-index drift from §4/§5; build not idempotent.

After approval, Claude runs Phase-7 verification on the deployed URL once Cloudflare propagates and re-checks the apex sitemap-index resolves the new portal sitemap.

## 9. HANDOFF

No zip. Report the §7 output. Do not commit or branch.
