/**
 * Portal root static-cache deploy gate (mirror of PR 244's market proof).
 *
 * portal.yousafeconsultancy.com/ is the Cloudflare 1102 route. It is served
 * like the market host — anonymous documents skip Clerk and OpenNext cache
 * interception answers from the read-only Workers Static Assets incremental
 * cache — which only works while the portal root stays build-static and its
 * prerender cache entry is published in the deploy. The deploy step therefore
 * fails closed through `scripts/verify-portal-root-static-cache.mjs`.
 *
 * These are behavior contracts: the real verifier script is executed against
 * fixture cache trees (several encodings, several key names), plus source
 * contracts for the deploy wiring.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const readRepo = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const GATE_SCRIPT = 'scripts/verify-portal-root-static-cache.mjs'
const GATE_SCRIPT_PATH = path.join(root, GATE_SCRIPT)
const POPULATE_STEP_NAME = 'Populate static incremental cache (local copy, no network)'
const BUILD_ID = 'build-portal-1102'

const gateScript = readRepo(GATE_SCRIPT)
const workflow = readRepo('.github/workflows/deploy.yml')
const workflowCode = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
const portalRoot = readRepo('app/page.tsx')

/** The portal root copy the document marker is read from (same rule as the script). */
function portalRootMarker(source: string): string {
  const match = source.match(/<SeoIntroBlock[\s\S]*?title="([^"]+)"/)
  if (!match) throw new Error('app/page.tsx no longer carries a SeoIntroBlock title')
  return match[1].trim()
}

const MARKER = portalRootMarker(portalRoot)

function deployStep(name: string): string {
  const marker = `- name: ${name}`
  const start = workflow.indexOf(marker)
  if (start === -1) throw new Error(`missing workflow step: ${name}`)
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length)
  return workflow.slice(start, nextStep === -1 ? undefined : nextStep)
}

describe(`scripts/verify-portal-root-static-cache.mjs (${GATE_SCRIPT})`, () => {
  let tmpDir: string

  const assetsDir = () => path.join(tmpDir, '.open-next', 'assets', 'cdn-cgi', '_next_cache')
  const buildDir = () => path.join(assetsDir(), BUILD_ID)
  const buildIdFile = () => path.join(tmpDir, '.next', 'BUILD_ID')
  const nextRootOutput = () => path.join(tmpDir, '.next', 'server', 'app', 'index.html')

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yousafe-portal-root-cache-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function write(absolutePath: string, contents: string | Buffer) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, contents)
  }

  function runGate(args: string[] = [], cwd = tmpDir) {
    return spawnSync(
      process.execPath,
      [
        GATE_SCRIPT_PATH,
        '--assets',
        assetsDir(),
        '--build-id',
        BUILD_ID,
        '--root-file',
        path.join(root, 'app', 'page.tsx'),
        ...args,
      ],
      { cwd, encoding: 'utf8' },
    )
  }

  function markRootPrerendered() {
    write(nextRootOutput(), '<html>build-static portal root</html>')
    write(buildIdFile(), BUILD_ID)
  }

  test('passes when the derived portal root cache entry exists', () => {
    markRootPrerendered()
    write(path.join(buildDir(), 'index.cache'), JSON.stringify({ html: '<html>portal</html>' }))
    write(path.join(buildDir(), 'marketplace.cache'), JSON.stringify({ html: '<html>market</html>' }))

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('portal root document published as "index.cache"')
    expect(result.stderr).not.toContain('ERROR')
  })

  test('verifies the portal root document text inside the derived entry', () => {
    markRootPrerendered()
    write(
      path.join(buildDir(), 'index.cache'),
      JSON.stringify({ html: `<h2>${MARKER}</h2>`, headers: {} }),
    )

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('document text verified')
    expect(result.stderr).not.toContain('does not contain the portal root document text')
  })

  test('discovers a differently-named root entry by its document text and names it for pinning', () => {
    markRootPrerendered()
    write(
      path.join(buildDir(), 'portal-root.cache'),
      JSON.stringify({ html: `<p>${MARKER}</p>` }),
    )
    write(path.join(buildDir(), 'marketplace.cache'), JSON.stringify({ html: '<html>market</html>' }))

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('portal root document discovered under "portal-root.cache"')
    expect(result.stdout).toContain('pin "portal-root"')
  })

  test('finds the document in a gzip-compressed cache payload', () => {
    markRootPrerendered()
    write(
      path.join(buildDir(), 'root.cache'),
      gzipSync(Buffer.from(JSON.stringify({ html: `<p>${MARKER}</p>` }), 'utf8')),
    )

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"root.cache"')
  })

  test('reads the build id from .next/BUILD_ID when none is passed', () => {
    markRootPrerendered()
    write(path.join(buildDir(), 'index.cache'), JSON.stringify({ html: '<html>portal</html>' }))

    const result = spawnSync(
      process.execPath,
      [GATE_SCRIPT_PATH, '--assets', assetsDir(), '--root-file', path.join(root, 'app', 'page.tsx')],
      { cwd: tmpDir, encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(BUILD_ID)
  })

  test('fails closed when only the marketplace entries were published', () => {
    markRootPrerendered()
    write(path.join(buildDir(), 'marketplace.cache'), JSON.stringify({ html: '<html>market</html>' }))
    write(
      path.join(buildDir(), 'marketplace', 'gigs.cache'),
      JSON.stringify({ html: '<html>gigs</html>' }),
    )

    const result = runGate()

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('portal root document is not published')
    expect(result.stderr).toContain('marketplace')
    expect(result.stdout).not.toContain('portal root document published')
  })

  test('fails closed when the published cache directory for the build is missing', () => {
    write(buildIdFile(), BUILD_ID)

    const result = runGate()

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('published static incremental cache directory is missing')
  })

  test('fails closed on an empty published cache for the build', () => {
    markRootPrerendered()
    fs.mkdirSync(buildDir(), { recursive: true })

    const result = runGate()

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('contains no cache entries')
  })

  test('fails closed when no build id can be determined', () => {
    write(path.join(buildDir(), 'index.cache'), JSON.stringify({ html: '<html>portal</html>' }))

    const result = spawnSync(
      process.execPath,
      [GATE_SCRIPT_PATH, '--assets', assetsDir(), '--root-file', path.join(root, 'app', 'page.tsx')],
      { cwd: tmpDir, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('build id not found')
  })

  test('fails closed when the marker source is gone and the derived key is absent', () => {
    markRootPrerendered()
    write(path.join(buildDir(), 'marketplace.cache'), JSON.stringify({ html: '<html>market</html>' }))

    const result = runGate(['--root-file', path.join(tmpDir, 'missing-page.tsx')])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('could not read a portal root marker')
    expect(result.stderr).toContain('portal root document is not published')
  })

  test('rejects unknown arguments instead of skipping the verification', () => {
    const result = runGate(['--remote'])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unknown argument: --remote')
  })

  test('documents its own usage', () => {
    const result = spawnSync(process.execPath, [GATE_SCRIPT_PATH, '--help'], {
      cwd: tmpDir,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('cdn-cgi/_next_cache')
  })

  test('is a local-only, dependency-free script that discovers the document instead of hardcoding it', () => {
    const importSpecifiers = [...gateScript.matchAll(/\bfrom\s+'([^']+)'/g)]
      .map((match) => match[1])
      .sort()
    expect(importSpecifiers).toEqual(['node:fs', 'node:path', 'node:process', 'node:url', 'node:zlib'])
    expect(gateScript).not.toMatch(/\brequire\s*\(/)
    expect(gateScript).not.toMatch(/\bfetch\s*\(/)
    expect(gateScript).not.toMatch(/api\.cloudflare\.com|CLOUDFLARE_API_TOKEN|\bwrangler\b/)
    // The portal root copy is read from the real page source, never inlined.
    expect(gateScript).not.toContain(MARKER)
    expect(gateScript).toContain("join(REPO_ROOT, 'app', 'page.tsx')")
    expect(gateScript).toContain('<SeoIntroBlock')
  })
})

describe('portal root stays prerenderable (source contract)', () => {
  const introBlock = readRepo('components/SeoIntroBlock.tsx')

  test('the root page renders the intro block without server translation', () => {
    // Translation resolves `x-lang` by calling headers(), and a request-header
    // read opts the whole route into dynamic rendering: Next then emits no
    // root prerender document, so the read-only static-assets cache (and this
    // gate) has nothing to serve. That is the regression this test pins.
    expect(portalRoot).toMatch(/<SeoIntroBlock[\s\S]*?translate=\{false\}/)
    expect(portalRoot).toContain("export const dynamic = 'force-static'")
  })

  test('the intro block reads request headers only behind the translate opt-in', () => {
    const headerRead = introBlock.indexOf('await headers()')
    const guard = introBlock.indexOf('if (translate) {')

    expect(headerRead).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(headerRead)
    // Existing (translated) callers keep their behaviour by default.
    expect(introBlock).toContain('translate = true')
  })
})

describe('deploy workflow portal root gate', () => {
  const step = deployStep(POPULATE_STEP_NAME)

  test('the population step runs the portal root verifier, fail-closed', () => {
    expect(step).toContain(`node ${GATE_SCRIPT}`)
    expect(step).not.toContain('continue-on-error')
  })

  test('the verifier runs after the cache is published and before the deploy', () => {
    const buildIndex = workflowCode.indexOf('npm run build')
    const populateIndex = workflowCode.indexOf('npm run populate:static-incremental-cache')
    const gateIndex = workflowCode.indexOf(`node ${GATE_SCRIPT}`)
    const deployIndex = workflowCode.indexOf('npm run deploy')

    expect(buildIndex).toBeGreaterThan(-1)
    expect(populateIndex).toBeGreaterThan(buildIndex)
    expect(gateIndex).toBeGreaterThan(populateIndex)
    expect(deployIndex).toBeGreaterThan(gateIndex)
  })

  test('every existing market cache key check survives beside the portal gate', () => {
    for (const key of [
      'marketplace',
      'marketplace/gigs',
      'marketplace/categories',
      'marketplace/providers',
      'shop',
    ]) {
      expect(step).toContain(key)
    }
    expect(step).toContain('.open-next/assets/cdn-cgi/_next_cache/${BUILD_ID}/${cache_key}.cache')
    expect(step).toContain('Missing required prerender cache asset')
  })
})
