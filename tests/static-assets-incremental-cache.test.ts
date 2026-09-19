/**
 * Official OpenNext Workers Static Assets incremental-cache contract.
 *
 * Production facts this locks in:
 *   - The Worker runs on the Cloudflare Workers Free plan, so the ONLY
 *     admissible incremental cache is OpenNext's official read-only
 *     `staticAssetsIncrementalCache` (prerender output published as static
 *     assets under `cdn-cgi/_next_cache`). No R2/KV/D1/DO/queue/tag cache,
 *     and no paid `[limits]`/`cpu_ms` config.
 *   - This repo publishes with raw `wrangler deploy` (see
 *     scripts/deploy-production.mjs) instead of `opennextjs-cloudflare
 *     deploy`, so the adapter's local `populateStaticAssetsIncrementalCache`
 *     copy must be run explicitly between the build and the deploy.
 *
 * These are source + behavior contracts: the behavior tests execute the real
 * population script against temporary fixture directories.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const readRepo = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const OFFICIAL_OVERRIDE_SPECIFIER =
  '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'
const POPULATE_SCRIPT = 'scripts/populate-static-incremental-cache.mjs'
const POPULATE_SCRIPT_PATH = path.join(root, POPULATE_SCRIPT)
const POPULATE_NPM_SCRIPT = 'populate:static-incremental-cache'
const POPULATE_STEP_NAME = '- name: Populate static incremental cache'

/** Strip block + line comments so prose cannot satisfy a code contract. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const openNextConfig = readRepo('open-next.config.ts')
const openNextConfigCode = stripComments(openNextConfig)
const populateScript = readRepo(POPULATE_SCRIPT)
const populateScriptCode = stripComments(populateScript)
const workflow = readRepo('.github/workflows/deploy.yml')
// Comments are excluded so prose like "NOT `opennextjs-cloudflare deploy`"
// cannot be mistaken for an executable publish path.
const workflowCode = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
const wrangler = readRepo('wrangler.toml')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
const pkg = JSON.parse(readRepo('package.json'))
const portalRoot = readRepo('app/page.tsx')

describe('open-next.config.ts — official static-assets incremental cache', () => {
  test('imports the installed official adapter override by its documented specifier', () => {
    expect(openNextConfigCode).toContain(
      `import staticAssetsIncrementalCache from '${OFFICIAL_OVERRIDE_SPECIFIER}'`,
    )
  })

  test('wires the read-only static-assets cache and cache interception', () => {
    expect(openNextConfigCode).toMatch(
      /defineCloudflareConfig\(\{[\s\S]*incrementalCache:\s*staticAssetsIncrementalCache[\s\S]*\}\)/,
    )
    expect(openNextConfigCode).toMatch(/enableCacheInterception:\s*true/)
  })

  test('introduces no paid-path cache adapters', () => {
    expect(openNextConfigCode).not.toMatch(
      /\btagCache\b|\bqueue\b|r2IncrementalCache|d1NextTagCache|shardedD1TagCache|doQueue|durableObjects|kvIncrementalCache/,
    )
    expect(openNextConfigCode).not.toMatch(/\bR2\b|\bD1\b|\bKV\b|\bdurable[_ ]objects\b/i)
    expect(openNextConfigCode).not.toContain('@opennextjs/aws')
  })
})

describe('portal root is compatible with the read-only cache', () => {
  test('does not schedule background ISR revalidation', () => {
    expect(portalRoot).not.toMatch(/^\s*export\s+const\s+revalidate\b/m)
    expect(portalRoot).not.toContain('export const revalidate')
  })
})

describe('no paid infrastructure was introduced for the static cache', () => {
  test('wrangler.toml still carries no [limits] / cpu_ms / subrequests block', () => {
    expect(wrangler).not.toMatch(/^\s*\[limits\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*cpu_ms\s*=/m)
    expect(wrangler).not.toMatch(/^\s*subrequests\s*=/m)
  })

  test('wrangler.toml adds no R2 / Durable Objects / queue binding', () => {
    expect(wrangler).not.toMatch(/^\s*\[\[r2_buckets\]\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*\[\[durable_objects\.bindings\]\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*\[\[queues\.(consumers|producers)\]\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*\[migrations\]\s*$/m)
  })

  test('wrangler.toml keeps the static ASSETS binding the read-only cache serves from', () => {
    expect(wrangler).toMatch(/^\s*\[assets\]\s*$/m)
    expect(wrangler).toMatch(/^\s*binding\s*=\s*"ASSETS"\s*$/m)
    expect(wrangler).toMatch(/^\s*directory\s*=\s*"\.open-next\/assets"\s*$/m)
  })

  test('the populate script is a local-only filesystem copy', () => {
    const importSpecifiers = [...populateScriptCode.matchAll(/\bfrom\s+'([^']+)'/g)]
      .map((match) => match[1])
      .sort()
    expect(importSpecifiers).toEqual(['node:fs', 'node:path', 'node:process'])
    expect(populateScriptCode).not.toMatch(/\brequire\s*\(/)
    expect(populateScriptCode).not.toMatch(/\bfetch\s*\(/)
    expect(populateScriptCode).not.toMatch(/api\.cloudflare\.com|CLOUDFLARE_API_TOKEN|\bwrangler\b/)
  })
})

describe(`scripts/populate-static-incremental-cache.mjs (${POPULATE_NPM_SCRIPT})`, () => {
  let tmpDir: string

  const sourceDir = () => path.join(tmpDir, '.open-next', 'cache')
  const assetsDir = () => path.join(tmpDir, '.open-next', 'assets')
  const destinationDir = () => path.join(assetsDir(), 'cdn-cgi', '_next_cache')

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yousafe-static-cache-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function write(absolutePath: string, contents: string) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, contents)
  }

  function runPopulate(args: string[] = []) {
    return spawnSync(process.execPath, [POPULATE_SCRIPT_PATH, ...args], {
      cwd: tmpDir,
      encoding: 'utf8',
    })
  }

  function defaultArgs() {
    return ['--source', sourceDir(), '--destination', destinationDir()]
  }

  test('copies the build cache with the production layout when invoked with no arguments', () => {
    write(path.join(sourceDir(), 'build-abc', 'shop.json'), '{"value":"ssg"}')
    fs.mkdirSync(assetsDir(), { recursive: true })

    const result = runPopulate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Published 1 cache entries')
    expect(fs.readFileSync(path.join(destinationDir(), 'build-abc', 'shop.json'), 'utf8')).toBe(
      '{"value":"ssg"}',
    )
  })

  test('replaces a stale destination and leaves sibling assets untouched', () => {
    write(path.join(sourceDir(), 'build-new', 'route.json'), '{"value":"fresh"}')
    write(path.join(sourceDir(), 'build-new', 'nested', 'rsc.bin'), 'payload')
    write(path.join(assetsDir(), 'static', 'chunk.js'), 'console.log(1)')
    write(path.join(destinationDir(), 'build-old', 'stale.json'), '{"value":"stale"}')

    const result = runPopulate(defaultArgs())

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Published 2 cache entries')
    // Fresh build entries landed, including nested cache data.
    expect(fs.readFileSync(path.join(destinationDir(), 'build-new', 'route.json'), 'utf8')).toBe(
      '{"value":"fresh"}',
    )
    expect(fs.readFileSync(path.join(destinationDir(), 'build-new', 'nested', 'rsc.bin'), 'utf8')).toBe(
      'payload',
    )
    // The previous build's cache entry must not survive the deploy.
    expect(fs.existsSync(path.join(destinationDir(), 'build-old'))).toBe(false)
    // Unrelated static assets are not part of the copy and stay in place.
    expect(fs.readFileSync(path.join(assetsDir(), 'static', 'chunk.js'), 'utf8')).toBe('console.log(1)')
  })

  test('fails closed when .open-next/cache is missing after the build', () => {
    fs.mkdirSync(assetsDir(), { recursive: true })

    const result = runPopulate(defaultArgs())

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/prerender cache directory is missing/)
    expect(result.stdout).not.toContain('Published')
    expect(fs.existsSync(destinationDir())).toBe(false)
  })

  test('fails closed when the prerender cache is empty', () => {
    fs.mkdirSync(sourceDir(), { recursive: true })
    fs.mkdirSync(assetsDir(), { recursive: true })

    const result = runPopulate(defaultArgs())

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/prerender cache directory is empty/)
    expect(fs.existsSync(destinationDir())).toBe(false)
  })

  test('fails closed when the OpenNext assets directory was never built', () => {
    write(path.join(sourceDir(), 'build-abc', 'route.json'), '{"value":"ssg"}')

    const result = runPopulate(defaultArgs())

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/static-assets directory is missing/)
    expect(fs.existsSync(destinationDir())).toBe(false)
  })

  test('refuses to copy a cache directory onto itself', () => {
    write(path.join(sourceDir(), 'build-abc', 'route.json'), '{"value":"ssg"}')

    const result = runPopulate(['--source', sourceDir(), '--destination', sourceDir()])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/same directory/)
    expect(fs.readFileSync(path.join(sourceDir(), 'build-abc', 'route.json'), 'utf8')).toBe(
      '{"value":"ssg"}',
    )
  })

  test('rejects unknown arguments instead of silently copying', () => {
    const result = runPopulate(['--remote'])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Unknown argument: --remote/)
  })
})

describe('GitHub production workflow ordering (build -> populate -> raw deploy)', () => {
  test('package.json exposes the population step as an npm script', () => {
    expect(pkg.scripts[POPULATE_NPM_SCRIPT]).toBe(`node ${POPULATE_SCRIPT}`)
  })

  test('the workflow runs build, then the local population step, then the raw deploy', () => {
    const buildIndex = workflow.indexOf('npm run build')
    const populateIndex = workflow.indexOf(`npm run ${POPULATE_NPM_SCRIPT}`)
    const deployIndex = workflow.indexOf('npm run deploy')

    expect(buildIndex).toBeGreaterThan(-1)
    expect(populateIndex).toBeGreaterThan(-1)
    expect(deployIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeLessThan(populateIndex)
    expect(populateIndex).toBeLessThan(deployIndex)
  })

  test('the population step is an explicit, fail-closed workflow step', () => {
    const start = workflow.indexOf(POPULATE_STEP_NAME)
    expect(start).toBeGreaterThan(-1)
    const nextStep = workflow.indexOf('\n      - name:', start + 1)
    const step = workflow.slice(start, nextStep === -1 ? undefined : nextStep)

    expect(step).toContain(`npm run ${POPULATE_NPM_SCRIPT}`)
    expect(step).not.toContain('continue-on-error')
  })

  test('the population step verifies every critical Marketplace SSG cache key', () => {
    const start = workflow.indexOf(POPULATE_STEP_NAME)
    const nextStep = workflow.indexOf('\n      - name:', start + 1)
    const step = workflow.slice(start, nextStep === -1 ? undefined : nextStep)

    expect(step).toContain('BUILD_ID="$(cat .next/BUILD_ID)"')
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

  test('the workflow still deploys only through the GitHub-main-only guarded script', () => {
    expect(workflow).toContain('branches: [main]')
    expect(workflowCode).toMatch(/if: github\.event_name != 'pull_request'/)
    // No direct provider publish path, and no OpenNext deploy/populate command
    // (which would hit the platform-proxy endpoint the CI token cannot call).
    expect(workflowCode).not.toMatch(/^\s*run:.*\bwrangler\b/m)
    expect(workflowCode).not.toMatch(/opennextjs-cloudflare\s+(deploy|populate)/)
  })
})
