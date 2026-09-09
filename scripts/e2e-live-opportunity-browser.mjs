/**
 * Live browser confirmation: one Discover opportunity through Content Studio.
 *
 * Discover → Build brief → Generate Full Brief → Generate Draft →
 * Harper Review / Audit & Fix → Approve.
 *
 * Auth (preferred): PORTAL_EMAIL + PORTAL_PASSWORD (Clerk form on /sign-in/admin)
 * Fallback: CLERK_TICKET or CLERK_TICKET_FILE
 *
 * Approve is attempted only when the ship gate is green. Partial drafts are
 * not forced through merge.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const PORTAL = process.env.PLAYWRIGHT_BASE_URL || 'https://portal.yousafeconsultancy.com'
const OUT = process.env.STUDIO_E2E_OUT || '/workspace/screenshots/studio-e2e'
mkdirSync(OUT, { recursive: true })

const notes = []
const verdict = {
  ok: false,
  stage: 'start',
  url: '',
  opportunity: null,
  briefAuthor: null,
  briefReady: false,
  seoIntelAutoLocked: false,
  draftStarted: false,
  draftComplete: false,
  draftWords: 0,
  reviewOpened: false,
  auditFixClicked: false,
  harperReviewClicked: false,
  shipReady: false,
  approveClicked: false,
  approveConfirmed: false,
  errors: [],
}

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  notes.push(line)
  writeFileSync(resolve(OUT, 'notes.txt'), notes.join('\n') + '\n')
}

async function shot(page, name) {
  const p = resolve(OUT, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true }).catch(() => page.screenshot({ path: p }))
  log(`screenshot ${name}`)
  return p
}

async function recoverSnag(page) {
  const snag = page.getByText(/We hit a snag/i)
  if (await snag.count()) {
    log('error boundary visible — clicking Try again')
    await page.getByRole('button', { name: /Try again/i }).first().click().catch(() => {})
    await snag.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
  }
}

async function clerkFormLogin(page, email, password) {
  log(`form login as ${email}`)
  await page.goto(`${PORTAL}/sign-in/admin?return_to=${encodeURIComponent('/dashboard/admin/content')}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForTimeout(1500)
  await shot(page, '00-sign-in')

  const root = page.locator('.cl-signIn-root')
  const emailBox = root.locator('input[name="identifier"]').first()
  await emailBox.waitFor({ timeout: 25_000 })
  await emailBox.fill(email)
  await root.getByRole('button', { name: /^continue$/i }).click()

  const passBox = root.locator('input[name="password"]:not([disabled])')
  await passBox.waitFor({ state: 'visible', timeout: 25_000 })
  await passBox.fill(password)
  await root.getByRole('button', { name: /^continue$/i }).click()

  await page.waitForTimeout(2500)
  const url = page.url()
  if (/factor|mfa|verify|totp|code/i.test(url) || await page.getByText(/verification code|authenticator|two-factor/i).count()) {
    await shot(page, '00-mfa-blocked')
    throw new Error(`Clerk asked for a second factor at ${url}`)
  }

  await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 45_000 })
  log(`logged in ${page.url()}`)
}

async function clerkTicketLogin(page, ticket) {
  log(`ticket login len=${ticket.length}`)
  const ticketUrl = `${PORTAL}/sign-in/student?__clerk_ticket=${encodeURIComponent(ticket)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 45_000 })
}

function loadTicket() {
  if (process.env.CLERK_TICKET) return process.env.CLERK_TICKET.trim()
  const file = process.env.CLERK_TICKET_FILE || '/tmp/clerk-ticket.txt'
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  return ''
}

async function clickFirst(page, names, label) {
  for (const name of names) {
    const btn = page.getByRole('button', { name }).first()
    if (await btn.count()) {
      const disabled = await btn.isDisabled().catch(() => false)
      if (disabled) {
        log(`${label}: "${name}" present but disabled`)
        continue
      }
      await btn.click({ force: true })
      log(`clicked ${label} via ${name}`)
      return true
    }
  }
  log(`${label}: no matching button`)
  return false
}

async function main() {
  const email = (process.env.PORTAL_EMAIL || '').trim()
  const password = process.env.PORTAL_PASSWORD || ''
  const ticket = loadTicket()
  if (!email && !ticket) throw new Error('Set PORTAL_EMAIL+PORTAL_PASSWORD or CLERK_TICKET')

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(45_000)
  page.on('pageerror', (err) => {
    verdict.errors.push(`pageerror: ${err.message}`)
    log(`pageerror ${err.message}`)
  })

  try {
    verdict.stage = 'auth'
    if (email && password) await clerkFormLogin(page, email, password)
    else await clerkTicketLogin(page, ticket)

    if (!page.url().includes('/dashboard')) {
      throw new Error(`auth did not land on dashboard: ${page.url()}`)
    }
    await page.goto(`${PORTAL}/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await recoverSnag(page)
    await page.waitForTimeout(3000)
    verdict.url = page.url()
    await shot(page, '01-studio-loaded')

    verdict.stage = 'discover'
    const discoverTab = page.locator('#studio-tab-discover')
    if (await discoverTab.count()) {
      await discoverTab.click({ force: true })
      await page.waitForTimeout(2000)
    }
    await recoverSnag(page)
    await shot(page, '02-discover')

    const buildBrief = page.getByRole('button', { name: /Build brief/i }).first()
    const radarBrief = page.getByRole('button', { name: /✏️ Brief|^Brief$/ }).first()
    const continueResearch = page.getByRole('button', { name: /Continue to Research|Send to Research/i }).first()

    let picked = null
    if (await buildBrief.count()) {
      picked = { via: 'build-brief', title: (await buildBrief.evaluate((el) => el.closest('div')?.innerText || '')).split('\n').filter(Boolean)[0] || '' }
      await buildBrief.click()
    } else if (await radarBrief.count()) {
      picked = { via: 'radar-brief', title: (await radarBrief.evaluate((el) => el.parentElement?.innerText || '')).split('\n').filter(Boolean)[0] || '' }
      await radarBrief.click()
    } else if (await continueResearch.count()) {
      picked = { via: 'continue-research', title: '' }
      await continueResearch.click()
    } else {
      const checkbox = page.locator('input[type="checkbox"]').nth(1)
      if (await checkbox.count()) {
        await checkbox.check({ force: true }).catch(() => checkbox.click({ force: true }))
        await page.waitForTimeout(400)
        const send = page.getByRole('button', { name: /Send to Research|Continue to Research/i }).first()
        if (await send.count()) {
          picked = { via: 'checkbox-send', title: '' }
          await send.click()
        }
      }
    }
    if (!picked) throw new Error('No live opportunity control found on Discover')
    verdict.opportunity = picked
    log(`picked via=${picked.via} title=${String(picked.title).slice(0, 180)}`)
    await page.waitForTimeout(1500)
    await shot(page, '03-after-confirm')

    verdict.stage = 'research'
    const researchTab = page.locator('#studio-tab-research')
    if (await researchTab.count()) {
      await researchTab.click({ force: true })
      await page.waitForTimeout(1500)
    }
    await recoverSnag(page)
    const assembly = page.getByTestId('studio-brief-assembly')
    await assembly.waitFor({ state: 'visible', timeout: 30_000 })
    await shot(page, '04-research')

    const topicVal = await page.locator('input, textarea').evaluateAll((els) => {
      const hit = els.find((el) => (el.value || '').trim().length > 3)
      return hit ? String(hit.value).slice(0, 200) : ''
    }).catch(() => '')
    if (topicVal) {
      verdict.opportunity = { ...picked, topic: topicVal }
      log(`topic field=${topicVal}`)
    }

    const genBriefBtn = page.getByRole('button', { name: /Generate Full Brief|Rebuild complete brief/i }).first()
    await genBriefBtn.waitFor({ state: 'visible', timeout: 15_000 })
    if (await genBriefBtn.isDisabled()) {
      log('Generate Full Brief disabled — seeding topic if empty')
      const topicBox = assembly.locator('input').first()
      if (await topicBox.count()) {
        const v = await topicBox.inputValue().catch(() => '')
        if (!v.trim()) await topicBox.fill('UK student visa financial requirement')
      }
    }
    await genBriefBtn.click()
    log('clicked Generate Full Brief')
    await page.waitForTimeout(2500)
    await shot(page, '05-brief-generating')

    await page.waitForFunction(() => {
      const txt = document.body.innerText || ''
      if (/YMYL author|marketplace citation|Canonical handoff is complete|LOCKED INTO WRITER CONTRACT/i.test(txt)) return true
      if (/Brief readiness[\s\S]{0,80}100%/i.test(txt) && !/building contract/i.test(txt)) return true
      if (/timed out after 3 minutes|brief generation failed/i.test(txt)) return 'error'
      return false
    }, { timeout: 220_000 }).catch(() => log('brief wait timed out'))

    const bodyText = await page.locator('body').innerText()
    const authorMatch = bodyText.match(/YMYL author[^\n]*\n([^\n]+)/i)
    if (authorMatch) verdict.briefAuthor = authorMatch[1].trim().slice(0, 200)
    verdict.seoIntelAutoLocked = /LOCKED INTO WRITER CONTRACT/i.test(bodyText)
    verdict.briefReady = /Canonical handoff is complete|Brief readiness[\s\S]{0,80}100%/i.test(bodyText) || verdict.seoIntelAutoLocked
    log(`author=${verdict.briefAuthor || 'none'} ready=${verdict.briefReady} autoLock=${verdict.seoIntelAutoLocked}`)
    await shot(page, '06-brief-result')
    writeFileSync(resolve(OUT, 'brief-body.txt'), bodyText.slice(0, 20_000))

    verdict.stage = 'seo-intel'
    if (!verdict.briefReady || !verdict.seoIntelAutoLocked) {
      const analyzeSeo = page.getByRole('button', { name: /Analyze SEO/i }).first()
      if (await analyzeSeo.count()) {
        log('clicking Analyze SEO (intel not auto-locked)')
        await analyzeSeo.click()
        await page.waitForTimeout(1500)
        await page.getByText(/Internal links|Opportunity|Coverage|confidence/i).first().waitFor({ timeout: 60_000 }).catch(() => {})
        await page.waitForTimeout(4000)
        await shot(page, '06b-seo-analyzed')
      }
      const genSeoBrief = page.getByRole('button', { name: /Generate SEO Brief/i }).first()
      if (await genSeoBrief.count() && !(await genSeoBrief.isDisabled())) {
        await genSeoBrief.click()
        log('clicked Generate SEO Brief')
        await page.getByText(/LOCKED INTO WRITER CONTRACT|writer contract/i).first().waitFor({ timeout: 90_000 }).catch(() => log('seo brief lock text not seen'))
        await page.waitForTimeout(2000)
      }
    } else {
      log('SEO intel already locked by Generate Full Brief — skipping extra clicks')
    }
    await shot(page, '06c-seo-locked')
    const afterIntel = await page.locator('body').innerText()
    verdict.briefReady = /Canonical handoff is complete|100% contract complete|LOCKED INTO WRITER CONTRACT/i.test(afterIntel)
    log(`briefReady after intel=${verdict.briefReady}`)

    verdict.stage = 'draft'
    const genDraft = page.getByRole('button', { name: /Generate Draft/i }).first()
    await genDraft.waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /Generate Draft/i.test(b.textContent || ''))
      return Boolean(btn && !btn.disabled)
    }, { timeout: 90_000 }).catch(() => log('Generate Draft still disabled after 90s'))
    const canDraft = (await genDraft.count()) > 0 && !(await genDraft.isDisabled())
    log(`generate_draft_enabled=${canDraft}`)

    if (canDraft) {
      await genDraft.click()
      verdict.draftStarted = true
      log('clicked Generate Draft')
      await page.waitForTimeout(3000)
      const draftTab = page.locator('#studio-tab-draft')
      if (await draftTab.count()) await draftTab.click({ force: true }).catch(() => {})
      await shot(page, '07-draft-started')

      const started = Date.now()
      let pass = 0
      while (Date.now() - started < 720_000) {
        pass += 1
        const stats = await page.evaluate(() => {
          const preview = document.querySelector('[data-testid="studio-stream-document-body"], [data-testid="studio-stream-preview"]')
          const previewText = (preview?.textContent || '').trim()
          const body = document.body.innerText || ''
          const chars = body.match(/([\d,]+)\s*chars streamed/i)
          const nChars = chars ? parseInt(chars[1].replace(/,/g, ''), 10) : 0
          const wordsChip = body.match(/(\d[\d,]*)\s*w\s*\/\s*[\d,]+/)
          const nWords = wordsChip ? parseInt(wordsChip[1].replace(/,/g, ''), 10) : 0
          const writing = /● AI writing|AI is writing/i.test(body)
          const failed = /draft failed|generation failed|pipeline error/i.test(body)
          const complete = /Generation complete|Saved to job history|✓ Saved to job history/i.test(body) && !writing
          return { nChars, nWords, writing, failed, complete, previewLen: previewText.length }
        })
        log(`draft poll ${pass} chars=${stats.nChars} words=${stats.nWords} writing=${stats.writing} complete=${stats.complete} preview=${stats.previewLen}`)
        if (pass === 1 || pass % 4 === 0) await shot(page, `08-draft-live-${pass}`)
        if (stats.failed) {
          log('draft failed in UI')
          break
        }
        if (stats.complete) {
          verdict.draftComplete = true
          verdict.draftWords = stats.nWords
          break
        }
        await page.waitForTimeout(15_000)
      }

      await page.waitForTimeout(4000)
      await shot(page, '08-draft-live')
      const draftText = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="studio-stream-document-body"], [data-testid="studio-stream-preview"], [data-testid="studio-draft-workspace"]')
        return (el?.innerText || document.body.innerText || '').slice(0, 24_000)
      })
      if (!verdict.draftWords) verdict.draftWords = draftText.split(/\s+/).filter(Boolean).length
      writeFileSync(resolve(OUT, 'draft-body.txt'), draftText)
      log(`draft_words=${verdict.draftWords} complete=${verdict.draftComplete}`)
      await shot(page, '09-draft-result')
    } else {
      log('Generate Draft stayed locked')
      await shot(page, '07-draft-locked')
    }

    verdict.stage = 'review'
    const openedReview = await clickFirst(page, [/Continue to Review/i, /Review & fix/i, /Audit & Fix/i], 'open-review')
    verdict.reviewOpened = openedReview
    await page.waitForTimeout(2500)
    await shot(page, '10-review-open')

    const editorApprove = page.getByTestId('studio-editor-approve')
    const auditFix = page.getByRole('button', { name: /✨ Audit & Fix|Audit & Fix/i }).last()
    if (await auditFix.count() && !(await auditFix.isDisabled().catch(() => true))) {
      await auditFix.click({ force: true })
      verdict.auditFixClicked = true
      log('clicked Audit & Fix')
      await shot(page, '11-audit-fix-started')
      const auditStart = Date.now()
      while (Date.now() - auditStart < 480_000) {
        const state = await page.evaluate(() => {
          const body = document.body.innerText || ''
          return {
            busy: /Auditing & fixing|Reviewing…|Fixing…/i.test(body),
            ship: /ship gate passed|Approve → main|READY TO APPROVE/i.test(body),
            error: /Audit & Fix failed|Review returned no executable edit|editorial review failed/i.test(body),
          }
        })
        log(`audit poll busy=${state.busy} ship=${state.ship} error=${state.error}`)
        if (state.error) {
          verdict.errors.push('audit-fix reported an error')
          break
        }
        if (!state.busy && (state.ship || Date.now() - auditStart > 20_000)) break
        await page.waitForTimeout(12_000)
      }
      await shot(page, '12-audit-fix-done')
    } else {
      log('Audit & Fix not clickable — trying Harper Review')
    }

    const harperBtn = page.getByRole('button', { name: /^Review$|^Reviewing/ }).first()
    if (await harperBtn.count() && !(await harperBtn.isDisabled().catch(() => true))) {
      await harperBtn.click({ force: true })
      verdict.harperReviewClicked = true
      log('clicked Harper Review')
      await shot(page, '13-harper-started')
      const harperStart = Date.now()
      while (Date.now() - harperStart < 240_000) {
        const state = await page.evaluate(() => {
          const body = document.body.innerText || ''
          return {
            busy: /Reviewing…/i.test(body),
            done: /leftover issues were rewritten|Applied this pass|None — leftover/i.test(body),
            error: /Harper directives remain|Fresh Harper findings required|Editorial model review failed/i.test(body),
          }
        })
        log(`harper poll busy=${state.busy} done=${state.done} error=${state.error}`)
        if (state.error) {
          verdict.errors.push('harper review reported an error')
          break
        }
        if (!state.busy && (state.done || Date.now() - harperStart > 25_000)) break
        await page.waitForTimeout(10_000)
      }
      await shot(page, '14-harper-done')
    } else {
      log('Harper Review button not clickable')
    }

    const bodyAfterReview = await page.locator('body').innerText()
    writeFileSync(resolve(OUT, 'review-body.txt'), bodyAfterReview.slice(0, 20_000))
    verdict.shipReady = /ship gate passed|Approve → main|READY TO APPROVE/i.test(bodyAfterReview)
      && !/re-audit to confirm the ship gate/i.test(bodyAfterReview)
    log(`shipReady=${verdict.shipReady}`)

    verdict.stage = 'approve'
    const approveTab = page.locator('#studio-tab-approve')
    if (await approveTab.count()) {
      await approveTab.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1500)
      await shot(page, '15-approve-tab')
    }

    const approveBtn = page.getByTestId('studio-editor-approve').first()
    const approveShip = page.getByRole('button', { name: /Approve → main|APPROVE → SHIP/i }).first()
    let approveTarget = null
    if (await approveBtn.count() && !(await approveBtn.isDisabled().catch(() => true))) approveTarget = approveBtn
    else if (await approveShip.count() && !(await approveShip.isDisabled().catch(() => true))) approveTarget = approveShip

    if (approveTarget) {
      await approveTarget.click({ force: true })
      verdict.approveClicked = true
      log('clicked Approve')
      await page.waitForTimeout(800)
      await shot(page, '16-approve-confirm')
      const confirm = page.getByTestId('studio-approve-confirm-ok')
      if (await confirm.count()) {
        await confirm.click()
        verdict.approveConfirmed = true
        log('confirmed Approve → main')
      }
      const approveStart = Date.now()
      while (Date.now() - approveStart < 240_000) {
        const state = await page.evaluate(() => {
          const body = document.body.innerText || ''
          return {
            busy: /Approving…|opening|merging|monitoring/i.test(body),
            ok: /merged|live url|deploy|APPROVED/i.test(body),
            refused: /rhythm|too many ships|refusal/i.test(body),
            error: /approve failed|merge failed|ship failed/i.test(body),
          }
        })
        log(`approve poll busy=${state.busy} ok=${state.ok} refused=${state.refused} error=${state.error}`)
        if (state.ok || state.refused || state.error) {
          if (state.refused) verdict.errors.push('approve refused by ship rhythm')
          if (state.error) verdict.errors.push('approve failed')
          break
        }
        await page.waitForTimeout(10_000)
      }
      await shot(page, '17-approve-result')
    } else {
      log('Approve stayed disabled — ship gate not green; not forcing a merge')
      await shot(page, '16-approve-locked')
      const blockers = (await page.locator('body').innerText()).match(/blocker[s]?:?.{0,240}/gi)
      if (blockers) log(`blockers ${blockers.slice(0, 4).join(' | ')}`)
    }

    const finalBody = await page.locator('body').innerText()
    writeFileSync(resolve(OUT, 'final-body.txt'), finalBody.slice(0, 24_000))

    verdict.ok = Boolean(
      verdict.opportunity &&
      (verdict.briefReady || verdict.briefAuthor) &&
      verdict.draftStarted &&
      (verdict.reviewOpened || verdict.auditFixClicked || verdict.harperReviewClicked),
    )
    verdict.stage = 'done'
    verdict.url = page.url()
  } catch (err) {
    verdict.errors.push(String(err?.stack || err))
    log(`FAIL ${err}`)
    await shot(page, '99-failure').catch(() => {})
    verdict.url = page.url()
  } finally {
    writeFileSync(resolve(OUT, 'verdict.json'), JSON.stringify(verdict, null, 2))
    log(`VERDICT ${JSON.stringify(verdict)}`)
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
