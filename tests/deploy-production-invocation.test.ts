import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const deployScript = path.join(root, 'scripts', 'deploy-production.mjs')

const OFFICIAL_CONTEXT = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW: 'Deploy YouSafe Portal',
}

describe('deploy-production.mjs invocation (direct wrangler + atomic secrets)', () => {
  let tmpDir: string
  let binDir: string
  let secretsFile: string
  let argsFile: string
  let envFile: string
  let accountFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yousafe-deploy-'))
    binDir = path.join(tmpDir, 'bin')
    fs.mkdirSync(binDir)
    const fakeNpx = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_NPX_ARGS_FILE"
printf '%s' "\${OPEN_NEXT_DEPLOY:-}" > "$FAKE_NPX_ENV_FILE"
printf '%s' "\${CLOUDFLARE_ACCOUNT_ID:-}" > "$FAKE_NPX_ACCOUNT_FILE"
exit "\${FAKE_NPX_EXIT:-0}"
`
    const fakeNpxPath = path.join(binDir, 'npx')
    fs.writeFileSync(fakeNpxPath, fakeNpx)
    fs.chmodSync(fakeNpxPath, 0o755)
    secretsFile = path.join(tmpDir, 'worker-secrets.json')
    fs.writeFileSync(secretsFile, '{"CLERK_SECRET_KEY":"test-value"}\n', { mode: 0o600 })
    argsFile = path.join(tmpDir, 'args.txt')
    envFile = path.join(tmpDir, 'open-next-deploy.txt')
    accountFile = path.join(tmpDir, 'account.txt')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function runDeploy(overrides: Record<string, string | undefined>) {
    const env: Record<string, string | undefined> = {
      PATH: `${binDir}:${process.env.PATH || ''}`,
      ...OFFICIAL_CONTEXT,
      WORKER_SECRETS_FILE: secretsFile,
      FAKE_NPX_ARGS_FILE: argsFile,
      FAKE_NPX_ENV_FILE: envFile,
      FAKE_NPX_ACCOUNT_FILE: accountFile,
      ...overrides,
    }
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete env[key]
    }
    return spawnSync(process.execPath, [deployScript], {
      encoding: 'utf8',
      env: env as NodeJS.ProcessEnv,
    })
  }

  test('official context invokes exactly npx wrangler deploy with OPEN_NEXT_DEPLOY=true and --secrets-file', () => {
    const result = runDeploy({ CLOUDFLARE_ACCOUNT_ID: 'acct-123' })

    expect(result.status).toBe(0)
    const args = fs.readFileSync(argsFile, 'utf8').split('\n').filter(Boolean)
    expect(args).toEqual(['wrangler', 'deploy', '--secrets-file', secretsFile])
    expect(args).not.toContain('opennextjs-cloudflare')
    expect(fs.readFileSync(envFile, 'utf8')).toBe('true')
    expect(fs.readFileSync(accountFile, 'utf8')).toBe('acct-123')
  })

  test.each([
    ['missing GitHub Actions context', { GITHUB_ACTIONS: undefined }],
    ['wrong ref', { GITHUB_REF: 'refs/heads/feature-branch' }],
    ['wrong workflow', { GITHUB_WORKFLOW: 'Some Other Workflow' }],
  ])('blocks %s before any child process', (_label, overrides) => {
    const result = runDeploy(overrides)

    expect(result.status).toBe(78)
    expect(result.stderr).toContain('Production deploy blocked.')
    expect(fs.existsSync(argsFile)).toBe(false)
  })

  test('propagates a nonzero child exit status', () => {
    const result = runDeploy({ FAKE_NPX_EXIT: '42' })

    expect(result.status).toBe(42)
  })

  test('fails closed when WORKER_SECRETS_FILE is not provided', () => {
    const result = runDeploy({ WORKER_SECRETS_FILE: undefined })

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(argsFile)).toBe(false)
  })

  test('fails closed when the secrets file path does not exist', () => {
    const result = runDeploy({ WORKER_SECRETS_FILE: path.join(tmpDir, 'missing-secrets.json') })

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(argsFile)).toBe(false)
  })
})
