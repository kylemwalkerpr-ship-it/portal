import fs from 'node:fs'

const file = 'lib/seoFactory/crossDomainEnrich.ts'
let source = fs.readFileSync(file, 'utf8')

if (source.includes('export function isUniversityEntityCompatible(')) {
  console.log('Entity consistency guard already present; nothing to patch.')
  process.exit(0)
}

const helperAnchor = `/**
 * Build a cross-domain enrichment brief for a single source page.
 * Computes link recommendations weighted by relevance, domain adjacency,
 * cornerstone priority, and link freshness.
 */`

const helper = `const UNIVERSITY_ENTITY_PATTERNS = [
  /\\bUniversity of\\s+[A-Z][A-Za-z&.'’\\-]*(?:\\s+(?:of|the|and|at|in|for|[A-Z][A-Za-z&.'’\\-]*)){0,6}/g,
  /\\b[A-Z][A-Za-z&.'’\\-]*(?:\\s+(?:of|the|and|at|in|for|[A-Z][A-Za-z&.'’\\-]*)){0,5}\\s+University\\b/g,
]

function normalizeUniversityEntity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the\\s+/, '')
    .trim()
}

function universityIdentityText(page: SiteHealthPage): string {
  const content = (page as any).content || ''
  const h1 = content.match(/^#\\s+(.+)$/m)?.[1] || ''
  return \`\${page.title || ''}\\n\${h1}\`
}

export function extractUniversityEntities(page: SiteHealthPage): string[] {
  const identity = universityIdentityText(page)
  const matches: string[] = []

  for (const pattern of UNIVERSITY_ENTITY_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of identity.matchAll(pattern)) {
      const normalized = normalizeUniversityEntity(match[0])
      if (normalized) matches.push(normalized)
    }
  }

  return [...new Set(matches)]
}

function isExplicitUniversityComparison(page: SiteHealthPage): boolean {
  return /\\b(?:vs\\.?|versus|compare|comparison)\\b/i.test(universityIdentityText(page))
}

/**
 * Protect entity-specific university pages from semantic-neighbour pollution.
 * Generic resources remain eligible; only a target that names a different
 * university is rejected. Explicit comparison pages are allowed to cross-link.
 */
export function isUniversityEntityCompatible(
  sourcePage: SiteHealthPage,
  targetPage: SiteHealthPage,
): boolean {
  if (!/\\/universit(?:y|ies)\\//i.test(sourcePage.url)) return true
  if (isExplicitUniversityComparison(sourcePage)) return true

  const sourceEntities = extractUniversityEntities(sourcePage)
  const targetEntities = extractUniversityEntities(targetPage)

  if (!sourceEntities.length || !targetEntities.length) return true
  return targetEntities.some((target) => sourceEntities.includes(target))
}

`

if (!source.includes(helperAnchor)) {
  throw new Error('Could not find enrichment helper insertion anchor')
}
source = source.replace(helperAnchor, helper + helperAnchor)

const loopAnchor = `  for (const target of allPages) {
    if (target.url === sourcePage.url) continue

    const targetVector = extractKeywordVector((target as any).content || '')`

const guardedLoop = `  for (const target of allPages) {
    if (target.url === sourcePage.url) continue
    if (!isUniversityEntityCompatible(sourcePage, target)) continue

    const targetVector = extractKeywordVector((target as any).content || '')`

if (!source.includes(loopAnchor)) {
  throw new Error('Could not find enrichment candidate-loop anchor')
}
source = source.replace(loopAnchor, guardedLoop)

fs.writeFileSync(file, source)
console.log('Applied university entity consistency guard to crossDomainEnrich.ts')
