#!/usr/bin/env node
/**
 * seo-audit-guard.mjs — Estate SEO guard for yousafe-portal (marketplace)
 *
 * Checks relevant to a DB-backed marketplace with gig/attorney/provider pages:
 *   1. Noindex-in-sitemap — any URL in the rendered sitemap that emits noindex
 *   2. Canonical health — any page whose canonical doesn't match its URL
 *   3. Metadata duplication — shared title / description across indexable pages
 *   4. Schema presence — indexable pages missing JSON-LD
 *
 * Runs after `npm run build` so the `out/` (or `.vercel/output/static/`)
 * directory exists with rendered HTML.
 *
 * Exit codes:
 *   0 — passed (or report-only mode)
 *   1 — fail-on-critical and critical issues found
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = dirname(__dirname)

// Search for static output in Vercel, Next.js export, or OpenNext layout.
// The portal uses OpenNext → .open-next/assets/; yousafe-consultancy
// uses standard Next.js → out/ or .vercel/output/static/.
function findOutDir() {
  for (const candidate of [
    join(root, '.vercel', 'output', 'static'),
    join(root, 'out'),
    join(root, '.open-next', 'assets'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

const OUT = findOutDir()
if (!OUT) {
  console.error('❌ No static output directory found (.vercel/output/static/ or out/)')
  console.error('   Run a production build first.')
  process.exit(1)
}

function walkHtml(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    if (entry === '_next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkHtml(full, files)
    else if (entry === 'index.html') files.push(full)
  }
  return files
}

function extractMeta(html) {
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim() || null
  const canon =
    (html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i) ||
      html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) ||
      [])[1] || null
  const robots =
    (html.match(/name=["']robots["'][^>]*content=["']([^"']+)/i) ||
      html.match(/content=["']([^"']+)["'][^>]*name=["']robots["']/i) ||
      [])[1] || null
  const desc =
    (html.match(/name=["']description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
      [])[1] || null
  const ldTypes = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
  return { title, canon, robots, desc, ldTypes: [...new Set(ldTypes)] }
}

function isNoindex(robots) {
  if (!robots) return false
  return /noindex/i.test(robots)
}

function pathFromFile(file, outDir) {
  let rel = relative(outDir, file).replace(/\\/g, '/')
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'/index.html'.length)
  else if (rel === 'index.html') rel = ''
  return '/' + (rel || '')
}

// ── Main ──
const files = walkHtml(OUT)
console.log(`\n🔒 Portal SEO Audit Guard (${files.length} HTML files)\n`)

const pages = []
const titlesSeen = {}
const descsSeen = {}
let issues = []

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const path = pathFromFile(file, OUT)
  const meta = extractMeta(html)
  const noindex = isNoindex(meta.robots)
  const page = { path, noindex, ...meta }

  // Check 1: noindex-in-sitemap
  if (noindex) {
    issues.push({
      check: 'noindex-in-sitemap',
      severity: 'high',
      path,
      detail: `robots: ${meta.robots}`,
    })
  }

  // Check 2: canonical health
  if (!noindex && meta.canon) {
    if (!meta.canon.endsWith(path) && !meta.canon.endsWith(path + '/') && !meta.canon.endsWith(path + 'index.html')) {
      issues.push({
        check: 'canonical-mismatch',
        severity: 'medium',
        path,
        detail: `canonical: ${meta.canon}`,
      })
    }
  }

  // Check 3: metadata duplication
  if (!noindex) {
    if (meta.title) {
      if (titlesSeen[meta.title]) titlesSeen[meta.title].push(path)
      else titlesSeen[meta.title] = [path]
    }
    if (meta.desc) {
      if (descsSeen[meta.desc]) descsSeen[meta.desc].push(path)
      else descsSeen[meta.desc] = [path]
    }
  }

  // Check 4: schema presence
  if (!noindex && page.ldTypes.length === 0) {
    issues.push({
      check: 'missing-schema',
      severity: 'low',
      path,
      detail: 'no JSON-LD @type found',
    })
  }

  pages.push(page)
}

// Report duplicate metadata
for (const [title, paths] of Object.entries(titlesSeen)) {
  if (paths.length > 1) {
    issues.push({
      check: 'duplicate-title',
      severity: 'medium',
      path: paths.join(', '),
      detail: `"${title}" shared by ${paths.length} pages`,
    })
  }
}
for (const [desc, paths] of Object.entries(descsSeen)) {
  if (paths.length > 1) {
    issues.push({
      check: 'duplicate-description',
      severity: 'low',
      path: paths.join(', '),
      detail: `description shared by ${paths.length} pages`,
    })
  }
}

// Aggregate
const summary = {
  totalPages: pages.length,
  indexable: pages.filter((p) => !p.noindex).length,
  noindexInSitemap: issues.filter((i) => i.check === 'noindex-in-sitemap').length,
  canonicalMismatch: issues.filter((i) => i.check === 'canonical-mismatch').length,
  duplicateTitles: issues.filter((i) => i.check === 'duplicate-title').length,
  duplicateDescriptions: issues.filter((i) => i.check === 'duplicate-description').length,
  missingSchema: issues.filter((i) => i.check === 'missing-schema').length,
  totalIssues: issues.length,
  criticalCount: issues.filter((i) => i.severity === 'high' || i.severity === 'critical').length,
}

const report = {
  timestamp: new Date().toISOString(),
  summary,
  issues: issues.slice().sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 }
    return (sev[a.severity] || 4) - (sev[b.severity] || 4)
  }),
}

// Write report
const reportPath = join(root, '.seo', 'reports', 'portal-audit-guard.json')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))

// Console
console.log(`   Pages:          ${summary.totalPages}`)
console.log(`   Indexable:      ${summary.indexable}`)
console.log(`   Noindex:        ${summary.noindexInSitemap}`)
console.log(`   Canonical err:  ${summary.canonicalMismatch}`)
console.log(`   Dup titles:     ${summary.duplicateTitles}`)
console.log(`   Dup descs:      ${summary.duplicateDescriptions}`)
console.log(`   Missing schema: ${summary.missingSchema}`)
console.log(`   Total issues:   ${summary.totalIssues} (${summary.criticalCount} critical)\n`)

for (const issue of report.issues.filter((i) => i.severity !== 'low').slice(0, 20)) {
  console.log(`   [${issue.severity.toUpperCase()}] ${issue.check}: ${issue.path}`)
  if (issue.detail) console.log(`          ${issue.detail}`)
}

if (summary.criticalCount > 0) {
  console.log(`\n❌ PORTAL SEO AUDIT GUARD FAILED (${summary.criticalCount} critical issues)`)
} else {
  console.log(`\n✅ PORTAL SEO AUDIT GUARD PASSED`)
}
console.log(`   Report: ${reportPath}\n`)
