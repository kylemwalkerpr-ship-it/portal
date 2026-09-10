from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))


def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

# 1) Broaden the recommendation belt from exact-filter-only to a deliberate
#    exact -> sibling -> adjacent-family ranking, while preserving the compact
#    hero-belt design already approved on main.
carousel = 'components/marketplace/CategoryRecommendedGigsCarousel.tsx'
replace_once(
    carousel,
    "import { getCategoryFilterTerms } from '@/lib/categories'",
    "import { CATEGORIES, getCategoryById, getCategoryBySubcategoryId, getCategoryFilterTerms } from '@/lib/categories'",
)
replace_once(
    carousel,
    "function isRelatedGig(gig: RecommendedGig, categoryId: string): boolean {\n  const accepted = new Set(getCategoryFilterTerms(categoryId).map(normalizeTaxonomyValue))\n  const category = normalizeTaxonomyValue(gig.category)\n  const subcategory = normalizeTaxonomyValue(gig.subcategory)\n  return Boolean((category && accepted.has(category)) || (subcategory && accepted.has(subcategory)))\n}\n\nasync function requestGigs(\n  categoryId: string,\n  sort: 'trending' | 'best_rated' | 'most_orders',\n  signal: AbortSignal,\n): Promise<RecommendedGig[]> {\n  const params = new URLSearchParams({\n    category: categoryId,\n    sort,\n    limit: '12',\n    page: '1',\n  })\n  const response = await fetch(`/api/marketplace/gigs?${params.toString()}`, {\n    credentials: 'same-origin',\n    signal,\n  })\n  const payload = await response.json().catch(() => ({}))\n  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load recommendations')\n  const data = payload?.data ?? payload\n  const gigs: RecommendedGig[] = Array.isArray(data?.gigs) ? data.gigs : []\n\n  return gigs.filter((gig) => isRelatedGig(gig, categoryId))\n}\n",
    "function isRelatedGig(gig: RecommendedGig, categoryId: string): boolean {\n  const accepted = new Set(getCategoryFilterTerms(categoryId).map(normalizeTaxonomyValue))\n  const category = normalizeTaxonomyValue(gig.category)\n  const subcategory = normalizeTaxonomyValue(gig.subcategory)\n  return Boolean((category && accepted.has(category)) || (subcategory && accepted.has(subcategory)))\n}\n\nfunction isRelatedToAny(gig: RecommendedGig, categoryIds: string[]): boolean {\n  return categoryIds.some((categoryId) => isRelatedGig(gig, categoryId))\n}\n\nasync function requestGigs(\n  categoryIds: string[],\n  sort: 'trending' | 'best_rated' | 'most_orders',\n  signal: AbortSignal,\n): Promise<RecommendedGig[]> {\n  const params = new URLSearchParams({ sort, limit: '18', page: '1' })\n  categoryIds.forEach((categoryId) => params.append('category', categoryId))\n  const response = await fetch(`/api/marketplace/gigs?${params.toString()}`, {\n    credentials: 'same-origin',\n    signal,\n  })\n  const payload = await response.json().catch(() => ({}))\n  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load recommendations')\n  const data = payload?.data ?? payload\n  const gigs: RecommendedGig[] = Array.isArray(data?.gigs) ? data.gigs : []\n\n  return gigs.filter((gig) => isRelatedToAny(gig, categoryIds))\n}\n",
)
replace_once(
    carousel,
    "function mergeUnique(existing: RecommendedGig[], incoming: RecommendedGig[]): RecommendedGig[] {\n  const seen = new Set(existing.map((gig) => gig.id))\n  const merged = [...existing]\n  for (const gig of incoming) {\n    if (!gig?.id || seen.has(gig.id)) continue\n    seen.add(gig.id)\n    merged.push(gig)\n  }\n  return merged\n}\n",
    "function mergeUnique(existing: RecommendedGig[], incoming: RecommendedGig[]): RecommendedGig[] {\n  const seen = new Set(existing.map((gig) => gig.id))\n  const merged = [...existing]\n  for (const gig of incoming) {\n    if (!gig?.id || seen.has(gig.id)) continue\n    seen.add(gig.id)\n    merged.push(gig)\n  }\n  return merged\n}\n\nconst CATEGORY_AFFINITIES: Record<string, string[]> = {\n  immigration: ['education', 'legal', 'settlement', 'credentials'],\n  education: ['academic-writing', 'immigration', 'credentials', 'mentorship'],\n  'academic-writing': ['education', 'career', 'mentorship'],\n  legal: ['immigration', 'business', 'settlement'],\n  settlement: ['immigration', 'career', 'business'],\n  career: ['mentorship', 'credentials', 'education', 'academic-writing'],\n  business: ['legal', 'career', 'mentorship'],\n  credentials: ['education', 'career', 'immigration'],\n  mentorship: ['career', 'education', 'business'],\n}\n\nfunction getRelatedCategoryIds(categoryId: string, fallbackCategoryId?: string): string[] {\n  const parent = fallbackCategoryId\n    ? getCategoryById(fallbackCategoryId)\n    : getCategoryBySubcategoryId(categoryId) || getCategoryById(categoryId)\n  const parentId = parent?.id || fallbackCategoryId || categoryId\n  const siblings = parent\n    ? [...parent.subcategories]\n        .filter((subcategory) => subcategory.id !== categoryId)\n        .sort((a, b) => Number(b.popular) - Number(a.popular) || a.order - b.order)\n        .map((subcategory) => subcategory.id)\n    : []\n  const sameVertical = parent\n    ? CATEGORIES.filter((category) => category.id !== parentId && category.vertical === parent.vertical)\n        .sort((a, b) => Number(b.popular) - Number(a.popular) || a.order - b.order)\n        .map((category) => category.id)\n    : []\n  const affinities = CATEGORY_AFFINITIES[parentId] || []\n\n  return Array.from(new Set([...siblings, ...sameVertical, ...affinities]))\n    .filter((candidate) => candidate && candidate !== categoryId && candidate !== parentId)\n}\n",
)
replace_once(
    carousel,
    "    <Link href={`/marketplace/gigs/${gig.slug}`} className={styles.gigCard} aria-label={`View ${gig.title}`}>",
    "    <Link href={`/gigs/${gig.slug}`} className={styles.gigCard} aria-label={`View ${gig.title}`}>",
)
replace_once(
    carousel,
    "        let ranked = await requestGigs(categoryId, 'trending', controller.signal)\n        const fallback = fallbackCategoryId || categoryId\n\n        if (ranked.length < 8) {\n          ranked = mergeUnique(ranked, await requestGigs(fallback, 'best_rated', controller.signal))\n        }\n        if (ranked.length < 6) {\n          ranked = mergeUnique(ranked, await requestGigs(fallback, 'most_orders', controller.signal))\n        }\n\n        if (!controller.signal.aborted) setGigs(ranked.slice(0, TARGET_GIGS))",
    "        const exact = await requestGigs([categoryId], 'trending', controller.signal)\n        let ranked = exact.slice(0, 4)\n        const relatedCategoryIds = getRelatedCategoryIds(categoryId, fallbackCategoryId)\n\n        // Always reserve room for genuine alternatives. This keeps a narrow\n        // category such as University Admissions from becoming a two-card echo\n        // chamber when strong Graduate School, Scholarship, Essay/SOP or Test\n        // Prep services are available nearby in the taxonomy.\n        if (relatedCategoryIds.length > 0) {\n          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'trending', controller.signal))\n        }\n        if (ranked.length < 8 && relatedCategoryIds.length > 0) {\n          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'best_rated', controller.signal))\n        }\n        if (ranked.length < TARGET_GIGS && relatedCategoryIds.length > 0) {\n          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'most_orders', controller.signal))\n        }\n\n        ranked = mergeUnique(ranked, exact.slice(4))\n        const parentId = fallbackCategoryId || getCategoryBySubcategoryId(categoryId)?.id\n        if (ranked.length < TARGET_GIGS && parentId && parentId !== categoryId) {\n          ranked = mergeUnique(ranked, await requestGigs([parentId], 'most_orders', controller.signal))\n        }\n\n        if (!controller.signal.aborted) setGigs(ranked.slice(0, TARGET_GIGS))",
)
replace_once(
    carousel,
    "        <p className={styles.eyebrow}>Recommended for you</p>\n        <h2 id=\"ys-category-recommended-gigs-title\" className={styles.title}>\n          Recommended {displayName}\n        </h2>\n        <p className={styles.subtitle}>\n          Popular, well-reviewed services matched to what you are exploring.\n        </p>",
    "        <p className={styles.eyebrow}>Matched to your search</p>\n        <h2 id=\"ys-category-recommended-gigs-title\" className={styles.title}>\n          Recommended for you\n        </h2>\n        <p className={styles.subtitle}>\n          Top {displayName} picks plus closely related services worth comparing.\n        </p>",
)

# 2) Rebuild the buying-guidance disclosure so it is open by default, remains
#    collapsible, is visually quieter, and matches the hero-belt width.
page = 'app/marketplace/categories/[categoryId]/page.tsx'
replace_once(
    page,
    "import { getCategoryEditorial } from '@/lib/categoryEditorial'",
    "import { getCategoryEditorial } from '@/lib/categoryEditorial'\nimport guidanceStyles from './category-guidance.module.css'",
)
p = ROOT / page
text = p.read_text()
start = text.index('      <section\n        aria-label={`${displayName} buying guidance`}')
end_marker = '      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">\n        <CategoryRecommendedGigsCarousel'
end = text.index(end_marker, start)
new_guidance = '''      <section
        aria-label={`${displayName} buying guidance`}
        className={guidanceStyles.section}
      >
        <details open className={`${guidanceStyles.card} ys-category-guidance-card`}>
          <summary className={guidanceStyles.summary}>
            <span className={guidanceStyles.summaryCopy}>
              <span className={guidanceStyles.eyebrow}>Buying guide</span>
              <span className={guidanceStyles.summaryTitle}>Before you order: {displayName}</span>
              <span className={guidanceStyles.summaryHint}>
                Practical scope guidance, comparison points and next steps
              </span>
            </span>
            <span className={guidanceStyles.chevron} aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
            </span>
          </summary>

          <div className={`${guidanceStyles.body} ys-category-guidance-body`}>
            <div className={guidanceStyles.introGrid}>
              <div className={guidanceStyles.infoCard}>
                <h2>Choose the right scope</h2>
                <p>
                  YouSafe Marketplace lists fixed-price briefs from consultants and licensed attorneys. Compare scope, delivery time, and provider role before you request work. Marketplace orders are document-preparation and consulting engagements unless your contract states attorney representation.
                </p>
              </div>
              <div className={guidanceStyles.infoCard}>
                <h2>Self-serve or specialist?</h2>
                <p>
                  For free procedural reading — document order, refusal triggers and official-source links — use{' '}
                  <a href="https://legal.yousafeconsultancy.com/">MyCaseworks</a>.
                  {' '}Prefer a worksheet first? Browse{' '}
                  <Link href="/shop">preparation packs</Link>.
                </p>
              </div>
            </div>

            {editorial?.body && editorial.body.length > 0 && (
              <div className={guidanceStyles.copySection}>
                <h2>{displayName} guidance</h2>
                {editorial.body.map((para) => (
                  <p key={para.slice(0, 48)}>{para}</p>
                ))}
              </div>
            )}

            {editorial?.compare && editorial.compare.length > 0 && (
              <div className={guidanceStyles.copySection}>
                <h2>What to compare in {displayName}</h2>
                <ul>
                  {editorial.compare.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {editorial?.nextSteps && (
              <div className={guidanceStyles.nextStep}>
                <strong>Next step:</strong> {editorial.nextSteps}
              </div>
            )}

            {activeCount < 1 && (
              <p className={guidanceStyles.emptyNote}>
                No active services in this category right now. Browse{' '}
                <Link href="/categories">all categories</Link>, read free guides on{' '}
                <a href="https://legal.yousafeconsultancy.com/">MyCaseworks</a>, or check back soon.
              </p>
            )}
          </div>
        </details>
      </section>

'''
p.write_text(text[:start] + new_guidance + text[end:])
replace_once(
    page,
    '      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">\n        <CategoryRecommendedGigsCarousel',
    '      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 mt-8">\n        <CategoryRecommendedGigsCarousel',
)
replace_once(
    page,
    '      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pb-8">\n        <CaseworksReadMoreRail',
    '      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pb-8">\n        <CaseworksReadMoreRail',
)
replace_once(
    page,
    '          server-rendered below the listings inside a collapsed disclosure card. */}',
    '          server-rendered below the listings inside an open-by-default, collapsible guide. */}',
)

write('app/marketplace/categories/[categoryId]/category-guidance.module.css', r'''.section {
  width: min(calc(100% - 32px), 64rem);
  margin: 34px auto 0;
}

.card {
  overflow: hidden;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.10));
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
  color: var(--ys-ink, #0f172a);
  box-shadow: 0 18px 46px -38px rgba(15, 23, 42, 0.34);
}

.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 86px;
  padding: 18px 22px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.summary::-webkit-details-marker { display: none; }

.summaryCopy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.eyebrow {
  width: fit-content;
  color: var(--ys-inkSoft, #64748b);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summaryTitle {
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(19px, 2.1vw, 24px);
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.summaryHint {
  color: var(--ys-inkSoft, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.chevron {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.10));
  border-radius: 999px;
  background: #fff;
  transition: transform 180ms ease, background 180ms ease;
}

.chevron svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.card[open] .chevron { transform: rotate(180deg); }
.summary:hover .chevron { background: var(--ys-paper2, #f5f7f8); }

.body {
  padding: 20px 22px 24px;
  border-top: 1px solid var(--ys-ruleSoft, rgba(15, 23, 42, 0.07));
}

.introGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.infoCard {
  padding: 16px 17px;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.08));
  border-radius: 14px;
  background: linear-gradient(145deg, var(--ys-paper2, #f5f7f8), #fff);
}

.infoCard h2,
.copySection h2 {
  margin: 0 0 7px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.infoCard p,
.copySection p,
.copySection ul,
.emptyNote {
  margin: 0;
  color: var(--ys-inkMid, #334155);
  font-size: 14px;
  line-height: 1.65;
}

.infoCard a,
.copySection a,
.emptyNote a {
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.copySection {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--ys-ruleSoft, rgba(15, 23, 42, 0.07));
}

.copySection p + p { margin-top: 8px; }
.copySection ul { padding-left: 1.15rem; }
.copySection li + li { margin-top: 5px; }

.nextStep {
  margin-top: 18px;
  padding: 13px 15px;
  border: 1px solid rgba(51, 65, 85, 0.10);
  border-radius: 12px;
  background: rgba(51, 65, 85, 0.06);
  font-size: 14px;
  line-height: 1.6;
}

.emptyNote { margin-top: 18px; }

@media (max-width: 680px) {
  .section { width: min(calc(100% - 24px), 64rem); margin-top: 28px; }
  .summary { min-height: 78px; padding: 16px; }
  .body { padding: 16px; }
  .introGrid { grid-template-columns: 1fr; }
  .summaryHint { max-width: 29rem; }
}

@media (prefers-reduced-motion: reduce) {
  .chevron { transition: none; }
}
''')

# 3) Narrow MyCaseworks into a compact editorial companion below the dark belt.
write('components/marketplace/CaseworksReadMoreRail.module.css', r'''.rail {
  box-sizing: border-box;
  width: 100%;
  max-width: 64rem;
  margin: 24px auto 0;
  overflow: hidden;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.10));
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
  color: var(--ys-ink, #0f172a);
  box-shadow: 0 16px 44px -38px rgba(15, 23, 42, 0.32);
  font-family: var(--font-outfit), 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--ys-ruleSoft, rgba(15, 23, 42, 0.07));
  box-shadow: inset 0 3px 0 var(--ys-indigo, #111827);
}

.headingGroup { min-width: 0; }

.eyebrow {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 7px;
  color: var(--ys-inkSoft, #526072);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.eyebrowDot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: var(--ys-indigo, #111827);
}

.title {
  margin: 9px 0 0;
  color: var(--ys-ink, #0f172a);
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(20px, 2.4vw, 27px);
  font-weight: 650;
  line-height: 1.16;
  letter-spacing: -0.028em;
}

.description {
  max-width: 40rem;
  margin: 6px 0 0;
  color: var(--ys-inkSoft, #526072);
  font-size: 12px;
  line-height: 1.5;
}

.browse {
  display: inline-flex !important;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.12));
  border-radius: 999px;
  background: #fff;
  color: var(--ys-ink, #0f172a) !important;
  font-size: 12px;
  font-weight: 750;
  text-decoration: none !important;
  transition: transform 150ms ease, border-color 150ms ease;
}

.browse:hover { transform: translateY(-1px); border-color: var(--ys-inkSoft, #64748b); }
.browse:focus-visible,
.card:focus-visible { outline: 3px solid rgba(51, 65, 85, 0.24); outline-offset: 3px; }

.grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0 !important;
  padding: 14px !important;
  list-style: none !important;
}

.item { min-width: 0; margin: 0 !important; padding: 0 !important; list-style: none !important; }
.item::marker { content: ''; }

.card {
  position: relative;
  display: flex !important;
  min-height: 122px;
  height: 100%;
  flex-direction: column;
  padding: 14px 15px;
  overflow: hidden;
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, 0.10));
  border-radius: 14px;
  background: #fff !important;
  color: var(--ys-ink, #0f172a) !important;
  text-decoration: none !important;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: var(--ys-indigo, #111827);
}

.card:hover {
  transform: translateY(-2px);
  border-color: rgba(15, 23, 42, 0.20);
  box-shadow: 0 14px 28px -24px rgba(15, 23, 42, 0.35);
}

.cardHeader { display: flex; align-items: center; gap: 8px; }

.cardNumber {
  display: inline-grid;
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  place-items: center;
  border-radius: 8px;
  background: var(--ys-paper2, #eef1f3);
  color: var(--ys-ink, #0f172a);
  font-size: 9px;
  font-weight: 850;
}

.cardType {
  color: var(--ys-inkSoft, #526072);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.065em;
  text-transform: uppercase;
}

.cardTitle {
  margin: 11px 0 12px;
  color: var(--ys-ink, #0f172a);
  font-family: var(--font-display, Georgia, serif);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.28;
  letter-spacing: -0.012em;
  overflow-wrap: anywhere;
}

.cardFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 9px;
  border-top: 1px solid var(--ys-ruleSoft, rgba(15, 23, 42, 0.07));
}

.readLabel { color: var(--ys-indigo, #111827); font-size: 11px; font-weight: 800; }
.arrow { width: 16px; height: 16px; flex: 0 0 16px; color: currentColor; }
.item:only-child { grid-column: 1 / -1; }

@media (max-width: 680px) {
  .rail { border-radius: 16px; margin-top: 20px; }
  .header { align-items: flex-start; flex-direction: column; gap: 12px; padding: 17px 16px 14px; }
  .grid { grid-template-columns: 1fr; padding: 12px !important; }
  .card { min-height: 112px; }
}

@media (prefers-reduced-motion: reduce) {
  .browse, .card { transition: none; }
  .browse:hover, .card:hover { transform: none; }
}
''')

# 4) Create a human-readable Marketplace sitemap and link it from the footer.
write('app/sitemap/page.tsx', r'''import type { Metadata } from 'next'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import styles from './sitemap-page.module.css'

const MARKET = 'https://market.yousafeconsultancy.com'

export const metadata: Metadata = {
  title: 'Marketplace Sitemap | YouSafe',
  description: 'Browse the public YouSafe Marketplace, categories, providers, shop and preparation packs from one clean directory.',
  alternates: { canonical: `${MARKET}/sitemap/` },
  robots: { index: true, follow: true },
}

const primary = [
  { href: '/', label: 'Marketplace home', copy: 'Discover fixed-price professional services and current recommendations.' },
  { href: '/categories', label: 'All categories', copy: 'Browse the Marketplace service taxonomy by need.' },
  { href: '/providers', label: 'Providers', copy: 'Compare public attorney and consultant profiles.' },
  { href: '/shop', label: 'File shop', copy: 'Browse instant-download tools and preparation packs.' },
]

export default function MarketplaceSitemapPage() {
  const packs = IMMIGRATION_SHOP_PRODUCTS.filter((product) => product.payhip_published)

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>YouSafe Marketplace</p>
        <h1>Marketplace sitemap</h1>
        <p>Clean public routes for services, providers, categories and the file shop.</p>
        <a className={styles.xml} href="/sitemap.xml">View technical XML sitemap</a>
      </header>

      <section className={styles.section} aria-labelledby="marketplace-links">
        <h2 id="marketplace-links">Explore Marketplace</h2>
        <div className={styles.primaryGrid}>
          {primary.map((item) => (
            <Link key={item.href} href={item.href} className={styles.primaryCard}>
              <strong>{item.label}</strong>
              <span>{item.copy}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="category-links">
        <h2 id="category-links">Service categories</h2>
        <div className={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <article key={category.id} className={styles.categoryCard}>
              <Link href={`/categories/${category.id}`} className={styles.categoryTitle}>{category.name}</Link>
              <div className={styles.subcategories}>
                {category.subcategories.map((subcategory) => (
                  <Link key={subcategory.id} href={`/categories/${subcategory.id}`}>{subcategory.name}</Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="shop-links">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="shop-links">Immigration preparation packs</h2>
            <p>Canonical shop pages with Payhip checkout.</p>
          </div>
          <Link href="/shop">Browse all shop files</Link>
        </div>
        <div className={styles.packGrid}>
          {packs.map((product) => (
            <Link key={product.slug} href={`/shop/${product.slug}`}>{product.name}</Link>
          ))}
        </div>
      </section>
    </main>
  )
}
''')

write('app/sitemap/sitemap-page.module.css', r'''.page {
  width: min(calc(100% - 32px), 72rem);
  margin: 0 auto;
  padding: 44px 0 72px;
  color: var(--ys-ink, #0f172a);
  font-family: var(--font-outfit), 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.hero {
  padding: clamp(26px, 5vw, 44px);
  border: 1px solid var(--ys-rule, rgba(15, 23, 42, .10));
  border-radius: 22px;
  background: linear-gradient(145deg, #f6f8f9, #fff);
}

.eyebrow { margin: 0 0 8px; color: #526072; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.hero h1 { margin: 0; font-family: var(--font-display, Georgia, serif); font-size: clamp(32px, 5vw, 48px); font-weight: 650; letter-spacing: -.035em; }
.hero p { max-width: 44rem; margin: 12px 0 0; color: #526072; font-size: 15px; line-height: 1.6; }
.xml { display: inline-flex; margin-top: 18px; color: inherit; font-size: 13px; font-weight: 800; text-underline-offset: 3px; }

.section { margin-top: 38px; }
.section > h2, .sectionHeading h2 { margin: 0 0 14px; font-family: var(--font-display, Georgia, serif); font-size: 24px; font-weight: 650; letter-spacing: -.02em; }
.primaryGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.primaryCard { display: flex; min-height: 118px; flex-direction: column; gap: 7px; padding: 16px; border: 1px solid rgba(15,23,42,.10); border-radius: 14px; color: inherit; text-decoration: none; }
.primaryCard strong { font-size: 14px; }
.primaryCard span { color: #64748b; font-size: 12px; line-height: 1.5; }

.categoryGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.categoryCard { padding: 17px; border: 1px solid rgba(15,23,42,.09); border-radius: 14px; background: #fff; }
.categoryTitle { color: inherit; font-family: var(--font-display, Georgia, serif); font-size: 17px; font-weight: 650; text-decoration: none; }
.subcategories { display: flex; flex-wrap: wrap; gap: 7px 10px; margin-top: 12px; }
.subcategories a { color: #526072; font-size: 12px; text-underline-offset: 3px; }

.sectionHeading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.sectionHeading h2 { margin-bottom: 4px; }
.sectionHeading p { margin: 0; color: #64748b; font-size: 12px; }
.sectionHeading > a { color: inherit; font-size: 12px; font-weight: 800; white-space: nowrap; }
.packGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 20px; border-top: 1px solid rgba(15,23,42,.08); }
.packGrid a { padding: 12px 2px; border-bottom: 1px solid rgba(15,23,42,.08); color: #334155; font-size: 13px; line-height: 1.45; text-decoration: none; }
.packGrid a:hover, .primaryCard:hover, .categoryTitle:hover { text-decoration: underline; text-underline-offset: 3px; }

@media (max-width: 900px) { .primaryGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } .categoryGrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 600px) { .page { width: min(calc(100% - 24px), 72rem); padding-top: 28px; } .primaryGrid, .categoryGrid, .packGrid { grid-template-columns: 1fr; } .sectionHeading { align-items: flex-start; flex-direction: column; gap: 8px; } }
''')

footer = 'components/marketplace/MarketplaceFooter.tsx'
replace_once(footer, "  { label: 'Marketplace', href: '/marketplace' },", "  { label: 'Marketplace', href: '/' },")
replace_once(footer, "  { label: 'Categories', href: '/marketplace/categories' },", "  { label: 'Categories', href: '/categories' },")
replace_once(footer, "  { label: 'Help', href: '/marketplace#faq' },", "  { label: 'Help', href: '/#faq' },")
replace_once(footer, "  { label: 'Sitemap', href: '/sitemap.xml' },", "  { label: 'Sitemap', href: '/sitemap/' },")
replace_once(footer, '<a className="cw-mkt-footer-brand" href="/marketplace">', '<a className="cw-mkt-footer-brand" href="/">')

middleware = 'middleware.ts'
replace_once(middleware, "  '/sitemap.xml',\n])", "  '/sitemap.xml',\n  '/sitemap(.*)',\n])")
replace_once(
    middleware,
    "    // ── Strip tracking params (301) ─────────────────────────────────────",
    "    // Human-readable Marketplace sitemap. Return before the market-host\n    // clean-path rewrite so /sitemap and /sitemap/ are owned by this route,\n    // while portal never exposes a duplicate sitemap directory.\n    if (pathname === '/sitemap' || pathname === '/sitemap/') {\n      if (hostname !== MARKET_HOST) {\n        return new NextResponse('Not Found', {\n          status: 404,\n          headers: { 'cache-control': 'private, no-store' },\n        })\n      }\n      if (pathname === '/sitemap/') {\n        const target = req.nextUrl.clone()\n        target.pathname = '/sitemap'\n        return withCorsHeaders(withPathHeaders(NextResponse.rewrite(target), pathname, search, lang), req)\n      }\n      return withCorsHeaders(withPathHeaders(NextResponse.next(), pathname, search, lang), req)\n    }\n\n    // ── Strip tracking params (301) ─────────────────────────────────────",
)

# 5) Update regression coverage for the new sitemap + recommendation/guidance contracts.
write('tests/marketplace-sitemap-footer.test.ts', r'''import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const sitemap = read('app/sitemap.ts')
const sitemapPage = read('app/sitemap/page.tsx')
const middleware = read('middleware.ts')
const footer = read('components/marketplace/MarketplaceFooter.tsx')

describe('Marketplace sitemap discoverability', () => {
  test('serves the technical public sitemap from the market host only', () => {
    expect(sitemap).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(sitemap).toContain("const base = `https://${MARKET_HOST}`")
    expect(middleware).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(middleware).toContain("if (pathname === '/sitemap.xml' || pathname === '/sitemap.xml/')")
    expect(middleware).toContain('if (hostname !== MARKET_HOST)')
  })

  test('exposes a human-readable market-only sitemap at /sitemap and /sitemap/', () => {
    expect(sitemapPage).toContain("canonical: `${MARKET}/sitemap/`")
    expect(sitemapPage).toContain('href="/sitemap.xml"')
    expect(sitemapPage).toContain('Service categories')
    expect(sitemapPage).toContain('Immigration preparation packs')
    expect(middleware).toContain("pathname === '/sitemap' || pathname === '/sitemap/'")
    expect(middleware).toContain("target.pathname = '/sitemap'")
  })

  test('links the human sitemap from clean Marketplace footer routes', () => {
    expect(footer).toContain("{ label: 'Marketplace', href: '/' }")
    expect(footer).toContain("{ label: 'Categories', href: '/categories' }")
    expect(footer).toContain("{ label: 'Sitemap', href: '/sitemap/' }")
    expect(footer).not.toContain("href: '/marketplace/categories'")
    expect(footer).toContain('NAV_LINKS.map')
  })
})
''')

write('tests/marketplace-category-mobile-format.test.ts', r'''import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(
  path.join(root, 'app/marketplace/categories/[categoryId]/page.tsx'),
  'utf8',
)
const guidanceCss = fs.readFileSync(
  path.join(root, 'app/marketplace/categories/[categoryId]/category-guidance.module.css'),
  'utf8',
)

describe('marketplace category mobile formatting', () => {
  it('keeps the first screen concise and conversion-led', () => {
    expect(source).toContain('className="ys-category-hero"')
    expect(source).toContain('YouSafe Marketplace')
    expect(source).toContain('active service')
  })

  it('renders real service discovery before the long-form buying guidance', () => {
    const discovery = source.indexOf('<GigDiscoveryPage categoryId={filterId}')
    const guidance = source.indexOf('aria-label={`${displayName} buying guidance`}')
    expect(discovery).toBeGreaterThan(-1)
    expect(guidance).toBeGreaterThan(-1)
    expect(discovery).toBeLessThan(guidance)
  })

  it('keeps buying guidance expanded by default while preserving collapse control', () => {
    expect(source).toContain('<details open')
    expect(source).toContain('ys-category-guidance-card')
    expect(source).toContain('<summary')
    expect(source).toContain('Before you order')
    expect(source).toContain('Choose the right scope')
    expect(source).toContain('Self-serve or specialist?')
    expect(source).toContain('{displayName} guidance</h2>')
    expect(source).toContain('<Link href="/shop">preparation packs</Link>')
    expect(guidanceCss).toContain('width: min(calc(100% - 32px), 64rem)')
    expect(guidanceCss).toContain('.card[open] .chevron')
  })
})
''')

# Keep the existing wide regression suite but update the one implementation
# detail it asserts now that requestGigs takes a list of related categories.
replace_once(
    'tests/marketplace-category-clean-url-and-cards.test.ts',
    "    expect(categoryCarousel).toContain(\"requestGigs(categoryId, 'trending'\")",
    "    expect(categoryCarousel).toContain(\"requestGigs([categoryId], 'trending'\")\n    expect(categoryCarousel).toContain('getRelatedCategoryIds')\n    expect(categoryCarousel).toContain('CATEGORY_AFFINITIES')",
)

write('tests/marketplace-category-related-recommendations.test.ts', r'''import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/marketplace/CategoryRecommendedGigsCarousel.tsx'),
  'utf8',
)
const editorialCss = fs.readFileSync(
  path.join(process.cwd(), 'components/marketplace/CaseworksReadMoreRail.module.css'),
  'utf8',
)

describe('category recommendation diversity and editorial cohesion', () => {
  test('reserves room for sibling and adjacent service families rather than echoing only the selected filter', () => {
    expect(source).toContain('const CATEGORY_AFFINITIES')
    expect(source).toContain('function getRelatedCategoryIds')
    expect(source).toContain('parent.subcategories')
    expect(source).toContain('category.vertical === parent.vertical')
    expect(source).toContain('const exact = await requestGigs([categoryId]')
    expect(source).toContain('let ranked = exact.slice(0, 4)')
    expect(source).toContain("requestGigs(relatedCategoryIds.slice(0, 8), 'trending'")
    expect(source).toContain("education: ['academic-writing', 'immigration', 'credentials', 'mentorship']")
  })

  test('keeps recommendations on clean market-host gig paths', () => {
    expect(source).toContain('href={`/gigs/${gig.slug}`}')
    expect(source).not.toContain('href={`/marketplace/gigs/${gig.slug}`}')
  })

  test('keeps MyCaseworks visually narrower than the broad discovery canvas', () => {
    expect(editorialCss).toContain('max-width: 64rem')
    expect(editorialCss).toContain('min-height: 122px')
    expect(editorialCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })
})
''')

print('Marketplace finalization patch applied successfully.')
