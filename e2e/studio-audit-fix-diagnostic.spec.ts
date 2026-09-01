/**
 * Studio audit/fix live diagnostic — opens up to three in-flight jobs from
 * the Document Vault / desk floor, clicks "✨ Audit & Fix" (fix_until_gates),
 * captures the reaudit API response + UI notice/error + console errors, and
 * reports what ships (or refuses to ship) toward Approve → main.
 *
 * Live run:
 *   PLAYWRIGHT_BASE_URL=https://portal.yousafeconsultancy.com \
 *     npx playwright test e2e/studio-audit-fix-diagnostic.spec.ts
 *
 * Auth: Clerk sign-in token for CLERK_TEST_EMAIL (admin@yousafeconsultancy.com)
 * using CLERK_SECRET_KEY from .env.test — no password entry required.
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://portal.yousafeconsultancy.com'

const ADMIN_EMAIL = process.env.CLERK_TEST_EMAIL || 'admin@yousafeconsultancy.com'

const PREFERRED_SLOTS: string[] = ['drafting', 'publishing', 'pending', 'pr_created']

interface PickJob { id: string; title: string; status: string }

interface FixRun {
  jobId: string
  title: string
  status: string
  reauditResponses: Array<{ status: number; url: string; body: string }>
  httpErrors: Array<{ status: number; url: string; body: string }>
  consoleErrors: string[]
  pageErrors: string[]
  editorText: string
  shipReady: boolean | null
  approveClicked: boolean
  approveResult: string
  openRoute: string
}

const runs: FixRun[] = []

async function loginAsAdmin(browser: Browser): Promise<Page> {
  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  }
  const userRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(ADMIN_EMAIL)}`,
    { headers: clerkHeaders },
  )
  const users = (await userRes.json()) as Array<{ id: string }>
  const userId = users?.[0]?.id
  if (!userId) throw new Error(`No Clerk user found for ${ADMIN_EMAIL}`)

  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const tokenBody = (await tokenRes.json()) as { token?: string }
  if (!tokenBody.token) throw new Error('Failed to create Clerk sign-in token')

  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  const page = await context.newPage()
  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(tokenBody.token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(
    (url) => !url.pathname.includes('/sign-in'),
    { timeout: 60_000 },
  )
  return page
}

function wireCapture(page: Page, run: FixRun): void {
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.includes('/api/')) return
    if (url.includes('/api/content-studio/reaudit')) {
      const status = res.status()
      let body = ''
      try {
        const text = await res.text()
        body = text.length > 4000
          ? `${text.slice(0, 4000)}\n…[truncated ${text.length} chars]`
          : text
      } catch { body = '<unreadable>' }
      run.reauditResponses.push({ status, url, body })
    } else if (res.status() >= 400) {
      let body = ''
      try {
        const text = await res.text()
        body = text.length > 1200 ? `${text.slice(0, 1200)}…` : text
      } catch { body = '<unreadable>' }
      run.httpErrors.push({ status: res.status(), url, body })
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') run.consoleErrors.push(msg.text().slice(0, 600))
  })
  page.on('pageerror', (err) => run.pageErrors.push(String(err).slice(0, 600)))
}

/** Locate the interactive editor container: JobDetail modal or review panel. */
async function editorContainer(page: Page) {
  const dialog = page.locator('[role="dialog"][aria-modal="true"]')
  if ((await dialog.count().catch(() => 0)) > 0) return dialog
  return page.locator('#studio-panel-draft-review > div').nth(2)
}

async function openJob(page: Page, jobId: string): Promise<string> {
  // Clear any modal left open by a previous run so it cannot intercept clicks.
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(1500)
  await page.locator('[role="dialog"][aria-modal="true"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  // Try every route that exposes a job row, first match wins.
  const routes: Array<{ testid: string; tab?: string }> = [
    { testid: `desk-slip-${jobId}` },
    { testid: `studio-review-draft-${jobId}` },
    { testid: `studio-approve-draft-row-${jobId}`, tab: 'approve' },
    { testid: `studio-approve-row-${jobId}`, tab: 'approve' },
  ]
  for (const route of routes) {
    const loc = page.getByTestId(route.testid)
    if (route.tab) {
      await page.locator(`#studio-tab-${route.tab}`).click({ force: true }).catch(() => {})
    }
    if (await loc.count().catch(() => 0)) {
      await loc.scrollIntoViewIfNeeded().catch(() => {})
      await loc.click({ force: true }).catch(() => {})
      return route.testid
    }
  }
  return 'no-visible-row'
}

async function readEditorState(page: Page): Promise<string> {
  const dialog = page.locator('[role="dialog"][aria-modal="true"]')
  try {
    if (await dialog.count()) return (await dialog.allTextContents()).join('\n').slice(0, 6000)
  } catch { /* fall through */ }
  try {
    const wrapper = page.locator('#studio-panel-draft-review > div').nth(2)
    if (await wrapper.count()) return (await wrapper.allTextContents()).join('\n').slice(0, 6000)
  } catch { /* fall through */ }
  return (await page.locator('body').allTextContents()).join('\n').slice(0, 4000)
}

async function waitForFixCompletion(page: Page, timeoutMs: number): Promise<void> {
  const editor = await editorContainer(page)
  const fixButton = editor.getByRole('button', { name: /Audit & Fix/ })
  const deadline = Date.now() + timeoutMs
  const settledAt = Date.now() + 12_000
  while (Date.now() < deadline) {
    const text = await editor.allTextContents().catch(() => [])
    const joined = text.join('\n')
    const noticeDone = /Audit & Fix (complete|paused for review|stopped with blockers)/.test(joined)
    const errorDone = /(No countable body words|Audit & Fix failed|Error\b|failed)/i.test(joined)
    const scoreDone = /Quality gate (passed|blocked)/.test(joined)
    const fixing = (await fixButton.isDisabled().catch(() => true)) ||
      /\(\d+s\)|(click to cancel)/.test((await fixButton.allTextContents().catch(() => ['']))[0] || '')
    if (Date.now() > settledAt && !fixing && (noticeDone || errorDone || scoreDone)) return
    await page.waitForTimeout(3000)
  }
}

/** Capture the reaudit payload's error summary for the summary print. */
function summarizeRun(r: FixRun): string {
  const parts: string[] = []
  for (const x of r.reauditResponses) {
    const lines = x.body.split('\n').filter((l) => /error|failed|blocker|held|exception|throw/i.test(l)).slice(0, 3).join(' | ')
    parts.push(`reaudit HTTP ${x.status}${lines ? ` :: ${lines.slice(0, 260)}` : ''}`)
  }
  if (!parts.length) parts.push('no reaudit response captured')
  const errs = [...r.httpErrors.slice(0, 3).map((e) => `HTTP ${e.status} ${e.url.split('/').slice(-2).join('/')} :: ${e.body.slice(0, 160)}`), ...r.consoleErrors.slice(0, 3), ...r.pageErrors.slice(0, 3)]
  if (errs.length) parts.push(`errors: ${errs.join(' || ').slice(0, 500)}`)
  const notice = r.editorText.match(/(Audit & Fix [^\n]*|No countable body words[^\n]*|Error[^\n]{0,120}|FAIL: [^\n]*|PASS: [^\n]*)/i)?.[0]
  if (notice) parts.push(`editor: ${notice.slice(0, 300)}`)
  parts.push(`shipReady=${r.shipReady} approve=${r.approveClicked ? 'clicked' : 'not-clicked'} ${r.approveResult ? `appr:${r.approveResult.slice(0, 220)}` : ''}`)
  return parts.join('\n  ')
}

test.describe('Studio · Audit & Fix live diagnostic', () => {
  test.describe.configure({ mode: 'serial' })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await loginAsAdmin(browser)
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    console.log('\n════════ DIAGNOSTIC SUMMARY ════════')
    for (const r of runs) {
      console.log(`\n■ ${r.title} [${r.status}] id=${r.jobId} openVia=${r.openRoute}`)
      console.log(`  ${summarizeRun(r).split('\n').map((l) => `  ${l}`).join('\n')}`)
    }
    console.log('════════ END ════════')
    await page?.context()?.close()
  })

  test('pick in-flight jobs from the desk floor', async () => {
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.getByTestId('studio-live-desk').waitFor({ timeout: 120_000 })

    // Read the floor slips (in-flight jobs, max 6 shown) directly from the DOM.
    const slips = page.locator('[data-testid^="desk-slip-"]')
    await slips.first().waitFor({ timeout: 60_000 }).catch(() => {})
    const seen: PickJob[] = []
    const count = await slips.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      const slip = slips.nth(i)
      const id = String(await slip.getAttribute('data-testid')).replace('desk-slip-', '')
      const children = slip.locator(':scope > div')
      const statusText = (await children.nth(0).textContent().catch(() => '')) || ''
      const title = (await children.nth(1).textContent().catch(() => ''))?.trim() || id
      const status = (statusText.match(/(pending|drafting|publishing|pr_created|failed)/i)?.[1] || 'pending').toLowerCase()
      seen.push({ id, title, status })
    }

    // Prefer drafting → publishing → pending → pr_created; accept failed as last resort.
    const picked = PREFERRED_SLOTS
      .flatMap((s) => seen.filter((j) => j.status === s))
      .concat(seen.filter((j) => j.status === 'failed'))
      .slice(0, 3)

    console.log('JOBS ON FLOOR:', JSON.stringify(seen, null, 1))
    console.log('PICKED:', JSON.stringify(picked, null, 1))
    test.info().annotations.push({ type: 'picked', description: JSON.stringify(picked, null, 2) })
    expect(picked.length).toBeGreaterThan(0)
    ;(globalThis as Record<string, unknown>).__pickedJobs = picked
  })

  for (let slot = 0; slot < 3; slot++) {
    test(`run Audit & Fix on job #${slot + 1}`, async () => {
      test.setTimeout(480_000)
      const picked = ((globalThis as Record<string, unknown>).__pickedJobs || []) as PickJob[]
      const job = picked[slot]
      if (!job) {
        test.info().annotations.push({ type: 'skip', description: 'fewer than 3 in-flight jobs' })
        return
      }
      const run: FixRun = {
        jobId: job.id, title: job.title, status: job.status,
        reauditResponses: [], httpErrors: [], consoleErrors: [], pageErrors: [],
        editorText: '', shipReady: null, approveClicked: false, approveResult: '', openRoute: '',
      }
      runs.push(run)
      wireCapture(page, run)

      run.openRoute = await openJob(page, job.id)
      if (run.openRoute === 'no-visible-row') {
        run.approveResult = 'job row not visible on page'
        test.info().annotations.push({ type: 'job-run', description: `${job.title}: row not visible` })
        return
      }

      const dialog = page.locator('[role="dialog"][aria-modal="true"]')
      await dialog.waitFor({ timeout: 5_000 }).catch(() => {})
      const editor = await editorContainer(page)
      const fixButton = editor.getByRole('button', { name: /Audit & Fix/ })
      await fixButton.waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {})

      const visible = await fixButton.isVisible().catch(() => false)
      if (!visible) {
        run.editorText = await readEditorState(page)
        run.approveResult = 'no Audit & Fix button visible'
        test.info().annotations.push({ type: 'job-run', description: `${job.title}: no Audit & Fix button` })
        return
      }

      await page.screenshot({ path: `test-results/audit-fix-${slot + 1}-before.png` })
      const clickTime = Date.now()
      await fixButton.click()
      await waitForFixCompletion(page, 420_000)
      const elapsed = Math.round((Date.now() - clickTime) / 1000)

      run.editorText = await readEditorState(page)
      run.shipReady = (await editor.getByText(/✓ Ship gate: ready/).count().catch(() => 0)) > 0

      // Attempt Approve → main if the gate is ready — capture whatever happens.
      const approve = page.getByTestId('studio-approve-main')
      if ((await approve.count().catch(() => 0)) > 0) {
        if (await approve.isDisabled().catch(() => true)) {
          run.approveResult = 'approve disabled (gate not ready)'
        } else {
          run.approveClicked = true
          await approve.click()
          await page.waitForTimeout(15_000)
          run.approveResult = await readEditorState(page)
        }
      } else {
        run.approveResult = 'approve button not rendered'
      }
      await page.screenshot({ path: `test-results/audit-fix-${slot + 1}-after.png` })
      test.info().annotations.push({ type: 'job-run', description: `${job.title}: ${elapsed}s` })

      // Close the modal so the next job's slips are clickable.
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(1500)
      await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
    })
  }
})