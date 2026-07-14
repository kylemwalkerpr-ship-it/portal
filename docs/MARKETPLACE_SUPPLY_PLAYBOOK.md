# Marketplace supply playbook (SEO + revenue)

**Goal:** Do not rank empty shelves. SEO investment follows **active gigs**, not category taxonomy size.

## Rules (product + SEO)

| Rule | Implementation |
|---|---|
| Category with **0 active gigs** | `noindex, follow` + **out of sitemap** (as of 2026-07-14) |
| Category with **≥1 active gig** | indexable; title shows service count |
| Caseworks CTAs | Prefer categories with supply; until then, still OK (follow preserves equity) |
| Minimum for paid SEO push | **≥3 active gigs** in that category (deep strategy §5) |

## Operator checklist (this week)

1. **List gigs** on `market.yousafeconsultancy.com` for money categories first:
   - `study-permits`, `work-permits`, `document-prep`, `family-sponsorship`, `attorney-review`
2. Each gig needs: clear title, fixed price, turnaround, country tags, active provider profile.
3. After listing, **redeploy portal** (or wait for next main push) so sitemap re-queries Supabase.
4. Spot-check:

```bash
curl -sI "https://market.yousafeconsultancy.com/categories/study-permits" | grep -i robots
# with supply: index,follow  |  empty: noindex,follow

curl -s "https://market.yousafeconsultancy.com/sitemap.xml" | grep study-permits
```

5. Only then: caseworks deep-links to **specific gigs** (not only category hubs).

## Code references

- Category indexing policy: `app/marketplace/categories/[categoryId]/page.tsx` (`emptyShelf`)
- Sitemap supply filter: `app/sitemap.ts` (`categoriesWithSupply`)
- Category copy: `lib/categories.ts` descriptions
- Caseworks cluster → category map: `caseworks/lib/marketplaceClusterMap.ts`

## Why this is “business P0”

Content estate ≈ 1,400 URLs. Marketplace sitemap had **~4 gigs**. Ranking category pages with “(1 services)” or empty discovery destroys conversion and quality signals. **Supply first, then SEO.**
