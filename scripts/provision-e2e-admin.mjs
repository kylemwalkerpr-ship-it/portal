#!/usr/bin/env node
/**
 * provision-e2e-admin.mjs
 *
 * Creates (or reuses) the dedicated E2E admin account that the Playwright
 * gsc-connect suite signs in as, then wires the credentials into the
 * gitignored `.env.test` so `CLERK_TEST_EMAIL` + `CLERK_TEST_PASSWORD` +
 * `CLERK_SECRET_KEY` are available to every future run.
 *
 *   - Clerk side:  POST https://api.clerk.com/v1/users  (email + password,
 *                  idempotent — reuses an existing user with the same email).
 *   - Supabase side: upserts `public.profiles` row keyed on clerk_user_id
 *                  with role='admin', status='active' (service-role client,
 *                  mirroring what the app's own Clerk webhook writes).
 *   - .env.test:   overwrites the CLERK_TEST_* + CLERK_SECRET_KEY lines
 *                  in-place (file is gitignored — credentials never enter
 *                  git).
 *
 * Reads CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from .env.local. Never prints secrets — only
 * non-sensitive identifiers (user id, email, profile id).
 *
 * Usage:  node scripts/provision-e2e-admin.mjs
 *         E2E_ADMIN_EMAIL=admin@example.com node scripts/provision-e2e-admin.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── Config ────────────────────────────────────────────────────────────────
const E2E_ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL || 'e2e-admin@yousafeconsultancy.com').trim().toLowerCase()
const E2E_ADMIN_FULL_NAME = 'E2E Admin'
// Stable password: reuse an existing CLERK_TEST_PASSWORD from .env.test when
// present (idempotent re-runs must NOT rotate the password — a rotation
// invalidates every CI cache and, worse, half-failed runs have created users
// whose actual password differs from what was written to .env.test).
// Otherwise generate a 24-char random one for the first-ever run.
const existingPw = existsSync(path.join(ROOT, '.env.test'))
  ? (readFileSync(path.join(ROOT, '.env.test'), 'utf8').match(/^CLERK_TEST_PASSWORD=(.*)$/m)?.[1] ?? null)
  : null
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || existingPw || `E2e${randomBytes(12).toString('base64url')}A1!`

function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const localEnv = loadEnv(path.join(ROOT, '.env.local'))
const CLERK_SECRET_KEY = localEnv.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY
const SUPABASE_URL = localEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
let SERVICE_ROLE_KEY = localEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || localEnv.SUPABASE_ACCESS_TOKEN

const fail = (msg) => {
  console.error(`✕ ${msg}`)
  process.exit(1)
}
if (!CLERK_SECRET_KEY) fail('CLERK_SECRET_KEY missing (set it in .env.local)')
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (set in .env.local)')

// The stored service-role key can go stale (rotated / re-issued in the
// dashboard — e.g. a new-format sb_secret_* that isn't registered for the
// project). Self-heal: when it's rejected, re-issue via the Management API
// using the project's access token (SUPABASE_ACCESS_TOKEN).
async function resolveServiceRoleKey() {
  const probe = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (probe.ok) return SERVICE_ROLE_KEY
  if (!SUPABASE_ACCESS_TOKEN) return SERVICE_ROLE_KEY // let the real write surface the error
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  })
  if (!res.ok) {
    console.log(`  ⚠ stored service-role key rejected and Management API fetch failed (${res.status}) — trying the stored key anyway`)
    return SERVICE_ROLE_KEY
  }
  const keys = await res.json()
  const sr = Array.isArray(keys) ? keys.find((k) => k.name === 'service_role') : null
  if (!sr?.api_key) {
    console.log('  ⚠ Management API returned no service_role key — trying the stored key anyway')
    return SERVICE_ROLE_KEY
  }
  console.log('  ✓ stale service-role key detected — re-issued from Management API')
  return sr.api_key
}

SERVICE_ROLE_KEY = await resolveServiceRoleKey()

const json = (res) => res.json().catch(() => ({}))
const hdrs = { Authorization: `Bearer ${CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' }

// ── 1. Clerk user (idempotent) ────────────────────────────────────────────
console.log(`→ Clerk: ensuring ${E2E_ADMIN_EMAIL}`)
let clerkUserId = null

const existing = await json(
  await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(E2E_ADMIN_EMAIL)}`, { headers: hdrs }),
)
if (Array.isArray(existing) && existing.length > 0) {
  clerkUserId = existing[0].id
  console.log(`  ✓ reused existing user ${clerkUserId}`)
  // Idempotency hazard: an earlier run may have created this user with a
  // DIFFERENT random password (e.g. it failed before writing .env.test).
  // Always resync the password so the creds in .env.test are authoritative.
  const patch = await json(
    await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      method: 'PATCH',
      headers: hdrs,
      // skip_password_checks: without it the PATCH reports success but the
      // password silently never changes (observed live — verify_password kept
      // failing until this flag was added).
      body: JSON.stringify({ password: E2E_ADMIN_PASSWORD, skip_password_checks: true }),
    }),
  )
  if (!patch.id) {
    console.log(`  ⚠ password resync failed: ${JSON.stringify(patch).slice(0, 200)} — continuing with current creds`)
  } else {
    console.log('  ✓ password resynced to match .env.test')
  }
} else {
  const created = await json(
    await fetch('https://api.clerk.com/v1/users', {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        email_address: [E2E_ADMIN_EMAIL],
        password: E2E_ADMIN_PASSWORD,
        first_name: 'E2E',
        last_name: 'Admin',
        public_metadata: { e2e: true, purpose: 'playwright gsc-connect suite' },
      }),
    }),
  )
  if (!created.id) fail(`Clerk user creation failed: ${JSON.stringify(created).slice(0, 300)}`)
  clerkUserId = created.id
  console.log(`  ✓ created user ${clerkUserId}`)
}

// ── 2. Supabase profile (role=admin, active) ──────────────────────────────
console.log('→ Supabase: upserting admin profile row')
const sbHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}
// Upsert keyed on clerk_user_id (not the primary key) — pass on_conflict so
// merge-duplicates targets the unique clerk_user_id constraint.
const upserted = await json(
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=clerk_user_id`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({
      clerk_user_id: clerkUserId,
      email: E2E_ADMIN_EMAIL,
      full_name: E2E_ADMIN_FULL_NAME,
      role: 'admin',
      status: 'active',
    }),
  }),
)
const profile = Array.isArray(upserted) ? upserted[0] : upserted
if (!profile?.id) fail(`Profile upsert failed: ${JSON.stringify(upserted).slice(0, 300)}`)
console.log(`  ✓ profile ${profile.id} · role=${profile.role} · status=${profile.status}`)

// ── 3. Patch CLERK_TEST_* + CLERK_SECRET_KEY into .env.test (gitignored) ──
console.log('→ .env.test: patching credentials in-place')
const envTestPath = path.join(ROOT, '.env.test')
let envTest = existsSync(envTestPath) ? readFileSync(envTestPath, 'utf8') : ''

// Remove any existing CLERK_TEST_EMAIL, CLERK_TEST_PASSWORD, CLERK_SECRET_KEY lines.
const lines = envTest.split('\n')
const cleaned = lines.filter((l) => {
  if (!l) return false // also drop blank lines
  return !l.startsWith('CLERK_TEST_EMAIL=') &&
         !l.startsWith('CLERK_TEST_PASSWORD=') &&
         !l.startsWith('CLERK_SECRET_KEY=')
})
// Rejoin — strip trailing blank lines
let result = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
if (result) result += '\n'
result += `\n# E2E admin (provisioned by scripts/provision-e2e-admin.mjs)\n`
result += `CLERK_TEST_EMAIL=${E2E_ADMIN_EMAIL}\n`
result += `CLERK_TEST_PASSWORD=${E2E_ADMIN_PASSWORD}\n`
result += `CLERK_SECRET_KEY=${CLERK_SECRET_KEY}\n`
writeFileSync(envTestPath, result)
console.log('  ✓ CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY written')

console.log('\n✅ E2E admin provisioned — Playwright suite will now run live:')
console.log(`   email:    ${E2E_ADMIN_EMAIL}`)
console.log(`   clerkId:  ${clerkUserId}`)
console.log(`   profile:  ${profile.id}`)