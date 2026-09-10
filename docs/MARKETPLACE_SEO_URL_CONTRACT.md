# Marketplace SEO URL Contract

**Status:** Active architecture contract  
**Scope:** `market.yousafeconsultancy.com` public marketplace + `portal.yousafeconsultancy.com` authoring/admin surfaces  
**Goal:** Fiverr-grade URL stability and crawlability without creating a migration wave, redirect chains, or new 404s.

## 1. Core rule: clean before publish, immutable after publish

A public service slug is a resource identifier, not a presentation field.

- Drafts may be normalized and corrected before first publication.
- New slugs are lowercase ASCII, hyphen-separated, readable, keyword-led, and bounded in length through `buildSlug()` / `buildUniqueSlug()`.
- A service that has been published keeps its stored slug even when its title, description, SEO title, category copy, or offer details change.
- Do not regenerate a public slug from a changed title.
- Do not bulk-backfill live slugs merely to make them prettier.
- Existing historical redirect mappings remain supported, but this contract does not create a new redirect migration.

This is intentionally conservative: URL stability is more valuable than cosmetically rewriting an already-discovered URL.

## 2. Canonical public route model

The public marketplace host owns indexable marketplace URLs:

```text
https://market.yousafeconsultancy.com/
https://market.yousafeconsultancy.com/categories
https://market.yousafeconsultancy.com/categories/<category-or-subcategory-id>
https://market.yousafeconsultancy.com/gigs/<immutable-clean-slug>
https://market.yousafeconsultancy.com/providers/<stable-provider-token>
https://market.yousafeconsultancy.com/shop
https://market.yousafeconsultancy.com/shop/<product-slug>
```

The File Shop is the canonical home for self-serve template packs and downloadable products. Historical `/templates` and `/templates/<slug>` URLs are aliases only and must permanently redirect in one hop to `/shop` and `/shop/<slug>` respectively. They must never appear as canonicals, sitemap URLs, or new internal links.

The Next.js route tree may live internally under `/marketplace/**`, but public metadata, internal links, structured data, and sitemap entries must use the final market-domain form. Canonicals must never point at a URL that immediately redirects.

`portal.yousafeconsultancy.com` is the authenticated operational surface. It must not compete with the marketplace for indexable service URLs.

## 3. Slug normalization rules

For new or still-draft service URLs:

- Unicode is normalized to a stable ASCII representation where practical.
- Lowercase only.
- Hyphens are the word separator.
- Quotes/apostrophes do not create noisy separators.
- Low-value English preamble/stop words may be removed where meaning remains clear.
- Repeated punctuation and separators collapse.
- Slugs are trimmed at a word boundary rather than cutting a keyword in half.
- Collision handling must be deterministic (`-2`, `-3`, ...), never a random suffix unless the deterministic space is exhausted.
- Raw user-provided slug strings never go directly into persistent public URL fields.

Do not sanitize an existing live slug at read time. The sitemap, canonical, page route, and internal links must continue to use the exact stored live slug.

## 4. Breadcrumb hierarchy

Breadcrumbs communicate the commercial taxonomy even though gig URLs remain intentionally shallow.

Preferred service hierarchy:

```text
Marketplace > Category > Subcategory > Service
```

Category pages use:

```text
Marketplace > Categories > Parent Category > Subcategory
```

Breadcrumb structured data and visible navigation should use human-readable category names. The breadcrumb hierarchy does not need to mirror the literal URL folder nesting; it should represent the normal user path through the marketplace.

## 5. Sitemap policy

`https://market.yousafeconsultancy.com/sitemap.xml` is the marketplace sitemap and is already included in the estate sitemap index at:

```text
https://yousafeconsultancy.com/sitemap-index.xml
```

The marketplace sitemap contains only canonical public URLs that are intended for discovery:

- Marketplace home and substantive directory hubs.
- Top-level category hubs with useful editorial content.
- Subcategories only when active marketplace supply is positively confirmed.
- Active gigs with a valid provider and stored slug.
- Public provider pages.
- The File Shop index and published `/shop/<product-slug>` product pages.

A database/supply-check failure must fail closed for thin subcategory shelves. It must not cause every taxonomy URL to leak into the sitemap.

`lastModified` is emitted only when the application has a real modification timestamp. Do not set every static URL to the current request time.

Portal does not advertise a sitemap because it is not the public commercial indexing surface.

## 6. Query strings, filters, and duplicate control

Search, sort, tracking, pagination, and faceted-filter combinations must not create a second indexable copy of the same marketplace landing page.

- Sitemap entries use clean canonical URLs without tracking parameters.
- UTM/filter variants canonicalize to the intended clean landing page when indexable content is otherwise identical.
- Thin or effectively infinite filter combinations stay out of the sitemap and should remain `noindex, follow` when exposed to crawlers.
- Internal navigation should link to canonical category/service paths rather than parameterized aliases whenever a stable landing page exists.

## 7. Marketplace content and spam-quality guardrails

The marketplace should grow in Google as a service marketplace, not as a mass-generated taxonomy farm.

- Do not index empty shelves solely because a category exists in code.
- Do not create near-duplicate location/category pages unless they have real supply and materially distinct user value.
- Do not stuff slugs with repeated synonyms, years, locations, or provider names purely for ranking.
- Keep title/H1, category context, service body, structured data, and canonical URL semantically aligned.
- Use internal links and breadcrumbs to establish hierarchy; do not rely on deeply nested URL folders as the primary ranking signal.
- Active service pages should have unique offer/provider content, real scope, useful descriptions, and valid structured data.

## 8. Change-management rule

Any future proposal that changes a live URL must explicitly answer all of the following before implementation:

1. Why is changing the indexed URL materially better than leaving it stable?
2. Is the old URL currently indexed, linked, bookmarked, ordered against, or present in analytics/GSC?
3. Can the improvement be achieved through title, H1, breadcrumb, canonical, internal linking, or content changes instead?
4. If a URL change is genuinely unavoidable, is there a single-hop permanent redirect and a preserved historical mapping?
5. Have sitemap, canonical, JSON-LD, internal links, payment/order references, API lookups, and tests been updated atomically?

Default answer: **do not change the live slug**.

## 9. Implementation ownership

- `lib/fiverr.ts` — canonical new/draft gig slug normalization and uniqueness.
- `app/api/gigs/**` — gig creation/edit publication boundary and slug immutability.
- `app/api/admin/services/**` — admin service slug sanitation + live URL stability.
- `lib/marketplaceSeo.ts` — market host canonical contract.
- `lib/gigJsonLd.ts` — Service/Offer/provider/breadcrumb structured data.
- `app/sitemap.ts` — indexable marketplace and File Shop URL inventory.
- `app/robots.ts` — host-aware crawler discovery.
- `app/marketplace/templates/**` — legacy template aliases; permanent redirects only.
- Apex `yousafe-consultancy/landing-page/app/sitemap-index.xml/route.ts` — estate-level sitemap discovery; includes the market sitemap.

## 10. Design principle borrowed from mature marketplaces

Copy the durable pattern, not another company's exact route syntax: a small number of stable descriptive taxonomy URLs, shallow permanent service URLs, readable breadcrumbs, canonical consistency, strong internal linking, and selective sitemap inclusion based on real inventory.

## 11. One-time Marketplace copy-quality migration

The 2026 Marketplace copy-quality reset is intentionally separated from URL identity. It may rewrite public titles, taglines, pitches, descriptions, FAQs, tags, SEO titles, SEO descriptions, and provider About copy, but it must not write published gig slugs or gallery-image mappings.

The production migration is allowed to run only after the normal Portal deployment workflow succeeds. Before the first content write and after the final content audit, the migration verifies all active gig `gallery_images` against the pre-rewrite version snapshots. Any image mismatch fails the migration rather than silently reassigning or replacing gig imagery.

This preserves the original gig-to-image relationship while allowing the copy itself to be rewritten around the same stable service identity.
