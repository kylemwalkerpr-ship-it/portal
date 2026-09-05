#!/usr/bin/env node
/**
 * Approve a Content Studio job via the real production PATCH API
 * (action: 'approve') using a Clerk sign-in session — same path as the UI.
 * Does NOT bypass jobPassesShipGate (server enforces).
 *
 * Usage: node scripts/approve-job-session.mjs <jobId>
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const env = parse(readFileSync(resolve(root, '.env.local'), 'utf8'))
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] == null) process.env[k] = v
}

const PORTAL = process.env.CONTENT_STUDIO_PORTAL_URL || 'https://portal.yousafeconsultancy.com'
const ADMIN_ID = process.env.CONTENT_STUDIO_ADMIN_USER_ID || 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm'
const jobId = process.argv[2]
if (!jobId) {
  console.error('usage: node scripts/approve-job-session.mjs <jobId>')
  process.exit(2)
}

async function getToken() {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 1800 }),
  })
  const d = await res.json()
  if (!d.token) throw new Error(`Clerk token failed: ${JSON.stringify(d).slice(0, 300)}`)
  return d.token
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: job, error } = await sb.from('content_jobs').select('*').eq('id', jobId).single()
  if (error || !job) throw new Error(`job load failed: ${error?.message || 'not found'}`)
  const content = job.content ? String(job.content) : ''
  const audit = job.audit_json || {}
  const blockers = Array.isArray(audit.blockers)
    ? audit.blockers.length
    : typeof audit.blockers === 'number'
      ? audit.blockers
      : 0
  const gatePass = audit.shipReady === true && blockers === 0
  console.log(JSON.stringify({
    id: job.id,
    title: job.title || job.topic,
    status: job.status,
    region: job.region,
    content_type: job.content_type,
    contentLen: content.length,
    shipReady: audit.shipReady,
    blockers,
    gatePass,
  }, null, 2))
  if (!gatePass) {
    console.error('REFUSING: jobPassesShipGate would fail (shipReady/blockers). No bypass.')
    process.exit(1)
  }
  if (!content.trim()) {
    console.error('REFUSING: no content on job row')
    process.exit(1)
  }
  if (job.status === 'merged') {
    console.log('Already merged — nothing to do')
    writeFileSync(resolve(root, 'tmp/approve-job-result.json'), JSON.stringify({ alreadyMerged: true, job }, null, 2))
    return
  }

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const token = await getToken()
  const loginUrl = `${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`
  console.log('Signing in…')
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(8000)
  console.log('Auth URL:', page.url())

  console.log('PATCH approve…')
  const approval = await page.evaluate(async ({ jobId, content }) => {
    const r = await fetch('/api/content-studio/jobs', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, action: 'approve', content }),
    })
    const body = await r.json().catch(() => ({ _parse: 'failed' }))
    return { status: r.status, body }
  }, { jobId, content })

  console.log('HTTP', approval.status)
  console.log(JSON.stringify(approval.body, null, 2).slice(0, 4000))
  writeFileSync(
    resolve(root, 'tmp/approve-job-result.json'),
    JSON.stringify({ at: new Date().toISOString(), jobId, approval }, null, 2),
  )

  const { data: after } = await sb
    .from('content_jobs')
    .select('id,status,pr_url,pr_number,deploy_sha,content_path,canonical_url,merged_at,deployed_at,error_message,ship_mode')
    .eq('id', jobId)
    .single()
  console.log('AFTER', JSON.stringify(after, null, 2))
  writeFileSync(resolve(root, 'tmp/approve-job-after.json'), JSON.stringify(after, null, 2))

  await browser.close()
  if (approval.status < 200 || approval.status >= 300) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL:', e.message || e)
  process.exit(1)
})
