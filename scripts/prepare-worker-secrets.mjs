/**
 * Prepare ONE ephemeral JSON file with every Worker secret that the production
 * workflow syncs, so `wrangler deploy --secrets-file` can publish code and
 * secrets atomically in the same Worker Version. Cloudflare preserves omitted
 * secrets, so a value that is not configured here is never deleted.
 *
 * SECURITY
 * --------
 * - CLOUDFLARE_API_TOKEN is NEVER written: the deploy credential must not
 *   become runtime state. Any accidental map entry for it fails the script.
 * - The file must live under RUNNER_TEMP and is chmodded to 0600.
 * - Values are never printed; only a count is logged.
 */

import fs from 'node:fs'
import path from 'node:path'

const env = process.env

const isSet = (value) => typeof value === 'string' && value.length > 0
const firstSet = (...values) => values.find(isSet)

/**
 * Output name → resolver. Resolvers mirror the exact alias/default/skip-unset
 * semantics of the retired `put_secret` loop in deploy.yml:
 * - a fallback chain uses the first non-empty value (`${A:-${B:-$C}}`)
 * - an unset/empty value omits the secret entirely (Cloudflare keeps the old one)
 */
const SECRET_SOURCES = {
  GROQ_API_KEY: () => env.GROQ_API_KEY,
  GEMINI_API_KEY: () => env.GEMINI_API_KEY,
  CLOUDFLARE_ACCOUNT_ID: () => env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_AI_TOKEN: () => env.CLOUDFLARE_AI_TOKEN,
  OPENROUTER_API_KEY: () => env.OPENROUTER_API_KEY,
  GSC_OAUTH_CLIENT_ID: () =>
    firstSet(env.GSC_OAUTH_CLIENT_ID, env.GOOGLE_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_ID),
  GSC_OAUTH_CLIENT_SECRET: () =>
    firstSet(env.GSC_OAUTH_CLIENT_SECRET, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_OAUTH_CLIENT_SECRET),
  GSC_OAUTH_REFRESH_TOKEN: () => env.GSC_OAUTH_REFRESH_TOKEN,
  GSC_SITE_URL: () => env.GSC_SITE_URL,
  GSC_SERVICE_ACCOUNT_JSON: () => env.GSC_SERVICE_ACCOUNT_JSON,
  // Pinned literally to the commissioned registry default. Never interpolate
  // the CONTENT_AI_PROVIDER GitHub secret — a leftover/rotated value must not
  // re-pin a retired host ahead of a code deploy.
  CONTENT_AI_PROVIDER: () => 'grok',
  XAI_API_KEY: () => env.XAI_API_KEY,
  XAI_MODEL: () => env.XAI_MODEL,
  DEEPSEEK_API_KEY: () => env.DEEPSEEK_API_KEY,
  DATAFORSEO_LOGIN: () => env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: () => env.DATAFORSEO_PASSWORD,
  GOOGLE_CLIENT_ID: () =>
    firstSet(env.GOOGLE_CLIENT_ID, env.GSC_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: () =>
    firstSet(env.GOOGLE_CLIENT_SECRET, env.GSC_OAUTH_CLIENT_SECRET, env.GOOGLE_OAUTH_CLIENT_SECRET),
  GITHUB_TOKEN: () => firstSet(env.CONTENT_STUDIO_GITHUB_TOKEN, env.GITHUB_TOKEN_CONTENT),
  CRON_SECRET: () => env.CRON_SECRET,
  CLERK_SECRET_KEY: () => env.CLERK_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: () => env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SERVICE_ROLE_JWT: () => env.SUPABASE_SERVICE_ROLE_JWT,
  RESEND_API_KEY: () => env.RESEND_API_KEY,
  NMI_SECURITY_KEY: () => env.NMI_SECURITY_KEY,
}

const outArg = process.argv[2] || ''
if (!outArg) {
  console.error('Missing output path: prepare-worker-secrets.mjs <path-under-RUNNER_TEMP>')
  process.exit(1)
}

const runnerTemp = env.RUNNER_TEMP || ''
if (!runnerTemp) {
  console.error('RUNNER_TEMP is not set — refusing to write Worker secrets outside the runner temp directory.')
  process.exit(1)
}

const outPath = path.resolve(outArg)
const runnerRoot = path.resolve(runnerTemp)
if (!outPath.startsWith(runnerRoot + path.sep)) {
  console.error(`Refusing to write Worker secrets outside RUNNER_TEMP (${runnerRoot}).`)
  process.exit(1)
}

const secrets = {}
for (const [name, resolve] of Object.entries(SECRET_SOURCES)) {
  const value = resolve()
  if (isSet(value)) {
    secrets[name] = value
  }
}

if (Object.prototype.hasOwnProperty.call(secrets, 'CLOUDFLARE_API_TOKEN')) {
  console.error('Refusing to write CLOUDFLARE_API_TOKEN as a Worker runtime secret.')
  process.exit(1)
}

fs.writeFileSync(outPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 })
fs.chmodSync(outPath, 0o600)

console.log(`Prepared ${Object.keys(secrets).length} Worker secrets for atomic deployment (values not logged).`)
