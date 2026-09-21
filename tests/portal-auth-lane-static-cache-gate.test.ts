/**
 * Deploy gate for the portal auth-lane shells
 * (MARKET-PORTAL-AUTH-HANDOFF-1102 R2).
 *
 * The lanes are the Cloudflare 1102 class (`503 error code: 1102` on
 * /sign-in/student, cf-ray a3e83a202c58724a). They are only cheap while their
 * documents stay prerendered AND published in the read-only static-assets
 * incremental cache, so the deploy fails closed through
 * scripts/verify-portal-auth-lane-static-cache.mjs.
 *
 * These are behavior contracts: the real verifier script is executed against
 * fixture trees (lane roots, gzip payloads, alternative key names, missing
 * entries, missing document text, dynamic pages), plus source contracts for the
 * deploy wiring.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const readRepo = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const GATE_SCRIPT = 'scripts/verify-portal-auth-lane-static-cache.mjs'
const GATE_SCRIPT_PATH = path.join(root, GATE_SCRIPT)
const POPULATE_STEP_NAME = 'Populate static incremental cache (local copy, no network)'
const BUILD_ID = 'build-auth-lane-1102'

const SIGN_IN_MARKER = 'Welcome back to your YouSafe workspace.'
const SIGN_UP_MARKER = 'Start inside the right YouSafe lane.'

const LANES = {
  'sign-in': ['student', 'client', 'consultant', 'attorney', 'admin'],
  'sign-up': ['student', 'client', 'consultant', 'attorney'],
}

function laneShellPaths(lanes: Record<string, string[]> = LANES): string[] {
  const paths: string[] = []
  for (const family of ['sign-in', 'sign-up']) {
    paths.push(`/${family}`)
    for (const lane of lanes[family]) paths.push(`/${family}/${lane}`)
  }
  return paths
}

function pageSource(family: string): string {
  return `import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
export const dynamic = 'force-static'
export const dynamicParams = false
export function generateStaticParams() {
  return [{ rest: [] as string[] }, ...portalAuthLaneRoots('${family}').map((lane) => ({ rest: [lane] }))]
}
export default function Page() { return null }
`
}

function clientSource(marker: string): string {
  return `'use client'
export default function Client() {
  return (
    <AuthShell
      eyebrow="Secure portal access"
      title="${marker}"
      body="sign in copy"
    >
      <SignIn />
    </AuthShell>
  )
}
`
}

const workflow = readRepo('.github/workflows/deploy.yml')

function deployStep(name: string): string {
  const marker = `- name: ${name}`
  const start = workflow.indexOf(marker)
  if (start === -1) throw new Error(`missing workflow step: ${name}`)
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length)
  return workflow.slice(start, nextStep === -1 ? undefined : nextStep)
}

describe(`scripts/verify-portal-auth-lane-static-cache.mjs (${GATE_SCRIPT})`, () => {
  let tmpDir: string

  const sourcesDir = () => path.join(tmpDir, 'sources')
  const assetsDir = () => path.join(tmpDir, '.open-next', 'assets', 'cdn-cgi', '_next_cache')
  const buildDir = () => path.join(assetsDir(), BUILD_ID)
  const nextAppDir = () => path.join(tmpDir, '.next', 'server', 'app')
  const manifestFile = () => path.join(tmpDir, '.next', 'prerender-manifest.json')
  const laneManifestFile = () => path.join(sourcesDir(), 'lib', 'portalAuthLaneShells.json')

  function write(absolutePath: string, contents: string | Buffer) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, contents)
  }

  function writeSources(options: { laneManifest?: unknown; signInPage?: string } = {}) {
    write(laneManifestFile(), JSON.stringify(options.laneManifest ?? LANES, null, 2))
    write(
      path.join(sourcesDir(), 'app', 'sign-in', '[[...rest]]', 'page.tsx'),
      options.signInPage ?? pageSource('sign-in'),
    )
    write(
      path.join(sourcesDir(), 'app', 'sign-in', '[[...rest]]', 'SignInClient.tsx'),
      clientSource(SIGN_IN_MARKER),
    )
    write(
      path.join(sourcesDir(), 'app', 'sign-up', '[[...rest]]', 'page.tsx'),
      pageSource('sign-up'),
    )
    write(
      path.join(sourcesDir(), 'app', 'sign-up', '[[...rest]]', 'SignUpClient.tsx'),
      clientSource(SIGN_UP_MARKER),
    )
  }

  function writeCacheEntry(key: string, payload: string | Buffer) {
    write(path.join(buildDir(), `${key}.cache`), payload)
  }

  /** Every lane document published with its real shell text. */
  function writeAllLaneEntries(options: { gzip?: boolean; baseKey?: 'plain' | 'index' } = {}) {
    for (const shellPath of laneShellPaths()) {
      const marker = shellPath.startsWith('/sign-up') ? SIGN_UP_MARKER : SIGN_IN_MARKER
      const plain = shellPath === '/sign-in' || shellPath === '/sign-up'
      const key = plain && options.baseKey === 'index' ? `${shellPath.slice(1)}/index` : shellPath.slice(1)
      const payload = JSON.stringify({ html: `<main>${marker}</main>` })
      writeCacheEntry(key, options.gzip ? gzipSync(Buffer.from(payload)) : payload)
    }
    // Unrelated estate entries prove the gate is not confused by neighbours.
    writeCacheEntry('marketplace', JSON.stringify({ html: '<main>marketplace</main>' }))
    writeCacheEntry('marketplace/gigs', JSON.stringify({ html: '<main>gigs</main>' }))
  }

  function writeManifest(routes: string[]) {
    write(
      manifestFile(),
      JSON.stringify({ version: 4, routes: Object.fromEntries(routes.map((r) => [r, { srcRoute: null }])) }),
    )
  }

  function runGate() {
    return spawnSync(
      process.execPath,
      [
        GATE_SCRIPT_PATH,
        '--assets',
        assetsDir(),
        '--build-id',
        BUILD_ID,
        '--sources-root',
        sourcesDir(),
        '--next-app-dir',
        nextAppDir(),
        '--prerender-manifest',
        manifestFile(),
      ],
      { cwd: root, encoding: 'utf8' },
    )
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yousafe-auth-lane-cache-'))
    writeSources()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('passes when every lane document is published with its shell text', () => {
    writeAllLaneEntries()

    const result = runGate()

    expect(result.stderr).not.toContain('ERROR')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('auth-lane document "/sign-in/student" published as "sign-in/student.cache"')
    expect(result.stdout).toContain('auth-lane document "/sign-up/attorney" published as "sign-up/attorney.cache"')
    expect(result.stdout).toContain('document text verified')
    expect(result.stdout).toContain('verified 11 auth-lane documents')
  })

  test('accepts gzip payloads and the <path>/index key form', () => {
    writeAllLaneEntries({ gzip: true, baseKey: 'index' })

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('published as "sign-in/index.cache"')
    expect(result.stdout).toContain('verified 11 auth-lane documents')
  })

  test('fails closed when one lane document is missing from the published cache', () => {
    writeAllLaneEntries()
    fs.rmSync(path.join(buildDir(), 'sign-in/admin.cache'))

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('"/sign-in/admin" is not published')
    expect(result.stderr).toContain('sign-in/admin.cache')
  })

  test('fails closed when a lane entry exists without the lane document text', () => {
    writeAllLaneEntries()
    writeCacheEntry('sign-in/student', JSON.stringify({ html: '<main>something else</main>' }))

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('none contains the lane shell copy')
  })

  test('fails closed when the lane family copy cannot be read from its client', () => {
    writeAllLaneEntries()
    write(
      path.join(sourcesDir(), 'app', 'sign-in', '[[...rest]]', 'SignInClient.tsx'),
      "'use client'\nexport default function Client() { return <div /> }\n",
    )

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('could not read the lane shell copy')
  })

  test('fails closed when the prerender manifest omits a lane document', () => {
    writeAllLaneEntries()
    writeManifest(['/sign-in', '/sign-in/student', '/sign-up', '/sign-up/student'])

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('does not list every auth-lane document')
    expect(result.stderr).toContain('/sign-in/admin')
  })

  test('passes when the prerender manifest lists every lane document', () => {
    writeAllLaneEntries()
    writeManifest(laneShellPaths())

    const result = runGate()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('prerender manifest lists all 11 auth-lane documents')
  })

  test('fails closed when a lane page regrows request-time server work', () => {
    writeAllLaneEntries()
    writeSources({
      signInPage: `import { headers } from 'next/headers'
export const dynamic = 'force-static'
export const dynamicParams = false
export function generateStaticParams() { return [{ rest: [] as string[] }] }
export default function Page() { return null }
`,
    })

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('regained request-time server work')
    expect(result.stderr).toContain("import from 'next/headers'")
  })

  test('fails closed on each individual static-render contract loss', () => {
    writeAllLaneEntries()

    const cases: Array<[string, string, string]> = [
      [
        'lost force-static',
        `import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
export const dynamicParams = false
export function generateStaticParams() { return portalAuthLaneRoots('sign-in') }
export default function Page() { return null }
`,
        "no longer pins `export const dynamic = 'force-static'`",
      ],
      [
        'lost dynamicParams=false',
        `import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
export const dynamic = 'force-static'
export function generateStaticParams() { return portalAuthLaneRoots('sign-in') }
export default function Page() { return null }
`,
        'no longer pins `export const dynamicParams = false`',
      ],
      [
        'lost generateStaticParams',
        `import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
export const dynamic = 'force-static'
export const dynamicParams = false
export default function Page() { return null }
`,
        'lost generateStaticParams()',
      ],
      [
        'lost the shared lane enumeration',
        `export const dynamic = 'force-static'
export const dynamicParams = false
export function generateStaticParams() { return [{ rest: [] as string[] }] }
export default function Page() { return null }
`,
        'no longer enumerates lanes from',
      ],
    ]

    for (const [label, source, expected] of cases) {
      writeSources({ signInPage: source })
      const result = runGate()
      expect(`${label}:${result.status}`).toBe(`${label}:1`)
      expect(`${label}:${result.stderr.includes(expected)}`).toBe(`${label}:true`)
    }
  })

  test('fails closed when the lane manifest is missing or loses the student default', () => {
    writeAllLaneEntries()
    fs.rmSync(laneManifestFile())
    const missingResult = runGate()
    expect(missingResult.status).toBe(1)
    expect(missingResult.stderr).toContain('lane manifest not found')

    writeSources({ laneManifest: { 'sign-in': ['attorney'], 'sign-up': ['student'] } })
    const orderResult = runGate()
    expect(orderResult.status).toBe(1)
    expect(orderResult.stderr).toContain('must start with the canonical "student" lane')
  })

  test('fails closed when the published cache is empty', () => {
    fs.mkdirSync(buildDir(), { recursive: true })

    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('contains no cache entries')
  })

  test('fails closed when the published cache directory is missing', () => {
    const result = runGate()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('published static incremental cache directory is missing')
  })
})

describe('deploy wiring for the auth-lane gate', () => {
  test('the gate runs where the prerender cache is published, before the deploy', () => {
    const populateStep = deployStep(POPULATE_STEP_NAME)
    const deployIndex = workflow.indexOf('- name: Deploy via OpenNext to Cloudflare')
    const gateIndex = workflow.indexOf(`node ${GATE_SCRIPT}`)

    expect(populateStep).toContain(`node ${GATE_SCRIPT}`)
    expect(populateStep).toContain('node scripts/verify-portal-root-static-cache.mjs')
    // Order inside the step: populate, then both gates, then the marketplace keys.
    expect(populateStep.indexOf('npm run populate:static-incremental-cache')).toBeLessThan(
      populateStep.indexOf(`node ${GATE_SCRIPT}`),
    )
    expect(gateIndex).toBeGreaterThan(-1)
    // The publish step sits after the build that produced the cache…
    expect(workflow.indexOf(`- name: ${POPULATE_STEP_NAME}`)).toBeGreaterThan(
      workflow.indexOf('- name: Build (Next + OpenNext)'),
    )
    // …and strictly before the deploy, so an unpublished lane can never ship.
    expect(deployIndex).toBeGreaterThan(gateIndex)
  })

  test('the gate is not skipped on pull requests, so CI classifies the lanes', () => {
    // The build + gate steps run on PRs too (the deploy step is the PR-guarded
    // one), which is how the prerender classification is proven before a merge.
    expect(deployStep(POPULATE_STEP_NAME)).not.toContain('if:')
    expect(deployStep('Deploy via OpenNext to Cloudflare (with transient-failure retry)')).toContain(
      "if: github.event_name != 'pull_request'",
    )
  })

  test('the deploy workflow is the single authority for publishing and gating', () => {
    const pkg = JSON.parse(readRepo('package.json')) as { scripts: Record<string, string> }
    // A `postbuild` hook would populate + gate a SECOND time on every
    // `npm run build` — including the workflow's own build step — so the build
    // script stays plain and the workflow keeps exactly one gate invocation.
    expect(pkg.scripts.postbuild).toBeUndefined()
    expect(pkg.scripts.build).toContain('next build --webpack')
    expect(pkg.scripts.build).toContain('opennextjs-cloudflare build --skipNextBuild')
    expect(pkg.scripts.build).not.toContain(GATE_SCRIPT)
    expect(deployStep('Build (Next + OpenNext)')).not.toContain(GATE_SCRIPT)
    expect(workflow.split(`node ${GATE_SCRIPT}`).length - 1).toBe(1)
    expect(fs.existsSync(GATE_SCRIPT_PATH)).toBe(true)
  })
})
