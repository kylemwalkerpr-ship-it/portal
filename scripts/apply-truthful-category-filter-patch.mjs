#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function replaceExact(file, from, to) {
  const full = path.join(root, file)
  const source = fs.readFileSync(full, 'utf8')
  if (!source.includes(from)) {
    if (source.includes(to)) return false
    throw new Error(`Patch anchor not found in ${file}: ${from.slice(0, 120)}`)
  }
  fs.writeFileSync(full, source.replace(from, to))
  return true
}

let changed = 0

changed += Number(replaceExact(
  'lib/categories.ts',
  `/**\n * Build a PostgREST \`.or()\` filter string that matches a gig's \`category\`\n * column against every taxonomy term of the selected categories AND also\n * matches NULL categories.\n *\n * Why: PostgREST \`category.in.(...)\` never matches NULL, so any active gig\n * whose \`category\` is unset (or a legacy string outside the taxonomy) was\n * silently dropped from every category-filtered surface — the AllGigsDrawer\n * (which always sends category params), category pages, and filtered\n * discovery — even though admin counts them as live inventory.\n *\n * Returns null when no terms resolve (caller should skip the filter).\n */`,
  `/**\n * Build a PostgREST \`.or()\` filter string that matches a gig's \`category\`\n * column against the taxonomy terms owned by the selected categories.\n *\n * Category-filtered public surfaces must be truthful: an uncategorized gig\n * cannot belong simultaneously to Immigration, Education, Legal, Career, etc.\n * Untagged legacy inventory remains visible on the unfiltered Marketplace and\n * should be repaired by the taxonomy backfill, not injected into every shelf.\n *\n * Returns null when no terms resolve (caller should skip the filter).\n */`,
))

changed += Number(replaceExact(
  'lib/categories.ts',
  '  return `category.is.null,category.in.(${inList})`',
  '  return `category.in.(${inList})`',
))

changed += Number(replaceExact(
  'app/api/marketplace/gigs/route.ts',
  `  if (categories.length > 0) {\n    // OR-filter (not a plain \`in\`) so uncategorized gigs (category IS NULL)\n    // stay visible: PostgREST \`in\` never matches NULL, which silently hid\n    // active inventory from every category-filtered surface.\n    const categoryOr = buildCategoryOrFilter(categories)\n    if (categoryOr) query = query.or(categoryOr)\n  }`,
  `  if (categories.length > 0) {\n    // Category shelves are strict ranking/discovery surfaces. Uncategorized\n    // legacy gigs remain available in the unfiltered Marketplace, but must not\n    // be injected into every category and inflate unrelated service counts.\n    const categoryOr = buildCategoryOrFilter(categories)\n    if (categoryOr) query = query.or(categoryOr)\n  }`,
))

changed += Number(replaceExact(
  'lib/marketplaceFacets.ts',
  ` * Counting contract (identical to the listing API):\n *  - jurisdiction counts use jurisdictionCountryOrFilter(): exact matches\n *    plus NULL/invalid-jurisdiction gigs, so a country-tab badge always\n *    equals what that tab lists.\n *  - category counts use buildCategoryOrFilter(): taxonomy term match plus\n *    NULL categories, so a category chip always equals that category's\n *    listing size.`,
  ` * Counting contract (identical to the listing API):\n *  - jurisdiction counts use jurisdictionCountryOrFilter(): exact matches\n *    plus NULL/invalid-jurisdiction gigs, so a country-tab badge always\n *    equals what that tab lists.\n *  - category counts use buildCategoryOrFilter(): taxonomy membership only.\n *    Uncategorized legacy gigs remain in the unfiltered total, never in every\n *    category count.`,
))

changed += Number(replaceExact(
  'tests/marketplace-gigs-search.test.ts',
  `  it('category filters OR in NULL categories — uncategorized active gigs stay visible', async () => {\n    // Regression: a plain \`category.in.(…)\` never matches NULL, so every\n    // active gig with an unset/out-of-taxonomy category silently vanished\n    // from the AllGigsDrawer, category pages, and filtered discovery even\n    // though admin counted them as live inventory.\n    const res = await request(jsonServer(GET)).get('/api/marketplace/gigs?category=immigration&limit=20')\n    expect(res.status).toBe(200)\n    expect(lastQuery.orCalls).toHaveLength(1)\n    const filter = lastQuery.orCalls[0]\n    expect(filter).toContain('category.is.null')\n    expect(filter).toContain('category.in.(')\n    // Taxonomy terms survive — quoted values with spaces, no FTS leaking in.\n    expect(filter).toContain('"Immigration Services"')\n    expect(filter).not.toContain('.fts.')\n  })`,
  `  it('category filters require real taxonomy membership — uncategorized gigs do not leak into every shelf', async () => {\n    // Uncategorized inventory remains visible when no category is selected,\n    // but a category URL/count must represent only that taxonomy.\n    const res = await request(jsonServer(GET)).get('/api/marketplace/gigs?category=immigration&limit=20')\n    expect(res.status).toBe(200)\n    expect(lastQuery.orCalls).toHaveLength(1)\n    const filter = lastQuery.orCalls[0]\n    expect(filter).not.toContain('category.is.null')\n    expect(filter).toContain('category.in.(')\n    // Taxonomy terms survive — quoted values with spaces, no FTS leaking in.\n    expect(filter).toContain('"Immigration Services"')\n    expect(filter).not.toContain('.fts.')\n  })`,
))

changed += Number(replaceExact(
  'tests/marketplace-facets.test.ts',
  ` *       - jurisdiction counts use jurisdictionCountryOrFilter (OR'd, NULL-inclusive)\n *       - category counts use buildCategoryOrFilter (OR'd, NULL-inclusive)`,
  ` *       - jurisdiction counts use jurisdictionCountryOrFilter (OR'd, NULL-inclusive)\n *       - category counts use buildCategoryOrFilter (strict taxonomy membership)`,
))

// Add an explicit facet regression beside the jurisdiction contract.
changed += Number(replaceExact(
  'tests/marketplace-facets.test.ts',
  `  test('jurisdiction counts carry the NULL-inclusive OR filter', async () => {`,
  `  test('category counts never include uncategorized inventory', async () => {\n    const seen: string[] = []\n    const db = fakeDb({ onOrFilter: (or) => (seen.push(or), 5) })\n    await computeFacetCounts(db)\n    const categoryFilters = seen.filter((filter) => filter.includes('category.in.('))\n    expect(categoryFilters.length).toBe(CATEGORIES.length)\n    for (const filter of categoryFilters) expect(filter).not.toContain('category.is.null')\n  })\n\n  test('jurisdiction counts carry the NULL-inclusive OR filter', async () => {`,
))

console.log(`Applied truthful Marketplace category membership patch (${changed} replacements).`)
