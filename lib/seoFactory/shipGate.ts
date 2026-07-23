/**
 * Hard gates for Content Studio / SEO Factory ships.
 *
 * Portal may only push articles & blogs that match the estate contract:
 *   host subdomain ↔ GitHub repo ↔ file path ↔ content type ↔ format
 *
 * Source of truth: ownership registry + HOST_REPO / HOST_PUBLIC tables.
 */

import {
  HOST_PUBLIC,
  HOST_REPO,
  hostFromUrl,
  type ContentRepo,
  type OwnerHost,
  type OwnerPlan,
} from './ownership'

export type ShipContentKind =
  | 'legal_guide'
  | 'article'
  | 'blog_summary'
  | 'blog_post'
  | 'regional_page'
  | 'regional_from'
  | 'regional_university'
  | 'marketplace_gig'
  | 'unknown'

export interface ShipGateResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** Normalized content kind after mapping aliases */
  kind: ShipContentKind
  host: OwnerHost
  repo: ContentRepo
  filePath: string
  canonicalUrl: string
}

/** Which content kinds may ship to which host. */
export const HOST_ALLOWED_KINDS: Record<OwnerHost, ShipContentKind[]> = {
  legal: ['legal_guide', 'article', 'blog_summary', 'blog_post'],
  usa: ['regional_page', 'regional_from', 'regional_university', 'blog_summary', 'blog_post'],
  uk: ['regional_page', 'regional_from', 'regional_university', 'blog_summary', 'blog_post'],
  ca: ['regional_page', 'regional_from', 'regional_university', 'blog_summary', 'blog_post'],
  au: ['regional_page', 'regional_from', 'regional_university', 'blog_summary', 'blog_post'],
  apex: ['regional_page', 'blog_summary', 'blog_post'],
  market: ['marketplace_gig'],
}

/** File path patterns required per host (any match is OK). */
export const HOST_PATH_PATTERNS: Record<OwnerHost, RegExp[]> = {
  legal: [
    /^app\/(us|uk|ca|au)\/[a-z0-9][a-z0-9-/]*\/page\.tsx$/,
    /^app\/blog\/[a-z0-9][a-z0-9-]*\/page\.tsx$/,
    /^app\/(us|uk|ca)\/(student-visas|immigration|tenancy|express-entry|family|loans)\/[a-z0-9][a-z0-9-/]*\/page\.tsx$/,
  ],
  usa: [
    /^usa\/content\/from\/[a-z0-9][a-z0-9-]*\.md$/,
    /^usa\/content\/universities\/[a-z0-9][a-z0-9-]*\.md$/,
    /^usa\/content\/blog\/[a-z0-9][a-z0-9-]*\.md$/,
    /^usa\/content\/[a-z0-9][a-z0-9/-]*\.md$/,
  ],
  uk: [
    /^uk\/content\/from\/[a-z0-9][a-z0-9-]*\.md$/,
    /^uk\/content\/universities\/[a-z0-9][a-z0-9-]*\.md$/,
    /^uk\/content\/blog\/[a-z0-9][a-z0-9-]*\.md$/,
    /^uk\/content\/[a-z0-9][a-z0-9/-]*\.md$/,
  ],
  ca: [
    /^ca\/content\/from\/[a-z0-9][a-z0-9-]*\.md$/,
    /^ca\/content\/universities\/[a-z0-9][a-z0-9-]*\.md$/,
    /^ca\/content\/blog\/[a-z0-9][a-z0-9-]*\.md$/,
    /^ca\/content\/[a-z0-9][a-z0-9/-]*\.md$/,
  ],
  au: [
    /^au\/content\/from\/[a-z0-9][a-z0-9-]*\.md$/,
    /^au\/content\/universities\/[a-z0-9][a-z0-9-]*\.md$/,
    /^au\/content\/blog\/[a-z0-9][a-z0-9-]*\.md$/,
    /^au\/content\/[a-z0-9][a-z0-9/-]*\.md$/,
  ],
  apex: [
    /^landing-page\/content\/blog\/[a-z0-9][a-z0-9-]*\.md$/,
    /^landing-page\/content\/[a-z0-9][a-z0-9/-]*\.md$/,
  ],
  market: [
    /^catalogue\/[a-z0-9][a-z0-9-]*\.mdx$/,
    /^catalogue\/categories\/[a-z0-9][a-z0-9-]*\.mdx$/,
  ],
}

/** Content-type → required path fragment hints (soft, added as warnings or errors). */
const KIND_PATH_HINTS: Partial<Record<ShipContentKind, RegExp>> = {
  regional_from: /\/content\/from\//,
  regional_university: /\/content\/universities\//,
  blog_summary: /\/(blog|content\/blog)\//,
  blog_post: /\/(blog|content\/blog)\//,
  marketplace_gig: /^catalogue\//,
  legal_guide: /^app\//,
  article: /^app\//,
}

export function normalizeContentKind(contentType: string): ShipContentKind {
  const t = (contentType || '').toLowerCase().trim()
  if (t === 'article' || t === 'legal_guide') return t === 'article' ? 'article' : 'legal_guide'
  if (t === 'blog_post' || t === 'blog_summary') return t as ShipContentKind
  if (t === 'regional_page' || t === 'regional_from' || t === 'regional_university') {
    return t as ShipContentKind
  }
  if (t === 'marketplace_gig') return 'marketplace_gig'
  // DB may store "article" for legal guides already
  if (t === 'blog') return 'blog_summary'
  return 'unknown'
}

function pathMatchesHost(host: OwnerHost, filePath: string): boolean {
  const patterns = HOST_PATH_PATTERNS[host] || []
  const p = filePath.replace(/^\/+/, '')
  return patterns.some((re) => re.test(p))
}

/**
 * Validate plan + content type + path + canonical subdomain before any Git write.
 */
export function validateShipPlan(opts: {
  plan: OwnerPlan
  contentType: string
  title?: string
  primaryKeyword?: string
}): ShipGateResult {
  const errors: string[] = []
  const warnings: string[] = []
  const plan = opts.plan
  const kind = normalizeContentKind(opts.contentType)
  const host = plan.host
  const repo = plan.repo
  const filePath = (plan.filePath || '').replace(/^\/+/, '')
  const canonicalUrl = plan.canonicalUrl || ''

  // ── Host ↔ repo ──────────────────────────────────────────────────────────
  const expectedRepo = HOST_REPO[host]
  if (!expectedRepo) {
    errors.push(`Unknown owner host "${host}" — not in estate table`)
  } else if (repo !== expectedRepo) {
    errors.push(
      `Host/repo mismatch: host=${host} must ship to ${expectedRepo}, got ${repo}`,
    )
  }

  // ── Ownership blockers ───────────────────────────────────────────────────
  for (const b of plan.blockers || []) {
    errors.push(`Ownership blocker: ${b}`)
  }

  // ── Content kind allowed on this subdomain ───────────────────────────────
  if (kind === 'unknown') {
    errors.push(
      `Unsupported content type "${opts.contentType}" for estate ships. ` +
        `Use legal_guide, blog_summary, regional_from, regional_university, regional_page, or marketplace_gig.`,
    )
  } else {
    const allowed = HOST_ALLOWED_KINDS[host] || []
    if (!allowed.includes(kind)) {
      errors.push(
        `Content type "${kind}" is not allowed on host "${host}" (${HOST_PUBLIC[host]}). ` +
          `Allowed: ${allowed.join(', ')}. ` +
          `Example: procedural/YMYL guides → legal; from-country pages → usa|uk|ca|au; gigs → market.`,
      )
    }
  }

  // ── File path format ─────────────────────────────────────────────────────
  if (!filePath) {
    errors.push('Missing filePath on ownership plan')
  } else if (!pathMatchesHost(host, filePath)) {
    errors.push(
      `File path "${filePath}" does not match ${host} subdomain layout. ` +
        `Expected patterns like: ${describePathExamples(host)}`,
    )
  }

  // Kind-specific path fragment
  const kindRe = KIND_PATH_HINTS[kind]
  if (kindRe && filePath && !kindRe.test(filePath) && kind !== 'regional_page') {
    // regional_page is flexible under content/
    if (kind === 'blog_summary' || kind === 'blog_post') {
      // legal blogs: app/blog/… ; regional: {host}/content/blog/…
      if (host === 'legal' && !/^app\/blog\//.test(filePath)) {
        errors.push(
          `Blog content on legal must use app/blog/{slug}/page.tsx (got ${filePath})`,
        )
      } else if (host !== 'legal' && !/\/content\/blog\//.test(filePath)) {
        errors.push(
          `Blog content on ${host} must use {region}/content/blog/{slug}.md (got ${filePath})`,
        )
      }
    } else if (kind === 'regional_from' && !/\/content\/from\//.test(filePath)) {
      errors.push(`regional_from must write under content/from/ (got ${filePath})`)
    } else if (kind === 'regional_university' && !/\/content\/universities\//.test(filePath)) {
      errors.push(`regional_university must write under content/universities/ (got ${filePath})`)
    } else if (kind === 'marketplace_gig' && !/^catalogue\//.test(filePath)) {
      errors.push(`marketplace_gig must write under catalogue/*.mdx (got ${filePath})`)
    }
  }

  // ── Canonical URL must match subdomain ───────────────────────────────────
  if (!canonicalUrl) {
    errors.push('Missing canonicalUrl')
  } else {
    const canonHost = hostFromUrl(canonicalUrl)
    if (!canonHost) {
      errors.push(
        `Canonical URL host is not an estate subdomain: ${canonicalUrl}. ` +
          `Must be legal|usa|uk|ca|au|apex|market.yousafeconsultancy.com`,
      )
    } else if (canonHost !== host) {
      errors.push(
        `Canonical host (${canonHost}) does not match owner host (${host}). ` +
          `Canonical: ${canonicalUrl} · expected base ${HOST_PUBLIC[host]}`,
      )
    }
    // Path on URL should roughly match file path (soft for legal deep trees)
    try {
      const u = new URL(canonicalUrl)
      if (u.protocol !== 'https:') {
        errors.push(`Canonical must be https: ${canonicalUrl}`)
      }
      if (!u.hostname.endsWith('yousafeconsultancy.com') && u.hostname !== 'yousafeconsultancy.com') {
        errors.push(`Canonical hostname outside yousafeconsultancy.com: ${u.hostname}`)
      }
    } catch {
      errors.push(`Invalid canonical URL: ${canonicalUrl}`)
    }
  }

  // ── Extension / format by repo ───────────────────────────────────────────
  if (repo === 'caseworks' && filePath && !filePath.endsWith('page.tsx')) {
    errors.push(`caseworks ships must be Next.js page.tsx files (got ${filePath})`)
  }
  if (repo === 'yousafe-consultancy' && filePath && !filePath.endsWith('.md')) {
    errors.push(`yousafe-consultancy ships must be Markdown .md files (got ${filePath})`)
  }
  if (repo === 'portal' && filePath && !filePath.endsWith('.mdx')) {
    errors.push(`portal/market ships must be .mdx catalogue files (got ${filePath})`)
  }

  // ── Dangerous path segments ──────────────────────────────────────────────
  if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
    errors.push(`Unsafe file path: ${filePath}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    kind,
    host,
    repo,
    filePath,
    canonicalUrl,
  }
}

/**
 * Validate rendered file content format before Git commit.
 */
export function validateRenderedPayload(opts: {
  plan: OwnerPlan
  filePath: string
  fileContent: string
  contentType: string
}): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const { plan, filePath, fileContent } = opts
  const content = fileContent || ''

  if (!content.trim()) {
    errors.push('Rendered file content is empty')
    return { ok: false, errors }
  }

  if (plan.repo === 'caseworks' || filePath.endsWith('page.tsx')) {
    // Must be a valid caseworks ArticleLayout page with correct CTAPanel contract
    if (!content.includes('from "@/components/article/ArticleLayout"') &&
        !content.includes("from '@/components/article/ArticleLayout'")) {
      errors.push('caseworks page must import ArticleLayout from @/components/article/ArticleLayout')
    }
    if (
      !content.includes('from "@/components/article/CTAPanel"') &&
      !content.includes("from '@/components/article/CTAPanel'")
    ) {
      errors.push('caseworks page must import CTAPanel from @/components/article/CTAPanel')
    }
    if (!content.includes('export const metadata')) {
      errors.push('caseworks page must export Next.js metadata')
    }
    if (!content.includes('export default function')) {
      errors.push('caseworks page must export a default page component')
    }
    // Multi-line CTAPanel blocks — the old single-line regex missed factory bugs
    // that shipped title= without href and crashed Next Link prerender.
    const ctaBlocks = content.match(/<CTAPanel\b[\s\S]*?(?:\/>|>[\s\S]*?<\/CTAPanel>)/g) || []
    if (!ctaBlocks.length) {
      errors.push('caseworks page must include a <CTAPanel /> with intake href')
    }
    for (const block of ctaBlocks) {
      const hasHref = /\bhref\s*=/.test(block) || /\bctaHref\s*=/.test(block)
      const hasHeadline = /\bheadline\s*=/.test(block) || /\btitle\s*=/.test(block)
      const hasCta = /\bcta\s*=/.test(block) || /\bctaLabel\s*=/.test(block)
      const hasBody = /\bbody\s*=/.test(block)
      if (!hasHref) {
        errors.push(
          'CTAPanel missing href (required — undefined Link href crashes caseworks build)',
        )
      }
      if (!hasHeadline) errors.push('CTAPanel missing headline (or legacy title)')
      if (!hasCta) errors.push('CTAPanel missing cta (or legacy ctaLabel)')
      if (!hasBody) errors.push('CTAPanel missing body')
      // Prefer canonical props when factory emits modern import
      if (/\btitle\s*=/.test(block) && !/\bheadline\s*=/.test(block)) {
        errors.push('CTAPanel uses deprecated "title" — emit "headline" for caseworks contract')
      }
      if (/\bctaLabel\s*=/.test(block) && !/\bcta\s*=/.test(block)) {
        errors.push('CTAPanel uses deprecated "ctaLabel" — emit "cta"')
      }
      if (/href\s*=\s*\{\s*(undefined|null)\s*\}/.test(block)) {
        errors.push('CTAPanel href is undefined/null — refuse ship')
      }
    }
    if (content.includes('href={undefined}') || content.includes('href={null}')) {
      errors.push('Rendered page has undefined Link href — refuse ship')
    }
    // Canonical in metadata should reference legal host
    if (plan.host === 'legal' && content.includes('canonical') && !content.includes('legal.yousafeconsultancy.com')) {
      errors.push('caseworks metadata canonical must use legal.yousafeconsultancy.com')
    }
  } else if (filePath.endsWith('.md') || filePath.endsWith('.mdx')) {
    if (!content.startsWith('---')) {
      errors.push('Markdown/MDX ships must start with YAML front matter (---)')
    } else {
      const end = content.indexOf('\n---', 3)
      if (end < 0) errors.push('YAML front matter is not closed')
      const fm = content.slice(0, end > 0 ? end : 200)
      if (!/title\s*:/.test(fm)) errors.push('Front matter missing title')
      if (!/canonical\s*:/.test(fm)) errors.push('Front matter missing canonical')
      if (!/ownerHost\s*:/.test(fm) && !/owner_host\s*:/.test(fm)) {
        errors.push('Front matter missing ownerHost')
      }
      // ownerHost must match plan
      const m = fm.match(/ownerHost:\s*["']?(\w+)/)
      if (m && m[1] && m[1] !== plan.host) {
        errors.push(`Front matter ownerHost=${m[1]} does not match plan host=${plan.host}`)
      }
      // Canonical host check inside FM
      const c = fm.match(/canonical:\s*["']?([^"'\n]+)/)
      if (c?.[1]) {
        const h = hostFromUrl(c[1].replace(/["']/g, '').trim())
        if (h && h !== plan.host) {
          errors.push(`Front matter canonical host ${h} ≠ plan host ${plan.host}`)
        }
      }
    }
    // Body depth — align with Google floor table (contentDepth). Soft floor here;
    // assertContentDepth in ship.ts is the hard gate using type-specific mins.
    const body = content.replace(/^---[\s\S]*?---\s*/, '').trim()
    const bodyWords = body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .split(/\s+/)
      .filter(Boolean).length
    if (bodyWords < 500) {
      errors.push(
        `Markdown body too thin (${bodyWords} words; absolute min 500 before type-specific Google depth gate)`,
      )
    }
  } else if (content.length < 200) {
    errors.push('Rendered payload too short to ship')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Throw if plan or rendered payload is not shippable.
 * Call immediately before any GitHub write.
 */
export function assertShipAllowed(opts: {
  plan: OwnerPlan
  contentType: string
  title?: string
  primaryKeyword?: string
  filePath: string
  fileContent: string
}): ShipGateResult {
  const planGate = validateShipPlan({
    plan: opts.plan,
    contentType: opts.contentType,
    title: opts.title,
    primaryKeyword: opts.primaryKeyword,
  })
  const payloadGate = validateRenderedPayload({
    plan: opts.plan,
    filePath: opts.filePath,
    fileContent: opts.fileContent,
    contentType: opts.contentType,
  })

  const errors = [...planGate.errors, ...payloadGate.errors]
  if (errors.length) {
    throw new Error(
      `Ship refused — estate format / subdomain gate failed:\n- ${errors.join('\n- ')}`,
    )
  }
  return planGate
}

function describePathExamples(host: OwnerHost): string {
  switch (host) {
    case 'legal':
      return 'app/us/{slug}/page.tsx · app/uk/{slug}/page.tsx · app/blog/{slug}/page.tsx'
    case 'usa':
      return 'usa/content/from/{slug}.md · usa/content/blog/{slug}.md · usa/content/{slug}.md'
    case 'uk':
      return 'uk/content/from/{slug}.md · uk/content/blog/{slug}.md'
    case 'ca':
      return 'ca/content/from/{slug}.md · ca/content/blog/{slug}.md'
    case 'au':
      return 'au/content/from/{slug}.md · au/content/blog/{slug}.md'
    case 'apex':
      return 'landing-page/content/blog/{slug}.md · landing-page/content/{slug}.md'
    case 'market':
      return 'catalogue/{slug}.mdx'
    default:
      return '(unknown host)'
  }
}

/** API helper for admin UI / plan endpoint. */
export function describeEstateContract(): {
  hosts: Array<{
    host: OwnerHost
    publicUrl: string
    repo: ContentRepo
    allowedKinds: ShipContentKind[]
    pathExamples: string
  }>
} {
  const hosts = (Object.keys(HOST_REPO) as OwnerHost[]).map((host) => ({
    host,
    publicUrl: HOST_PUBLIC[host],
    repo: HOST_REPO[host],
    allowedKinds: HOST_ALLOWED_KINDS[host],
    pathExamples: describePathExamples(host),
  }))
  return { hosts }
}
