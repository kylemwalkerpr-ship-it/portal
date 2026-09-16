/**
 * Content Studio client registry boundary — static bundling guard.
 *
 * The studio pickers are client components (`'use client'`), and they consume
 * `lib/contentAiCatalog.ts`. That catalog must stay on the client side of the
 * dependency boundary: it may only reach the pure, client-safe registry
 * contract (`lib/contentAiRegistryContract.ts`), never the runtime registry
 * (`lib/contentAiRegistry.ts`), the provider execution core
 * (`lib/contentAiProviderCore.ts`), the credential vault, or the xAI/undici
 * transports.
 *
 * Fresh integrated-build evidence: `components/design/admin-content-studio.tsx`
 * (client) -> `lib/contentAiCatalog.ts` -> `lib/contentAiRegistry.ts` ->
 * `lib/contentAiProviderCore.ts` -> static `require('undici')` produced a
 * webpack UnhandledSchemeError for `node:async_hooks`, `node:buffer`,
 * `node:console` and `node:crypto`. The fix is the boundary itself — no webpack
 * aliases/fallbacks, no dynamic-string require hiding, no browser shims.
 *
 * This test walks the RUNTIME import graph (type-only imports are erased by the
 * TypeScript/Webpack pipeline and are not bundling edges) and fails on any
 * server execution/credential module or Node/undici specifier reachable from
 * the client catalog. It also pins the single-source-of-truth wiring: the
 * runtime registry derives its provider table from the same contract the
 * catalog consumes, and the contract itself has no imports at all.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

const CATALOG = 'lib/contentAiCatalog.ts'
const CONTRACT = 'lib/contentAiRegistryContract.ts'
const RUNTIME_REGISTRY = 'lib/contentAiRegistry.ts'

/** Strip block + line comments so documentation can never trip (or hide) a rule. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
}

interface StaticDependency {
  specifier: string
  typeOnly: boolean
}

/** `import type { X }` / `export type { X }` and `{ type X }`-only clauses are erased. */
function isTypeOnlyClause(clause: string): boolean {
  return /^\{\s*(?:type\s+[A-Za-z0-9_$]+(?:\s+as\s+[A-Za-z0-9_$]+)?\s*,?\s*)+\}$/.test(clause.trim())
}

function staticDependencies(relative: string): StaticDependency[] {
  const source = stripComments(read(relative))
  const dependencies: StaticDependency[] = []

  const fromRe = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(fromRe)) {
    const clause = (match[2] || '').trim()
    dependencies.push({
      specifier: match[3],
      typeOnly: Boolean(match[1]) || isTypeOnlyClause(clause),
    })
  }

  const sideEffectRe = /\bimport\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(sideEffectRe)) {
    dependencies.push({ specifier: match[1], typeOnly: false })
  }

  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of source.matchAll(dynamicRe)) {
    dependencies.push({ specifier: match[1], typeOnly: false })
  }

  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of source.matchAll(requireRe)) {
    dependencies.push({ specifier: match[1], typeOnly: false })
  }

  return dependencies
}

function resolveSpecifier(fromRelative: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = path.join(root, specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(path.join(root, fromRelative)), specifier)
  else return null

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.relative(root, candidate)
  }
  return null
}

/**
 * Server modules that may never appear on the client bundling path. The
 * contract is deliberately absent from this list; the runtime registry is
 * present.
 */
const SERVER_MODULE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'runtime registry', pattern: /(?:^|\/)contentAiRegistry\.ts$/ },
  { label: 'provider execution core', pattern: /(?:^|\/)contentAiProviderCore\.ts$/ },
  { label: 'provider facade', pattern: /(?:^|\/)contentAiProvider\.ts$/ },
  { label: 'credential vault', pattern: /(?:^|\/)aiKeyVault\.ts$/ },
  { label: 'xai transport', pattern: /(?:^|\/)xaiGrokTransport\.ts$/ },
  { label: 'xai oauth', pattern: /(?:^|\/)xaiSuperGrokOAuth\.ts$/ },
  { label: 'retired transport catalog', pattern: /(?:^|\/)runbiosCatalog\.ts$/ },
]

const SERVER_SPECIFIER_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'node builtin', pattern: /^node:/ },
  { label: 'undici', pattern: /^undici(?:\/|$)/ },
  { label: 'server-only', pattern: /^server-only$/ },
]

interface BoundaryScan {
  files: Set<string>
  violations: string[]
}

/** Walk runtime imports from an entry; report server modules/specifiers and returned files. */
function scanClientBoundary(entry: string): BoundaryScan {
  const files = new Set<string>()
  const violations: string[] = []
  const queue: string[] = [entry]

  while (queue.length > 0) {
    const file = queue.shift() as string
    if (files.has(file) || !fs.existsSync(path.join(root, file))) continue
    files.add(file)

    for (const dependency of staticDependencies(file)) {
      if (dependency.typeOnly) continue
      for (const { label, pattern } of SERVER_SPECIFIER_PATTERNS) {
        if (pattern.test(dependency.specifier)) {
          violations.push(`${file} -> ${dependency.specifier} (${label})`)
        }
      }
      const resolved = resolveSpecifier(file, dependency.specifier)
      if (!resolved) continue
      for (const { label, pattern } of SERVER_MODULE_PATTERNS) {
        if (pattern.test(resolved)) violations.push(`${file} -> ${resolved} (${label})`)
      }
      queue.push(resolved)
    }
  }

  return { files, violations }
}

/** Every `'use client'` component that consumes the catalog. */
function clientCatalogConsumers(): string[] {
  const componentsRoot = path.join(root, 'components')
  const consumers: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx$/.test(entry.name)) continue
      const source = fs.readFileSync(full, 'utf8')
      if (!source.startsWith("'use client'")) continue
      const relative = path.relative(root, full)
      const dependencies = staticDependencies(relative)
      if (dependencies.some((dependency) => dependency.specifier === '@/lib/contentAiCatalog')) {
        consumers.push(relative)
      }
    }
  }
  walk(componentsRoot)
  return consumers
}

describe('Content Studio client registry boundary', () => {
  it('keeps the client catalog free of runtime registry, execution core, vault and transport imports', () => {
    const { violations } = scanClientBoundary(CATALOG)
    expect(violations.sort()).toEqual([])
  })

  it('routes the client catalog exclusively through the client-safe contract', () => {
    expect(fs.existsSync(path.join(root, CONTRACT))).toBe(true)
    const { files, violations } = scanClientBoundary(CATALOG)
    expect(violations).toEqual([])
    expect([...files].sort()).toEqual([CATALOG, CONTRACT].sort())
    expect(stripComments(read(CATALOG))).toMatch(/from\s+['"]@\/lib\/contentAiRegistryContract['"]/)
    expect(stripComments(read(CATALOG))).not.toMatch(/from\s+['"]@\/lib\/contentAiRegistry['"]/)
  })

  it('keeps the client-safe contract pure — zero imports, zero server references', () => {
    expect(fs.existsSync(path.join(root, CONTRACT))).toBe(true)
    const dependencies = staticDependencies(CONTRACT)
    expect(dependencies).toEqual([])
    const { violations } = scanClientBoundary(CONTRACT)
    expect(violations).toEqual([])
  })

  it('derives the runtime COMMISSIONED_PROVIDERS from the single contract table', () => {
    const registry = stripComments(read(RUNTIME_REGISTRY))
    const contract = stripComments(read(CONTRACT))
    expect(registry).toMatch(/from\s+['"]\.\/contentAiRegistryContract['"]/)
    expect(registry).toMatch(/COMMISSIONED_PROVIDER_DEFINITIONS\s*\.map\s*\(/)
    for (const literal of [
      "'grok'",
      "'deepseek-v41-flash'",
      "'grok-4.6'",
      "'deepseek-flash'",
      "'https://api.x.ai/v1'",
      "'api.x.ai'",
      "'https://api.deepseek.com/v1'",
      "'api.deepseek.com'",
      "'xai-responses'",
      "'openai-compatible'",
      "'grok-latest'",
    ]) {
      expect(contract).toContain(literal)
    }
    // The registry may re-export identity metadata, never re-declare it.
    for (const duplicated of [
      /apiModel:\s*['"]deepseek-flash['"]/,
      /apiModel:\s*['"]grok-4\.6['"]/,
      /baseUrl:\s*['"]https:\/\/api\.deepseek\.com\/v1['"]/,
      /baseUrl:\s*['"]https:\/\/api\.x\.ai\/v1['"]/,
      /['"]grok-latest['"]/,
    ]) {
      expect(registry).not.toMatch(duplicated)
    }
  })

  it('never lets a use-client component import the runtime registry or execution core directly', () => {
    const offenders: string[] = []
    for (const relative of clientCatalogConsumers()) {
      for (const dependency of staticDependencies(relative)) {
        if (dependency.typeOnly) continue
        if (/^@\/lib\/contentAiRegistry$|^@\/lib\/contentAiProviderCore$|^@\/lib\/contentAiProvider$|^@\/lib\/aiKeyVault$/.test(dependency.specifier)) {
          offenders.push(`${relative} -> ${dependency.specifier}`)
        }
      }
    }
    expect(offenders.sort()).toEqual([])
  })
})
