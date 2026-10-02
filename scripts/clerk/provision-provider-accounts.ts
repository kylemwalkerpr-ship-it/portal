/**
 * Provision Clerk accounts for marketplace providers (attorneys/consultants).
 *
 *   npx tsx scripts/clerk/provision-provider-accounts.ts            # dry run (default)
 *   npx tsx scripts/clerk/provision-provider-accounts.ts --check    # dry run + instance capability check
 *   npx tsx scripts/clerk/provision-provider-accounts.ts --apply [--allow-production]
 *
 * Options:
 *   --only a,b        limit to these profiles.username values
 *   --limit N         process at most N "create"/"link" items
 *   --out PATH        credentials CSV (default /home/box/private/provider-credentials-<date>.csv)
 *   --providers-json  read providers from a JSON file instead of Supabase (read-only planning)
 *   --frontend-api U  Clerk Frontend API origin for --check (default: derived from
 *                     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, else https://clerk.portal.yousafeconsultancy.com)
 *
 * Env: CLERK_SECRET_KEY. Optional SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (direct
 * read + relink). Without them, pass --providers-json (fresh export of
 * profiles via Supabase MCP) and the relink is emitted as SQL files
 * (1-backup / 2-relink / 3-restore, all 0600 next to the CSV) to run through
 * the Supabase MCP execute_sql tool: backup first, then relink.
 *
 * Safety:
 *   - Dry run unless --apply. Dry run performs only GET requests.
 *   - Refuses an sk_live_ key with --apply unless --allow-production.
 *   - Refuses --apply when username-only creates are planned but the instance
 *     does not accept them (username disabled or email required).
 *   - Never sends placeholder emails (*.invalid) to Clerk.
 *   - Temporary passwords are written ONLY to the CSV (dir 0700, file 0600,
 *     opened with O_EXCL so an existing file is never overwritten), outside
 *     the repo, and are never logged.
 *   - Idempotent: profiles already linked to a user_ id are skipped; a Clerk
 *     user whose external_id is the profile id is linked, not re-created.
 */
import { randomInt } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  CREDENTIALS_CSV_HEADER,
  type ClerkUserLite,
  createUserBody,
  credentialsCsvLine,
  credentialsPath,
  frontendApiFromPublishableKey,
  generateTempPassword,
  isProductionSecretKey,
  type PlanItem,
  planProvisioning,
  type ProviderProfile,
  summarizePlan,
  usernameOnlySupport,
  backupProfilesSql,
  type ProfileLink,
  relinkProfilesSql,
  restoreProfilesSql,
} from '../../lib/clerk/providerProvisioning'

const CLERK_API = 'https://api.clerk.com/v1'
const SIGN_IN_URL = 'https://portal.yousafeconsultancy.com/sign-in'

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}
const flag = (name: string) => process.argv.includes(name)

function die(message: string): never {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

async function clerk(method: string, pathname: string, body?: unknown): Promise<any> {
  const res = await fetch(`${CLERK_API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    const detail = json?.errors?.map((e: any) => `${e.code}: ${e.long_message || e.message}`).join('; ') || res.statusText
    const err = new Error(`Clerk ${method} ${pathname.split('?')[0]} -> ${res.status} ${detail}`)
    ;(err as any).status = res.status
    throw err
  }
  return json
}

async function listClerkUsers(): Promise<ClerkUserLite[]> {
  const out: ClerkUserLite[] = []
  for (let offset = 0; ; offset += 500) {
    const page = (await clerk('GET', `/users?limit=500&offset=${offset}&order_by=created_at`)) as any[]
    for (const u of page) {
      out.push({
        id: u.id,
        username: u.username ?? null,
        external_id: u.external_id ?? null,
        email_addresses: (u.email_addresses ?? []).map((e: any) => String(e.email_address).toLowerCase()),
      })
    }
    if (page.length < 500) return out
  }
}

async function loadProviders(): Promise<{ providers: ProviderProfile[]; db: any | null }> {
  const jsonPath = arg('--providers-json')
  if (jsonPath) {
    const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ProviderProfile[]
    return { providers: rows.filter((r) => r.role === 'attorney' || r.role === 'consultant'), db: null }
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --providers-json).')
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await db
    .from('profiles')
    .select('id, username, email, full_name, role, status, clerk_user_id')
    .in('role', ['attorney', 'consultant'])
    .order('username', { ascending: true })
  if (error) die(`Supabase read failed: ${error.message}`)
  return { providers: (data ?? []) as ProviderProfile[], db }
}

async function instanceCheck() {
  const origin =
    arg('--frontend-api') ||
    frontendApiFromPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ||
    'https://clerk.portal.yousafeconsultancy.com'
  const res = await fetch(`${origin}/v1/environment`, { headers: { Origin: 'https://portal.yousafeconsultancy.com' } })
  if (!res.ok) throw new Error(`Frontend API environment -> ${res.status}`)
  return { origin, ...usernameOnlySupport(await res.json()) }
}

function printPlan(plan: PlanItem[]) {
  for (const p of plan) {
    const mode = p.action === 'create' ? (p.email ? 'username+email' : 'username-only') : ''
    console.log(
      [p.action.padEnd(13), (p.username ?? '-').padEnd(34), p.role.padEnd(10), (p.status ?? '-').padEnd(9), mode.padEnd(14), p.clerkUserId ?? '', p.reason ?? '']
        .join(' ')
        .trimEnd(),
    )
  }
}

async function main() {
  const apply = flag('--apply')
  const key = process.env.CLERK_SECRET_KEY
  if (!key) die('CLERK_SECRET_KEY is required.')
  if (apply && isProductionSecretKey(key) && !flag('--allow-production')) {
    die('Refusing to write to a PRODUCTION Clerk instance (sk_live_) without --allow-production.')
  }

  const { providers, db } = await loadProviders()
  const only = arg('--only')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const scoped = only ? providers.filter((p) => only.includes((p.username ?? '').toLowerCase())) : providers
  const clerkUsers = await listClerkUsers()
  const plan = planProvisioning(scoped, clerkUsers)
  const summary = summarizePlan(plan)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'} · instance: ${isProductionSecretKey(key) ? 'production' : 'development'} · Clerk users: ${clerkUsers.length} · providers: ${scoped.length}`)
  printPlan(plan)
  console.log('Summary:', JSON.stringify(summary))
  console.log(`Profile relink mode: ${db ? 'direct (service-role key present)' : 'SQL files for Supabase MCP execute_sql (backup -> relink -> restore)'}`)

  let capability: Awaited<ReturnType<typeof instanceCheck>> | null = null
  if (flag('--check') || apply) {
    try {
      capability = await instanceCheck()
      console.log('Instance settings:', JSON.stringify(capability))
    } catch (e) {
      console.warn(`Instance check failed: ${(e as Error).message}`)
    }
  }

  if (!apply) {
    console.log('Dry run only: nothing was created, updated or written. Re-run with --apply to provision.')
    return
  }
  // Without Supabase credentials (the normal case on the operator box) the
  // relink is NOT done here: Clerk users are created, then link SQL files are
  // written next to the credentials CSV for the Supabase MCP (execute_sql).
  const linkMode: 'db' | 'sql' = db ? 'db' : 'sql'
  if (summary.username_only > 0 && !capability?.usernameOnlyAccepted) {
    die('Instance does not accept username-only users yet (enable Username, make Email optional, keep Password on). Nothing was written.')
  }

  const limit = Number(arg('--limit') ?? Infinity)
  const work = plan.filter((p) => p.action === 'create' || p.action === 'link_existing').slice(0, limit)
  if (work.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const issuedAt = new Date()
  const outPath = arg('--out') || credentialsPath(issuedAt)
  const resolved = path.resolve(outPath)
  if (resolved.startsWith(path.resolve(process.cwd()) + path.sep)) die('Refusing to write credentials inside the repository.')
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 })
  fs.chmodSync(path.dirname(resolved), 0o700)
  const fd = fs.openSync(resolved, 'wx', 0o600) // throws if the file exists
  fs.writeSync(fd, credentialsCsvLine(CREDENTIALS_CSV_HEADER))

  const fullNames = new Map(scoped.map((p) => [p.id, p.full_name]))
  const previousIds = new Map(scoped.map((p) => [p.id, p.clerk_user_id]))
  const links: ProfileLink[] = []
  let created = 0
  let linked = 0
  const failures: string[] = []
  try {
    for (const item of work) {
      try {
        let clerkUserId = item.clerkUserId
        if (item.action === 'create') {
          const password = generateTempPassword(randomInt)
          const user = await clerk('POST', '/users', createUserBody(item, fullNames.get(item.profileId) ?? null, password, issuedAt))
          clerkUserId = user.id
          const meta = user.public_metadata ?? {}
          fs.writeSync(fd, credentialsCsvLine([item.profileId, fullNames.get(item.profileId) ?? '', item.role, item.username, item.email ?? '', password, clerkUserId, SIGN_IN_URL, meta.tempPasswordIssuedAt, meta.tempPasswordExpiresAt]))
          fs.fsyncSync(fd)
          created += 1
        } else {
          // Created by an earlier run (external_id match): verify, then link only.
          await clerk('GET', `/users/${encodeURIComponent(clerkUserId as string)}`)
          linked += 1
        }
        links.push({ profileId: item.profileId, clerkUserId: clerkUserId as string, previousClerkUserId: previousIds.get(item.profileId) ?? null })
        if (linkMode === 'db') {
          const { error } = await db
            .from('profiles')
            .update({ clerk_user_id: clerkUserId })
            .eq('id', item.profileId)
            .not('clerk_user_id', 'like', 'user_%')
          if (error) throw new Error(`profile link failed: ${error.message}`)
        }
        console.log(`ok   ${item.action.padEnd(13)} ${item.username} -> ${clerkUserId}`)
      } catch (e) {
        failures.push(`${item.username}: ${(e as Error).message}`)
        console.error(`FAIL ${item.action.padEnd(13)} ${item.username}: ${(e as Error).message}`)
      }
    }
  } finally {
    fs.closeSync(fd)
  }
  if (linkMode === 'sql') {
    const stamp = issuedAt.toISOString().replace(/[:.]/g, '-')
    const dir = path.dirname(resolved)
    const write = (name: string, body: string) => {
      const file = path.join(dir, name)
      const handle = fs.openSync(file, 'wx', 0o600)
      fs.writeSync(handle, `${body}\n`)
      fs.closeSync(handle)
      return file
    }
    const ids = links.map((l) => l.profileId)
    const files = [
      write(`provider-relink-${stamp}.1-backup.sql`, backupProfilesSql(ids.length ? ids : scoped.map((p) => p.id))),
      write(`provider-relink-${stamp}.2-relink.sql`, relinkProfilesSql(links)),
      write(`provider-relink-${stamp}.3-restore.sql`, restoreProfilesSql(links)),
      write(`provider-relink-${stamp}.links.json`, JSON.stringify(links, null, 2)),
    ]
    console.log(`Profiles NOT relinked yet (no Supabase credentials). Run via Supabase MCP execute_sql, in order:`)
    for (const f of files) console.log(`  ${f}`)
  }
  console.log(`Done. created=${created} linked=${linked} failed=${failures.length}. Credentials: ${resolved} (0600).`)
  if (failures.length) process.exitCode = 2
}

main().catch((e) => die((e as Error).message))
