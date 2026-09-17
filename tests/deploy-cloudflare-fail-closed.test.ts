import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const prepareScript = path.join(root, 'scripts', 'prepare-worker-secrets.mjs')

const EXPECTED_FULL_KEYS = [
  'CLERK_SECRET_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_TOKEN',
  'CONTENT_AI_PROVIDER',
  'CRON_SECRET',
  'DATAFORSEO_LOGIN',
  'DATAFORSEO_PASSWORD',
  'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GROQ_API_KEY',
  'GSC_OAUTH_CLIENT_ID',
  'GSC_OAUTH_CLIENT_SECRET',
  'GSC_OAUTH_REFRESH_TOKEN',
  'GSC_SERVICE_ACCOUNT_JSON',
  'GSC_SITE_URL',
  'NMI_SECURITY_KEY',
  'OPENROUTER_API_KEY',
  'RESEND_API_KEY',
  'SUPABASE_SERVICE_ROLE_JWT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'XAI_API_KEY',
  'XAI_MODEL',
].sort()

const ALL_SOURCES: Record<string, string> = {
  CLOUDFLARE_ACCOUNT_ID: 'acct-123',
  CLOUDFLARE_API_TOKEN: 'deploy-token-should-never-be-synced',
  CLOUDFLARE_AI_TOKEN: 'cf-ai-token',
  GROQ_API_KEY: 'groq-key',
  GEMINI_API_KEY: 'gemini-key',
  OPENROUTER_API_KEY: 'openrouter-key',
  GSC_OAUTH_CLIENT_ID: 'gsc-oauth-id',
  GSC_OAUTH_CLIENT_SECRET: 'gsc-oauth-secret',
  GSC_OAUTH_REFRESH_TOKEN: 'gsc-oauth-refresh',
  GSC_SITE_URL: 'https://portal.yousafeconsultancy.com',
  GSC_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
  XAI_API_KEY: 'xai-key',
  XAI_MODEL: 'grok-4.6',
  DEEPSEEK_API_KEY: 'deepseek-key',
  DATAFORSEO_LOGIN: 'dataforseo-login',
  DATAFORSEO_PASSWORD: 'dataforseo-password',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_OAUTH_CLIENT_ID: 'google-oauth-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-secret',
  CONTENT_STUDIO_GITHUB_TOKEN: 'content-studio-pat',
  GITHUB_TOKEN_CONTENT: 'github-token-content',
  CRON_SECRET: 'cron-secret',
  CLERK_SECRET_KEY: 'clerk-secret-key',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase-service-role-key',
  SUPABASE_SERVICE_ROLE_JWT: 'supabase-service-role-jwt',
  RESEND_API_KEY: 'resend-api-key',
  NMI_SECURITY_KEY: 'nmi-security-key',
}

describe('prepare-worker-secrets.mjs (atomic Worker secret file)', () => {
  let tmpDir: string
  let runnerTemp: string
  let outFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yousafe-worker-secrets-'))
    runnerTemp = path.join(tmpDir, 'runner-temp')
    fs.mkdirSync(runnerTemp)
    outFile = path.join(runnerTemp, 'worker-secrets.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function runPrepare(envVars: Record<string, string | undefined>, outPath: string | null = outFile) {
    const env: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      RUNNER_TEMP: runnerTemp,
      ...envVars,
    }
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete env[key]
    }
    const args = [prepareScript]
    if (outPath !== null) args.push(outPath)
    return spawnSync(process.execPath, args, { encoding: 'utf8', env: env as NodeJS.ProcessEnv })
  }

  test('writes a 0600 secrets file using every intentionally synced Worker secret', () => {
    const result = runPrepare(ALL_SOURCES)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('25')
    expect(fs.statSync(outFile).mode & 0o777).toBe(0o600)

    const secrets = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    expect(Object.keys(secrets).sort()).toEqual(EXPECTED_FULL_KEYS)
    expect(secrets.CONTENT_AI_PROVIDER).toBe('grok')
    expect(secrets.GITHUB_TOKEN).toBe('content-studio-pat')
    expect(secrets.CLOUDFLARE_ACCOUNT_ID).toBe('acct-123')
  })

  test('never includes CLOUDFLARE_API_TOKEN nor prints any secret value', () => {
    const result = runPrepare(ALL_SOURCES)

    const raw = fs.readFileSync(outFile, 'utf8')
    const secrets = JSON.parse(raw)
    expect(secrets.CLOUDFLARE_API_TOKEN).toBeUndefined()
    expect(raw).not.toContain('deploy-token-should-never-be-synced')
    const output = `${result.stdout}${result.stderr}`
    for (const value of Object.values(ALL_SOURCES)) {
      expect(output).not.toContain(value)
    }
  })

  test('preserves alias/default fallbacks for Google and GitHub secrets', () => {
    const result = runPrepare({
      GSC_OAUTH_CLIENT_ID: 'gsc-oauth-id',
      GSC_OAUTH_CLIENT_SECRET: 'gsc-oauth-secret',
      GOOGLE_OAUTH_CLIENT_ID: 'google-oauth-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-secret',
      GITHUB_TOKEN_CONTENT: 'fallback-pat',
    })

    expect(result.status).toBe(0)
    const secrets = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    expect(secrets.GOOGLE_CLIENT_ID).toBe('gsc-oauth-id')
    expect(secrets.GOOGLE_CLIENT_SECRET).toBe('gsc-oauth-secret')
    expect(secrets.GSC_OAUTH_CLIENT_ID).toBe('gsc-oauth-id')
    expect(secrets.GSC_OAUTH_CLIENT_SECRET).toBe('gsc-oauth-secret')
    expect(secrets.GITHUB_TOKEN).toBe('fallback-pat')
  })

  test('prefers the direct secret over every alias', () => {
    const result = runPrepare({
      GOOGLE_CLIENT_ID: 'direct-google-id',
      GOOGLE_CLIENT_SECRET: 'direct-google-secret',
      GSC_OAUTH_CLIENT_ID: 'alias-gsc-id',
      GSC_OAUTH_CLIENT_SECRET: 'alias-gsc-secret',
      GOOGLE_OAUTH_CLIENT_ID: 'alias-google-oauth-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'alias-google-oauth-secret',
      CONTENT_STUDIO_GITHUB_TOKEN: 'dedicated-pat',
      GITHUB_TOKEN_CONTENT: 'fallback-pat',
    })

    const secrets = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    expect(secrets.GOOGLE_CLIENT_ID).toBe('direct-google-id')
    expect(secrets.GOOGLE_CLIENT_SECRET).toBe('direct-google-secret')
    expect(secrets.GSC_OAUTH_CLIENT_ID).toBe('alias-gsc-id')
    expect(secrets.GSC_OAUTH_CLIENT_SECRET).toBe('alias-gsc-secret')
    expect(secrets.GITHUB_TOKEN).toBe('dedicated-pat')
  })

  test('omits unset values and keeps CONTENT_AI_PROVIDER pinned to grok', () => {
    const result = runPrepare({ GROQ_API_KEY: 'groq-key', CONTENT_AI_PROVIDER: 'deepseek' })

    expect(result.status).toBe(0)
    const secrets = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    expect(Object.keys(secrets).sort()).toEqual(['CONTENT_AI_PROVIDER', 'GROQ_API_KEY'])
    expect(secrets.CONTENT_AI_PROVIDER).toBe('grok')
  })

  test('refuses to write outside RUNNER_TEMP', () => {
    const outside = path.join(tmpDir, 'outside', 'worker-secrets.json')
    const result = runPrepare(ALL_SOURCES, outside)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/RUNNER_TEMP/)
    expect(fs.existsSync(outside)).toBe(false)
  })

  test('fails closed without an output path', () => {
    const result = runPrepare(ALL_SOURCES, null)

    expect(result.status).not.toBe(0)
  })
})
