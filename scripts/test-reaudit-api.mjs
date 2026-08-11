/**
 * Test the re-audit flow against the deployed API.
 * Creates a Clerk sign-in token, signs in, then calls re-audit on
 * the most recent job with gate failures.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

const PORTAL = 'https://portal.yousafeconsultancy.com'
const clerkKey = process.env.CLERK_SECRET_KEY
if (!clerkKey) { console.error('Missing CLERK_SECRET_KEY'); process.exit(1) }

async function fetchWithCookie(url, cookie, options = {}) {
  const headers = { ...(options.headers || {}), Cookie: cookie, 'Content-Type': 'application/json' }
  const res = await fetch(url, { ...options, headers, redirect: 'manual' })
  // Also return set-cookie
  return res
}

async function main() {
  // 1. Get a sign-in token
  console.log('1. Getting sign-in token...')
  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clerkKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm', expires_in_seconds: 120 }),
  })
  const { token } = await tokenRes.json()
  if (!token) { console.error('No token'); process.exit(1) }
  console.log('   Token obtained')

  // 2. Sign in and get session cookie
  console.log('2. Signing in...')
  const signInRes = await fetch(`${PORTAL}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=/dashboard/admin/content`, {
    redirect: 'manual',
  })
  const cookies = signInRes.headers.get('set-cookie') || ''
  // Extract __session cookie
  const sessionMatch = cookies.match(/__session=([^;]+)/)
  if (!sessionMatch) { 
    console.error('No session cookie. Headers:', Object.fromEntries(signInRes.headers.entries()))
    process.exit(1)
  }
  const sessionCookie = `__session=${sessionMatch[1]}`
  console.log('   Session cookie obtained')

  // 3. Get the list of jobs to find one with gate failures
  console.log('3. Fetching jobs...')
  const jobsRes = await fetch(`${PORTAL}/api/content-studio/jobs?limit=20&status=drafting`, {
    headers: { Cookie: sessionCookie },
  })
  const jobsData = await jobsRes.json()
  const jobs = jobsData.jobs || jobsData.data || []
  console.log(`   Found ${jobs.length} drafting jobs`)

  // Find a job with gate failures (low score or warnings)
  let targetJob = null
  for (const j of jobs) {
    const audit = j.audit_json
    const score = j.seo_score || audit?.score || 0
    const warnings = audit?.warnings?.length || 0
    if (warnings > 0 || (score > 0 && score < 90)) {
      targetJob = j
      console.log(`   Target job: ${j.title} (score=${score}, warnings=${warnings})`)
      break
    }
  }

  if (!targetJob) {
    console.log('   No jobs with gate failures found. Checking all job statuses...')
    const allRes = await fetch(`${PORTAL}/api/content-studio/jobs?limit=50`, {
      headers: { Cookie: sessionCookie },
    })
    const allData = await allRes.json()
    const allJobs = allData.jobs || allData.data || []
    for (const j of allJobs) {
      const audit = j.audit_json
      const score = j.seo_score || audit?.score || 0
      const warnings = audit?.warnings?.length || 0
      const blockers = audit?.blockers?.length || 0
      console.log(`   - ${j.status} | ${j.title.slice(0, 50)} | score=${score} | w=${warnings} | b=${blockers}`)
    }
    console.log('   No draft with gate failures found — all may have been cleared or no drafts exist.')
    return
  }

  // 4. Call re-audit
  console.log(`4. Running re-audit on job ${targetJob.id}...`)
  const reauditRes = await fetch(`${PORTAL}/api/content-studio/reaudit`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: targetJob.id,
      content: targetJob.content || '# Test content\n\nThis is test content for re-audit.',
      title: targetJob.title,
      type: targetJob.content_type || 'article',
      region: targetJob.region || 'US',
    }),
  })
  const reauditData = await reauditRes.json()
  console.log(`   Re-audit response:`)
  console.log(`   - ok: ${reauditData.ok}`)
  console.log(`   - score: ${reauditData.score}`)
  console.log(`   - blockers: ${reauditData.blockers}`)
  console.log(`   - warnings: ${reauditData.warnings}`)
  console.log(`   - shipReady: ${reauditData.shipReady}`)
  
  if (reauditData.applied?.length) {
    console.log(`   - applied repairs (${reauditData.applied.length}):`)
    for (const repair of reauditData.applied) {
      console.log(`     ✓ ${repair}`)
    }
  } else {
    console.log(`   - no applied repairs listed`)
  }

  if (reauditData.warningsData) {
    console.log(`   - warningsData present: ${JSON.stringify(reauditData.warningsData).length} chars`)
  }

  if (reauditData.annotations?.length) {
    console.log(`   - annotations:`)
    for (const a of reauditData.annotations.slice(0, 8)) {
      console.log(`     [${a.severity}] ${a.code}: ${a.message}`)
    }
  }

  console.log('\n--- Full response keys:', Object.keys(reauditData).join(', '))
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
